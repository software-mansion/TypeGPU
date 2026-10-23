/**
 * Builds every example in every variant, then measures the resulting JS bundle:
 * - raw / gzip / brotli size
 * - bytes spent on 'use gpu' metadata wrappers (JS impl, AST, externals, glue) and auto-naming
 * - bytes per source group (via sourcemaps)
 *
 * Usage: node measure.ts [--skip-build]
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { parse } from '@babel/parser';
import { TraceMap, eachMapping } from '@jridgewell/trace-mapping';

const EXAMPLES = [
  'image-processing/monocular-light-injection',
  'image-processing/selfie-segmentation',
  'rendering/os-awards',
  'rendering/jelly-slider',
];

const VARIANTS: Record<string, Record<string, string>> = {
  baseline: {},
  minify: { MINIFY: '1' },
  'no-autoname': { NONAME: '1' },
  'obfuscate+minify': { OBFUSCATE: '1', MINIFY: '1' },
  strip: { STRIP: '1' },
  'strip+obfuscate+minify': { STRIP: '1', OBFUSCATE: '1', MINIFY: '1' },
};

// e.g. VARIANTS=baseline,obfuscate+minify
const selectedVariants = process.env.VARIANTS?.split(',') ?? Object.keys(VARIANTS);
// Where builds and results go, to compare builds of different branches
const distRoot = process.env.DIST ?? 'dist';
const resultsFile = process.env.RESULTS ?? 'results.json';

const skipBuild = process.argv.includes('--skip-build');
const here = import.meta.dirname;

type Node = { type: string; start: number; end: number; [key: string]: unknown };

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as Node).type === 'string';
}

function walk(node: Node, visit: (node: Node, parent: Node | undefined) => void, parent?: Node) {
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'extra') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) if (isNode(c)) walk(c, visit, node);
    } else if (isNode(child)) {
      walk(child, visit, node);
    }
  }
}

function propName(prop: Node): string | undefined {
  const key = prop.key as Node | undefined;
  return (key?.name as string) ?? (key?.value as string);
}

/** The v3 helper: `(f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f)` */
function isMetaHelperSource(code: string, node: Node) {
  const src = code.slice(node.start, node.end);
  const params = node.params as Node[] | undefined;
  return (
    params?.length === 2 &&
    params[1].type === 'RestElement' &&
    /__TYPEGPU_META__\s*\?\?=\s*new WeakMap/.test(src) &&
    src.includes('.set(')
  );
}

function analyzeMetadata(code: string) {
  const ast = parse(code, { sourceType: 'module' }).program as unknown as Node;
  const parents = new Map<Node, Node | undefined>();
  const stats = {
    fnCount: 0,
    jsImpl: 0,
    ast: 0,
    externals: 0,
    nameField: 0,
    glue: 0,
    /** v3: bytes of the per-module helper declarations */
    helpers: 0,
    autonameCount: 0,
    autonameGlue: 0,
  };

  // v3 helpers get renamed by minifiers, so we find them by what they do
  const helperNames = new Set<string>();
  walk(ast, (node) => {
    const fn = node.type === 'VariableDeclarator' ? (node.init as Node | undefined) : node;
    const id = node.id as Node | undefined;
    if (
      (node.type === 'VariableDeclarator' || node.type === 'FunctionDeclaration') &&
      id?.type === 'Identifier' &&
      fn &&
      /Function/.test(fn.type) &&
      isMetaHelperSource(code, fn)
    ) {
      helperNames.add(id.name as string);
      stats.helpers += node.end - node.start;
    }
  });

  walk(ast, (node, parent) => {
    parents.set(node, parent);
    if (node.type !== 'CallExpression') return;
    const callee = node.callee as Node;
    const args = node.arguments as Node[];

    // (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (impl), { v, name, ast, externals })
    if (
      callee.type === 'MemberExpression' &&
      (callee.property as Node).name === 'set' &&
      args[0]?.type === 'AssignmentExpression' &&
      args[1]?.type === 'ObjectExpression' &&
      code.slice(callee.start, callee.end).includes('__TYPEGPU_META__')
    ) {
      stats.fnCount++;
      const impl = args[0].right as Node;
      stats.jsImpl += impl.end - impl.start;
      let metaInner = 0;
      for (const prop of args[1].properties as Node[]) {
        const len = prop.end - prop.start;
        const name = propName(prop);
        if (name === 'ast') stats.ast += len;
        else if (name === 'externals') stats.externals += len;
        else if (name === 'name') stats.nameField += len;
        else continue;
        metaInner += len;
      }
      // The outermost wrapper is `(e => ... && e.f)({})`
      let outer: Node = node;
      for (let p = parents.get(node); p; p = parents.get(p)) {
        outer = p;
        if (p.type === 'CallExpression' && (p.callee as Node).type === 'ArrowFunctionExpression') {
          break;
        }
      }
      stats.glue += outer.end - outer.start - (impl.end - impl.start) - metaInner;
    }

    // v3: helper(impl, json, externals, name?). Minifiers inline the helper when a module
    // only calls it once.
    const inlinedHelper = /Function/.test(callee.type) && isMetaHelperSource(code, callee);
    if (
      ((callee.type === 'Identifier' && helperNames.has(callee.name as string)) || inlinedHelper) &&
      /Literal/.test(args[1]?.type ?? '')
    ) {
      if (inlinedHelper) {
        stats.helpers += callee.end - callee.start;
      }
      stats.fnCount++;
      const [impl, json, externals, name] = args;
      stats.jsImpl += impl.end - impl.start;
      stats.ast += json.end - json.start;
      stats.externals += externals.end - externals.start;
      stats.nameField += name ? name.end - name.start : 0;
      stats.glue +=
        node.end -
        node.start -
        args.reduce((sum, a) => sum + a.end - a.start, 0) -
        (inlinedHelper ? callee.end - callee.start : 0);
    }

    // (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(exp, "label")
    if (
      code.slice(callee.start, callee.end).includes('__TYPEGPU_AUTONAME__') &&
      args.length === 2
    ) {
      stats.autonameCount++;
      stats.autonameGlue += node.end - node.start - (args[0].end - args[0].start);
    }
  });

  return stats;
}

function sourceGroup(source: string): string {
  if (source.includes('/packages/typegpu/src/shared/revive.ts')) return 'revive (strip runtime)';
  if (source.includes('/packages/typegpu/')) return 'typegpu';
  if (source.includes('/packages/tinyest/')) return 'tinyest';
  if (/\/packages\/typegpu-[^/]+\//.test(source)) return '@typegpu/* libs';
  if (source.includes('/examples/')) return 'example code';
  return 'other deps';
}

function attributeBytes(code: string, mapJson: string) {
  const map = new TraceMap(mapJson);
  const lines = code.split('\n');
  const segments: { line: number; col: number; group: string }[] = [];
  eachMapping(map, (m) => {
    segments.push({
      line: m.generatedLine,
      col: m.generatedColumn,
      group: m.source ? sourceGroup(m.source) : 'unmapped',
    });
  });
  const result: Record<string, number> = {};
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const next = segments[i + 1];
    const end = next && next.line === seg.line ? next.col : lines[seg.line - 1].length;
    result[seg.group] = (result[seg.group] ?? 0) + (end - seg.col);
  }
  return result;
}

const results: Record<string, Record<string, unknown>> = {};

for (const example of EXAMPLES) {
  results[example] = {};
  for (const variant of selectedVariants) {
    const env = VARIANTS[variant];
    const outDir = `${distRoot}/${variant}/${example}`;
    if (!skipBuild) {
      execFileSync('pnpm', ['exec', 'vite', 'build', '--logLevel', 'error'], {
        cwd: here,
        env: { ...process.env, ...env, EXAMPLE: example, OUT_DIR: outDir, SOURCEMAP: '1' },
        stdio: 'inherit',
      });
    }
    const assets = join(here, outDir, 'assets');
    const jsFile = readdirSync(assets).find((f) => f.endsWith('.js'));
    if (!jsFile) throw new Error(`No JS output for ${example} (${variant})`);
    const code = readFileSync(join(assets, jsFile), 'utf8');
    const map = readFileSync(join(assets, `${jsFile}.map`), 'utf8');
    const buf = Buffer.from(code);
    results[example][variant] = {
      raw: buf.length,
      gzip: gzipSync(buf, { level: 9 }).length,
      brotli: brotliCompressSync(buf, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }).length,
      metadata: analyzeMetadata(code),
      bySource: attributeBytes(code, map),
    };
    console.log(example, variant, results[example][variant]);
  }
}

writeFileSync(join(here, resultsFile), JSON.stringify(results, null, 2));
console.log(`Wrote ${resultsFile}`);
