// oxlint-disable typescript/no-explicit-any, unicorn/consistent-function-scoping -- measurement scripts working with untyped AST/metadata payloads
/**
 * Offline exploration of metadata encodings.
 *
 * Takes the bundles produced by `measure.ts`, finds every 'use gpu' metadata wrapper,
 * re-encodes it in a number of candidate formats, and reports the size of the resulting bundle.
 * The rewritten bundles are not meant to run, only to be measured, so the runtime for each
 * format is accounted for separately (see RUNTIME_COST).
 *
 * Usage: node formats.ts
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { parse } from '@babel/parser';

const here = import.meta.dirname;

const EXAMPLES = [
  'image-processing/monocular-light-injection',
  'image-processing/selfie-segmentation',
  'rendering/os-awards',
  'rendering/jelly-slider',
];
const BUILDS = (process.env.BUILDS ?? 'baseline,obfuscate+minify,strip+obfuscate+minify').split(
  ',',
);
const DIST = process.env.DIST ?? 'dist';

type Node = { type: string; start: number; end: number; [key: string]: unknown };
const isNode = (v: unknown): v is Node =>
  typeof v === 'object' && v !== null && typeof (v as Node).type === 'string';

function walk(node: Node, visit: (node: Node, parents: Node[]) => void, parents: Node[] = []) {
  visit(node, parents);
  const next = [...parents, node];
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'extra') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) if (isNode(c)) walk(c, visit, next);
    } else if (isNode(child)) {
      walk(child, visit, next);
    }
  }
}

/** Converts a literal-only babel expression into a JS value */
function literal(node: Node): unknown {
  switch (node.type) {
    case 'ArrayExpression':
      return (node.elements as Node[]).map(literal);
    case 'ObjectExpression':
      return Object.fromEntries(
        (node.properties as Node[]).map((p) => {
          const key = p.key as Node;
          return [(key.name as string) ?? (key.value as string), literal(p.value as Node)];
        }),
      );
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return node.value;
    case 'TemplateLiteral':
      return ((node.quasis as Node[])[0].value as { cooked: string }).cooked;
    case 'NullLiteral':
      return null;
    case 'UnaryExpression':
      if (node.operator === 'void') return undefined;
      if (node.operator === '!') return !literal(node.argument as Node);
      if (node.operator === '-') return -(literal(node.argument as Node) as number);
      break;
    case 'Identifier':
      if (node.name === 'undefined') return undefined;
  }
  throw new Error(`Not a literal: ${node.type}`);
}

export interface Meta {
  /** Range of the whole `(e => ...)({})` wrapper */
  start: number;
  end: number;
  impl: string;
  name: string | undefined;
  params: Param[];
  body: [0, unknown[]];
  externals: [key: string, value: string][];
}

type Param = { type: 'i'; name: string } | { type: 'd'; props: { name: string; alias: string }[] };

/**
 * Extracts every function's metadata from a bundle, in either the v2 or the v3 format.
 * v3 bundles are converted to the shape the encoders take (v2-like, numbers as source text).
 * `helperInits` are the ranges of v3 helper definitions, which re-encodings replace with `0`,
 * so that every format is re-encoded from the same base.
 */
export function extractWithHelpers(code: string): {
  metas: Meta[];
  helperInits: { start: number; end: number }[];
} {
  const v3 = extractV3(code);
  if (v3.metas.length > 0) {
    return v3;
  }
  return { metas: extractV2(code), helperInits: [] };
}

export function extract(code: string): Meta[] {
  return extractWithHelpers(code).metas;
}

function extractV3(code: string) {
  const ast = parse(code, { sourceType: 'module' }).program as unknown as Node;
  const helperNames = new Set<string>();
  const helperInits: { start: number; end: number }[] = [];
  walk(ast, (node) => {
    const id = node.id as Node | undefined;
    if (node.type !== 'VariableDeclarator' || id?.type !== 'Identifier') return;
    const init = node.init as Node | undefined;
    const src = init ? code.slice(init.start, init.end) : '';
    // The helper: `(f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f)`
    const params = init?.params as Node[] | undefined;
    if (
      init &&
      /Function/.test(init.type) &&
      params?.length === 2 &&
      params[1].type === 'RestElement' &&
      /__TYPEGPU_META__\s*\?\?=\s*new WeakMap/.test(src) &&
      src.includes('.set(')
    ) {
      helperNames.add(id.name as string);
      helperInits.push({ start: init.start, end: init.end });
    }
  });

  // Bare numbers in expression positions become `[5, text]` nodes (tags stay as they are)
  const textNumbers = (body: unknown) =>
    mapNodes(body, (n) => (typeof n === 'number' ? [N.numericLiteral, String(n)] : n));

  const metas: Meta[] = [];
  walk(ast, (node) => {
    const callee = node.callee as Node | undefined;
    if (node.type !== 'CallExpression' || !callee) {
      return;
    }
    // Minifiers inline the helper when a module only calls it once
    const helperParams = callee.params as Node[] | undefined;
    const src = code.slice(callee.start, callee.end);
    const inlinedHelper =
      /Function/.test(callee.type) &&
      helperParams?.length === 2 &&
      helperParams[1].type === 'RestElement' &&
      /__TYPEGPU_META__\s*\?\?=\s*new WeakMap/.test(src);
    if (
      !(
        (callee.type === 'Identifier' && helperNames.has(callee.name as string)) ||
        inlinedHelper
      ) ||
      !/Literal/.test((node.arguments as Node[])[1]?.type ?? '')
    ) {
      return;
    }
    const [impl, json, externals, name] = node.arguments as Node[];
    const [params, statements] = JSON.parse(literal(json) as string) as [
      (string | [string, string][])[],
      unknown[],
    ];
    metas.push({
      start: node.start,
      end: node.end,
      impl: code.slice(impl.start, impl.end),
      name: name ? (literal(name) as string) : undefined,
      params: params.map((p) =>
        typeof p === 'string'
          ? { type: 'i', name: p }
          : { type: 'd', props: p.map(([n, alias]) => ({ name: n, alias })) },
      ),
      body: textNumbers([N.block, statements]) as [0, unknown[]],
      externals: (externals.properties as Node[]).map((p) => {
        const key = p.key as Node;
        const body = (p.value as Node).body as Node;
        return [(key.name as string) ?? (key.value as string), code.slice(body.start, body.end)];
      }),
    });
  });
  return { metas, helperInits };
}

function extractV2(code: string): Meta[] {
  const ast = parse(code, { sourceType: 'module' }).program as unknown as Node;
  const metas: Meta[] = [];
  walk(ast, (node, parents) => {
    if (node.type !== 'CallExpression') return;
    const callee = node.callee as Node;
    const args = node.arguments as Node[];
    if (
      callee.type !== 'MemberExpression' ||
      (callee.property as Node).name !== 'set' ||
      args[0]?.type !== 'AssignmentExpression' ||
      args[1]?.type !== 'ObjectExpression' ||
      !code.slice(callee.start, callee.end).includes('__TYPEGPU_META__')
    ) {
      return;
    }
    const outer = parents.findLast(
      (p) => p.type === 'CallExpression' && (p.callee as Node).type === 'ArrowFunctionExpression',
    ) as Node;
    const props = Object.fromEntries(
      (args[1].properties as Node[]).map((p) => [
        ((p.key as Node).name as string) ?? ((p.key as Node).value as string),
        p.value as Node,
      ]),
    );
    const astValue = literal(props.ast) as { params: Param[]; body: [0, unknown[]] };
    const impl = args[0].right as Node;
    metas.push({
      start: outer.start,
      end: outer.end,
      impl: code.slice(impl.start, impl.end),
      name: literal(props.name) as string | undefined,
      params: astValue.params,
      body: astValue.body,
      externals: (props.externals.properties as Node[]).map((p) => {
        const key = p.key as Node;
        const fn = p.value as Node;
        const body = fn.body as Node;
        return [(key.name as string) ?? (key.value as string), code.slice(body.start, body.end)];
      }),
    });
  });
  return metas;
}

// --- AST transforms -------------------------------------------------------------------------

const N = {
  block: 0,
  binaryExpr: 1,
  assignmentExpr: 2,
  logicalExpr: 3,
  unaryExpr: 4,
  numericLiteral: 5,
  call: 6,
  memberAccess: 7,
  indexAccess: 8,
  identifier: 9,
  return: 10,
  if: 11,
  let: 12,
  const: 13,
  for: 14,
  while: 15,
  continue: 16,
  break: 17,
  forOf: 18,
  switch: 19,
  arrayExpr: 100,
  preUpdate: 101,
  postUpdate: 102,
  stringLiteral: 103,
  objectExpr: 104,
  conditionalExpr: 105,
  nullLiteral: 106,
  booleanLiteral: 107,
};

// Same as `parseNumericString` in typegpu's wgslGenerator
function parseNumericString(str: string): number {
  if (/^0x[0-9a-f]+$/i.test(str)) return Number.parseInt(str);
  if (/^0b[01]+$/i.test(str)) return Number.parseInt(str.slice(2), 2);
  return Number.parseFloat(str);
}

/**
 * Visits every expression/statement position of a tinyest tree, letting `fn` replace it.
 * Unlike a generic array walk, this knows which slots hold nodes.
 */
function mapNodes(node: unknown, fn: (node: unknown) => unknown): unknown {
  const m = (n: unknown) => mapNodes(n, fn);
  const mOpt = (n: unknown) => (n === null || n === undefined ? n : m(n));
  if (!Array.isArray(node)) return fn(node);
  const [t] = node;
  let out: unknown[];
  switch (t) {
    case N.block:
      out = [t, node[1].map(m)];
      break;
    case N.binaryExpr:
    case N.assignmentExpr:
    case N.logicalExpr:
      out = [t, m(node[1]), node[2], m(node[3])];
      break;
    case N.unaryExpr:
    case N.preUpdate:
    case N.postUpdate:
      out = [t, node[1], m(node[2])];
      break;
    case N.call:
      out = [t, m(node[1]), node[2].map(m)];
      break;
    case N.memberAccess:
      out = [t, m(node[1]), node[2]];
      break;
    case N.indexAccess:
      out = [t, m(node[1]), m(node[2])];
      break;
    case N.return:
      out = node.length > 1 ? [t, m(node[1])] : [t];
      break;
    case N.if:
      out = [t, m(node[1]), m(node[2]), ...(node.length > 3 ? [m(node[3])] : [])];
      break;
    case N.let:
    case N.const:
      out = [t, node[1], ...(node.length > 2 ? [m(node[2])] : [])];
      break;
    case N.for:
      out = [t, mOpt(node[1]), mOpt(node[2]), mOpt(node[3]), m(node[4])];
      break;
    case N.while:
      out = [t, m(node[1]), m(node[2])];
      break;
    case N.forOf:
      out = [t, m(node[1]), m(node[2]), m(node[3])];
      break;
    case N.switch:
      out = [
        t,
        m(node[1]),
        node[2].map(([test, cons]: [unknown, unknown[]]) => [mOpt(test), cons.map(m)]),
      ];
      break;
    case N.arrayExpr:
      out = [t, node[1].map(m)];
      break;
    case N.objectExpr:
      out = [
        t,
        Array.isArray(node[1])
          ? node[1].map(([k, v, c]: [unknown, unknown, boolean]) => [c ? m(k) : k, m(v), c])
          : Object.fromEntries(Object.entries(node[1]).map(([k, v]) => [k, m(v)])),
      ];
      break;
    case N.conditionalExpr:
      out = [t, m(node[1]), m(node[2]), m(node[3])];
      break;
    default:
      out = node; // literals, continue, break, identifier nodes
  }
  return fn(out);
}

/** [5, '0.5'] -> 0.5 */
const inlineNumbers = (body: unknown) =>
  mapNodes(body, (n) =>
    Array.isArray(n) && n[0] === N.numericLiteral ? parseNumericString(n[1] as string) : n,
  );

/** [5, '0.5'] -> [5, 0.5] (the node is kept, only the payload becomes a number) */
const numericPayloads = (body: unknown) =>
  mapNodes(body, (n) =>
    Array.isArray(n) && n[0] === N.numericLiteral
      ? [N.numericLiteral, parseNumericString(n[1] as string)]
      : n,
  );

/** References to externals become `[9, index]` (identifier node with a numeric payload) */
function refExternals(body: unknown, keys: string[]) {
  const index = new Map(keys.map((k, i) => [k, i]));
  return mapNodes(body, (n) =>
    typeof n === 'string' && index.has(n) ? [N.identifier, index.get(n)] : n,
  );
}

const blankStrings = (v: unknown): unknown =>
  typeof v === 'string'
    ? ''
    : Array.isArray(v)
      ? v.map(blankStrings)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blankStrings(x)]))
        : v;

// --- Prefix encoding (G) ---
// Tokens are comma-separated. First char decides the class:
//   digit → node tag (structure), '#' → number/boolean literal value, '~' → absent,
//   '"' → JSON-quoted string, anything else → bare identifier/operator
const bare = (s: string) =>
  s !== '' && !/^[0-9#~"]/.test(s) && !/[,'\\\n]/.test(s) ? s : JSON.stringify(s);

export function prefixEncode(node: unknown, out: string[] = []): string[] {
  const e = (n: unknown) => prefixEncode(n, out);
  const opt = (n: unknown) => (n === null || n === undefined ? out.push('~') : e(n));
  if (typeof node === 'string') {
    out.push(bare(node));
    return out;
  }
  if (typeof node === 'number' || typeof node === 'boolean') {
    out.push(`#${node}`);
    return out;
  }
  const n = node as any[];
  const t = n[0];
  // Operators and list lengths are glued to the tag: `1+`, `6.2` (call with 2 args)
  switch (t) {
    case N.numericLiteral:
      out.push(`#${parseNumericString(n[1])}`);
      break;
    case N.block:
    case N.arrayExpr:
      out.push(`${t}.${n[1].length}`);
      n[1].forEach(e);
      break;
    case N.binaryExpr:
    case N.assignmentExpr:
    case N.logicalExpr:
      out.push(`${t}${n[2]}`);
      e(n[1]);
      e(n[3]);
      break;
    case N.unaryExpr:
    case N.preUpdate:
    case N.postUpdate:
      out.push(`${t}${n[1]}`);
      e(n[2]);
      break;
    case N.call:
      out.push(`${t}.${n[2].length}`);
      e(n[1]);
      n[2].forEach(e);
      break;
    case N.memberAccess:
      out.push(String(t));
      e(n[1]);
      out.push(bare(n[2]));
      break;
    case N.indexAccess:
    case N.while:
      out.push(String(t));
      e(n[1]);
      e(n[2]);
      break;
    case N.return:
      out.push(String(t));
      opt(n[1]);
      break;
    case N.if:
      out.push(String(t));
      e(n[1]);
      e(n[2]);
      opt(n[3]);
      break;
    case N.let:
    case N.const:
      out.push(String(t));
      out.push(bare(n[1]));
      opt(n[2]);
      break;
    case N.for:
      out.push(String(t));
      opt(n[1]);
      opt(n[2]);
      opt(n[3]);
      e(n[4]);
      break;
    case N.forOf:
    case N.conditionalExpr:
      out.push(String(t));
      e(n[1]);
      e(n[2]);
      e(n[3]);
      break;
    case N.switch:
      out.push(`${t}.${n[2].length}`);
      e(n[1]);
      for (const [test, cons] of n[2]) {
        opt(test);
        out.push(String(cons.length));
        cons.forEach(e);
      }
      break;
    case N.objectExpr:
      if (Array.isArray(n[1])) {
        out.push(`${t}a${n[1].length}`);
        for (const [k, v, c] of n[1]) {
          if (c) e(k);
          else out.push(bare(k));
          e(v);
          out.push(`#${c}`);
        }
      } else {
        out.push(`${t}.${Object.keys(n[1]).length}`);
        for (const [k, v] of Object.entries(n[1])) {
          out.push(bare(k));
          e(v);
        }
      }
      break;
    case N.stringLiteral:
      out.push(String(t), JSON.stringify(n[1]));
      break;
    case N.booleanLiteral:
      out.push(`#${n[1]}`);
      break;
    case N.identifier:
      out.push(bare(n[1]));
      break;
    case N.continue:
    case N.break:
    case N.nullLiteral:
      out.push(String(t));
      break;
    default:
      throw new Error(`Unknown node ${t}`);
  }
  return out;
}

// --- Prefix encoding with single-char tags (G2) ---
// Node tags are single non-identifier characters, so the decoder dispatches on one charCode
export const TAG: Record<number, string> = {
  [N.block]: '{',
  [N.binaryExpr]: '(',
  [N.assignmentExpr]: '=',
  [N.logicalExpr]: '&',
  [N.unaryExpr]: '!',
  [N.call]: '@',
  [N.memberAccess]: '.',
  [N.indexAccess]: '[',
  [N.identifier]: '9',
  [N.return]: '^',
  [N.if]: '?',
  [N.let]: ';',
  [N.const]: ':',
  [N.for]: '%',
  [N.while]: '*',
  [N.continue]: '7',
  [N.break]: '8',
  [N.forOf]: '/',
  [N.switch]: '|',
  [N.arrayExpr]: ']',
  [N.preUpdate]: '+',
  [N.postUpdate]: '-',
  [N.stringLiteral]: '`',
  [N.objectExpr]: '}',
  [N.conditionalExpr]: ')',
  [N.nullLiteral]: '6',
};
const bare2 = (s: string) =>
  s !== '' && /^[A-Za-z_$]/.test(s) && !/[,'\\\n]/.test(s) ? s : JSON.stringify(s);

export function prefixEncode2(node: unknown, out: string[] = []): string[] {
  const e = (n: unknown) => prefixEncode2(n, out);
  const opt = (n: unknown) => (n === null || n === undefined ? out.push('~') : e(n));
  if (typeof node === 'string') {
    out.push(bare2(node));
    return out;
  }
  if (typeof node === 'number' || typeof node === 'boolean') {
    out.push(`#${node}`);
    return out;
  }
  const n = node as any[];
  const t = n[0];
  const T = TAG[t];
  switch (t) {
    case N.numericLiteral:
      out.push(`#${parseNumericString(n[1])}`);
      break;
    case N.booleanLiteral:
      out.push(`#${n[1]}`);
      break;
    case N.block:
    case N.arrayExpr:
      out.push(`${T}${n[1].length}`);
      n[1].forEach(e);
      break;
    case N.binaryExpr:
    case N.assignmentExpr:
    case N.logicalExpr:
      out.push(`${T}${n[2]}`);
      e(n[1]);
      e(n[3]);
      break;
    case N.unaryExpr:
    case N.preUpdate:
    case N.postUpdate:
      out.push(`${T}${n[1]}`);
      e(n[2]);
      break;
    case N.call:
      out.push(`${T}${n[2].length}`);
      e(n[1]);
      n[2].forEach(e);
      break;
    case N.memberAccess:
      out.push(T);
      e(n[1]);
      out.push(bare2(n[2]));
      break;
    case N.indexAccess:
    case N.while:
      out.push(T);
      e(n[1]);
      e(n[2]);
      break;
    case N.return:
      out.push(T);
      opt(n[1]);
      break;
    case N.if:
      out.push(T);
      e(n[1]);
      e(n[2]);
      opt(n[3]);
      break;
    case N.let:
    case N.const:
      out.push(T, bare2(n[1]));
      opt(n[2]);
      break;
    case N.for:
      out.push(T);
      opt(n[1]);
      opt(n[2]);
      opt(n[3]);
      e(n[4]);
      break;
    case N.forOf:
    case N.conditionalExpr:
      out.push(T);
      e(n[1]);
      e(n[2]);
      e(n[3]);
      break;
    case N.switch:
      out.push(`${T}${n[2].length}`);
      e(n[1]);
      for (const [test, cons] of n[2]) {
        opt(test);
        out.push(String(cons.length));
        cons.forEach(e);
      }
      break;
    case N.objectExpr:
      if (Array.isArray(n[1])) {
        out.push(`${T}a${n[1].length}`);
        for (const [k, v, c] of n[1]) {
          if (c) e(k);
          else out.push(bare2(k));
          e(v);
          out.push(`#${c}`);
        }
      } else {
        out.push(`${T}${Object.keys(n[1]).length}`);
        for (const [k, v] of Object.entries(n[1])) {
          out.push(bare2(k));
          e(v);
        }
      }
      break;
    case N.stringLiteral:
      out.push(T, JSON.stringify(n[1]));
      break;
    case N.identifier:
      out.push(T, bare2(n[1]));
      break;
    case N.continue:
    case N.break:
    case N.nullLiteral:
      out.push(T);
      break;
    default:
      throw new Error(`Unknown node ${t}`);
  }
  return out;
}

const prefixParams2 = (params: Param[]) => [
  String(params.length),
  ...params.flatMap((p) =>
    p.type === 'i'
      ? [bare2(p.name)]
      : ['#d', String(p.props.length), ...p.props.flatMap((x) => [bare2(x.name), bare2(x.alias)])],
  ),
];

const prefixParams = (params: Param[]) => [
  String(params.length),
  ...params.flatMap((p) =>
    p.type === 'i'
      ? [bare(p.name)]
      : ['#d', String(p.props.length), ...p.props.flatMap((x) => [bare(x.name), bare(x.alias)])],
  ),
];

const prefixInJs = (tokens: string[]) =>
  `'${tokens.join(',').replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

// --- Encodings ------------------------------------------------------------------------------

const js = (v: unknown) => JSON.stringify(v);
/** Like a minifier would print a literal: object keys unquoted when possible */
const jsLit = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(jsLit).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.entries(v)
          .map(([k, x]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : js(k)}:${jsLit(x)}`)
          .join(',')}}`
      : js(v);
/** Embeds JSON inside a JS string literal, picking the cheapest quote */
const jsonInJs = (v: unknown) => {
  const json = JSON.stringify(v);
  if (!json.includes("'")) return `'${json.replaceAll('\\', '\\\\')}'`;
  return JSON.stringify(json);
};
const externalsObj = (ext: Meta['externals']) =>
  `{${ext.map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : js(k)}:()=>${v}`).join(',')}}`;
const externalsArr = (ext: Meta['externals']) => `[${ext.map(([, v]) => `()=>${v}`).join(',')}]`;
const slimParams = (params: Param[]) =>
  params.map((p) => (p.type === 'i' ? p.name : p.props.map((x) => [x.name, x.alias])));
const stripDirective = (impl: string) =>
  impl.replace(/\{"use gpu";/, '{').replace(/\{`use gpu`;/, '{');

/** Helper definition, emitted once (or once per module) */
const HELPER = 'var M=(f,...m)=>((globalThis.__TYPEGPU_META__??=new WeakMap).set(f,m),f);';

export interface Format {
  label: string;
  description: string;
  helper?: string;
  encode(m: Meta): string;
}

export const FORMATS: Format[] = [
  {
    label: 'current (v2)',
    description: 'IIFE wrapper per function, `{v,name,ast:{params,body},externals}`',
    encode: (m) =>
      `(e=>(globalThis.__TYPEGPU_META__??=new WeakMap).set(e.f=(${m.impl}),{v:2,name:${m.name === undefined ? 'void 0' : js(m.name)},ast:${jsLit({ params: m.params, body: m.body })},externals:${externalsObj(m.externals)}})&&e.f)({})`,
  },
  {
    label: 'v2, impl not parenthesized',
    description:
      'v2 as shipped, minus the parentheses that make V8 compile the implementation eagerly',
    encode: (m) =>
      `(e=>(globalThis.__TYPEGPU_META__??=new WeakMap).set(e.f=${m.impl},{v:2,name:${m.name === undefined ? 'void 0' : js(m.name)},ast:${jsLit({ params: m.params, body: m.body })},externals:${externalsObj(m.externals)}})&&e.f)({})`,
  },
  {
    label: 'A: shared helper',
    description: 'v2 metadata object, but registered via a shared `M(fn, meta)` helper',
    helper: HELPER,
    encode: (m) =>
      `M(${m.impl},{v:2,name:${m.name === undefined ? 'void 0' : js(m.name)},ast:${jsLit({ params: m.params, body: m.body })},externals:${externalsObj(m.externals)}})`,
  },
  {
    label: 'B: A + slim fields',
    description:
      'positional `M(fn, params, body, externals, name?)`, string params, no block wrapper, no version/undefined name',
    helper: HELPER,
    encode: (m) =>
      `M(${m.impl},${js(slimParams(m.params))},${js(m.body[1])},${externalsObj(m.externals)}${m.name === undefined ? '' : `,${js(m.name)}`})`,
  },
  {
    label: 'C: B + numbers inline',
    description: '`[5,"0.5"]` → `0.5` (bare number in expression position)',
    helper: HELPER,
    encode: (m) =>
      `M(${m.impl},${js(slimParams(m.params))},${js((inlineNumbers(m.body) as [0, unknown[]])[1])},${externalsObj(m.externals)}${m.name === undefined ? '' : `,${js(m.name)}`})`,
  },
  {
    label: 'D: C + JSON string',
    description: 'params+body as one JSON string, parsed lazily with `JSON.parse`',
    helper: HELPER,
    encode: (m) =>
      `M(${m.impl},${jsonInJs([slimParams(m.params), (inlineNumbers(m.body) as [0, unknown[]])[1]])},${externalsObj(m.externals)}${m.name === undefined ? '' : `,${js(m.name)}`})`,
  },
  {
    label: "D': D, numbers stay nodes",
    description:
      'D, but numeric literals are `[5,0.5]` instead of bare `0.5` (no AST consumer changes needed)',
    helper: HELPER,
    encode: (m) =>
      `M(${m.impl},${jsonInJs([slimParams(m.params), (numericPayloads(m.body) as [0, unknown[]])[1]])},${externalsObj(m.externals)}${m.name === undefined ? '' : `,${js(m.name)}`})`,
  },
  {
    label: 'E: D + externals by index',
    description: 'external refs in the AST become `[9,i]`, externals become `[keys…]` + `[()=>v…]`',
    helper: HELPER,
    encode: (m) => {
      const keys = m.externals.map(([k]) => k);
      return `M(${m.impl},${jsonInJs([slimParams(m.params), (refExternals(inlineNumbers(m.body), keys) as [0, unknown[]])[1], keys])},${externalsArr(m.externals)}${m.name === undefined ? '' : `,${js(m.name)}`})`;
    },
  },
  {
    label: 'F: D, no "use gpu" in impl',
    description: 'D, and the directive is dropped from the emitted JS implementation',
    helper: HELPER,
    encode: (m) =>
      `M(${stripDirective(m.impl)},${jsonInJs([slimParams(m.params), (inlineNumbers(m.body) as [0, unknown[]])[1]])},${externalsObj(m.externals)}${m.name === undefined ? '' : `,${js(m.name)}`})`,
  },
  {
    label: 'G: prefix-encoded string',
    description:
      'like D, but params+body use a bracket-less prefix encoding (needs a custom decoder)',
    helper: HELPER,
    encode: (m) =>
      `M(${m.impl},${prefixInJs([...prefixParams(m.params), ...prefixEncode(m.body)])},${externalsObj(m.externals)}${m.name === undefined ? '' : `,${js(m.name)}`})`,
  },
  {
    label: 'G2: prefix, 1-char tags',
    description: 'G with single-character node tags (cheaper to decode)',
    helper: HELPER,
    encode: (m) =>
      `M(${m.impl},${prefixInJs([...prefixParams2(m.params), ...prefixEncode2(m.body)])},${externalsObj(m.externals)}${m.name === undefined ? '' : `,${js(m.name)}`})`,
  },
  {
    label: 'X1: v2 without AST body',
    description: 'ablation: how much the AST body costs',
    encode: (m) =>
      `(e=>(globalThis.__TYPEGPU_META__??=new WeakMap).set(e.f=${m.impl},{v:2,name:${m.name === undefined ? 'void 0' : js(m.name)},ast:${js({ params: m.params, body: 0 })},externals:${externalsObj(m.externals)}})&&e.f)({})`,
  },
  {
    label: 'X2: v2 without externals',
    description: 'ablation: how much the externals cost',
    encode: (m) =>
      `(e=>(globalThis.__TYPEGPU_META__??=new WeakMap).set(e.f=${m.impl},{v:2,name:${m.name === undefined ? 'void 0' : js(m.name)},ast:${jsLit({ params: m.params, body: m.body })},externals:{}})&&e.f)({})`,
  },
  {
    label: 'X3: D with AST identifiers blanked',
    description: 'ablation: every identifier/string in the AST replaced by "" (structure only)',
    helper: HELPER,
    encode: (m) =>
      `M(${m.impl},${jsonInJs([slimParams(m.params), blankStrings((inlineNumbers(m.body) as [0, unknown[]])[1])])},${externalsObj(m.externals)}${m.name === undefined ? '' : `,${js(m.name)}`})`,
  },
  {
    label: 'Z: no metadata at all',
    description: 'lower bound: only the JS implementation is left',
    encode: (m) => m.impl,
  },
];

// --- Measure --------------------------------------------------------------------------------

if (import.meta.main) {
  const sizes = (code: string) => {
    const buf = Buffer.from(code);
    return {
      raw: buf.length,
      gzip: gzipSync(buf, { level: 9 }).length,
      brotli: brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
    };
  };

  const results: Record<
    string,
    Record<string, Record<string, ReturnType<typeof sizes> & { meta: number }>>
  > = {};
  mkdirSync(join(here, 'dist-formats'), { recursive: true });

  for (const build of BUILDS) {
    results[build] = {};
    for (const example of EXAMPLES) {
      const assets = join(here, DIST, build, example, 'assets');
      const file = readdirSync(assets).find((f) => f.endsWith('.js')) as string;
      const code = readFileSync(join(assets, file), 'utf8');
      const { metas, helperInits } = extractWithHelpers(code);
      // The original, with v3 helpers neutralized, as a size baseline for the sanity check
      let neutralized = code;
      for (const { start, end } of helperInits.toReversed()) {
        neutralized = `${neutralized.slice(0, start)}0${neutralized.slice(end)}`;
      }
      results[build][example] = {};
      for (const format of FORMATS) {
        let metaBytes = 0;
        const edits = [
          ...metas.map((m) => {
            const enc = format.encode(m);
            metaBytes += enc.length - m.impl.length;
            return { start: m.start, end: m.end, text: enc };
          }),
          ...helperInits.map(({ start, end }) => ({ start, end, text: '0' })),
        ].toSorted((a, b) => b.start - a.start);
        let out = code;
        for (const { start, end, text } of edits) {
          out = out.slice(0, start) + text + out.slice(end);
        }
        if (format.helper) {
          out = format.helper + out;
          metaBytes += format.helper.length;
        }
        results[build][example][format.label] = { ...sizes(out), meta: metaBytes };
        writeFileSync(
          join(
            here,
            'dist-formats',
            `${build}--${example.replace('/', '--')}--${format.label.split(':')[0]}.js`,
          ),
          out,
        );
      }
      // Sanity check: D is the format the plugin emits (v3), so re-encoding the bundle in it
      // should land close to the original (only helper names and the single helper differ)
      const original = sizes(neutralized);
      const d = results[build][example]['D: C + JSON string'];
      console.warn(
        `[${build}] ${example}: ${metas.length} fns, D re-encoding vs original: ${d.raw - original.raw} B`,
      );
    }
  }

  writeFileSync(join(here, `formats-results-${DIST}.json`), JSON.stringify(results, null, 2));

  for (const build of BUILDS) {
    console.log(`\n### ${build}`);
    for (const example of EXAMPLES) {
      console.log(`\n${example}`);
      const base = results[build][example]['current (v2)'];
      for (const [label, r] of Object.entries(results[build][example])) {
        const d = (a: number, b: number) => `${a - b >= 0 ? '+' : ''}${a - b}`.padStart(7);
        console.log(
          `${label.padEnd(28)} meta ${String(r.meta).padStart(7)} raw ${d(r.raw, base.raw)} gzip ${d(r.gzip, base.gzip)} brotli ${d(r.brotli, base.brotli)}`,
        );
      }
    }
  }
}
