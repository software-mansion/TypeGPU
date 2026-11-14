/**
 * Finds `precompile()` calls in a module, evaluates them at build time,
 * and replaces them with code for the pruned runtime.
 */

import * as parser from '@babel/parser';
import _traverse, { type NodePath, type Binding } from '@babel/traverse';
import * as t from '@babel/types';
import MagicString from 'magic-string';
import { evaluatePrecompile } from './evaluate.ts';
import type { Options as TypegpuOptions } from 'unplugin-typegpu';

// CommonJS interop
let traverse = _traverse;
if (typeof (traverse as unknown as { default: typeof traverse }).default === 'function') {
  traverse = (traverse as unknown as { default: typeof traverse }).default;
}

export const PACKAGE_NAME = '@typegpu/prune';
export const RUNTIME_ENTRY = '@typegpu/prune/runtime';
const ATTACH = '__tgpuPruneAttach';

export interface TransformOptions {
  typegpuOptions?: TypegpuOptions | undefined;
}

export interface TransformResult {
  code: string;
  map: ReturnType<MagicString['generateMap']>;
  warnings: string[];
}

class PrecompileSyntaxError extends Error {}

function location(filename: string, node: t.Node): string {
  const start = node.loc?.start;
  return start ? `${filename}:${start.line}:${start.column + 1}` : filename;
}

/** Whether an expression is made only of literals, so it can be copied into build-time code as-is */
function isLiteralish(node: t.Node | null | undefined): boolean {
  if (!node) {
    return false;
  }
  if (
    t.isNumericLiteral(node) ||
    t.isStringLiteral(node) ||
    t.isBooleanLiteral(node) ||
    t.isNullLiteral(node) ||
    t.isBigIntLiteral(node)
  ) {
    return true;
  }
  if (t.isIdentifier(node)) {
    return node.name === 'undefined' || node.name === 'NaN' || node.name === 'Infinity';
  }
  if (t.isTemplateLiteral(node)) {
    return node.expressions.length === 0;
  }
  if (t.isUnaryExpression(node)) {
    return ['-', '+', '!'].includes(node.operator) && isLiteralish(node.argument);
  }
  if (t.isArrayExpression(node)) {
    return node.elements.every((element) => element !== null && isLiteralish(element));
  }
  if (t.isObjectExpression(node)) {
    return node.properties.every(
      (prop) => t.isObjectProperty(prop) && !prop.computed && isLiteralish(prop.value as t.Node),
    );
  }
  if (
    t.isTSAsExpression(node) ||
    t.isTSSatisfiesExpression(node) ||
    t.isParenthesizedExpression(node)
  ) {
    return isLiteralish(node.expression);
  }
  return false;
}

function importedName(spec: t.ImportSpecifier): string {
  return t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value;
}

function isPrecompileCallee(path: NodePath<t.CallExpression>): boolean {
  const callee = path.node.callee;
  if (!t.isIdentifier(callee)) {
    return false;
  }
  const binding = path.scope.getBinding(callee.name);
  if (binding?.kind !== 'module') {
    return false;
  }
  const spec = binding.path.node;
  const decl = binding.path.parent;
  return (
    t.isImportSpecifier(spec) &&
    importedName(spec) === 'precompile' &&
    t.isImportDeclaration(decl) &&
    decl.source.value === PACKAGE_NAME
  );
}

interface FoundCall {
  node: t.CallExpression;
  moduleSource: string;
}

function isProgramBinding(binding: Binding): boolean {
  return binding.scope.path.isProgram();
}

/** Builds the virtual module evaluated at build time: what the arrow needs from the module, and the arrow */
function collectCall(path: NodePath<t.CallExpression>, code: string, filename: string): FoundCall {
  const [fn, options, ...rest] = path.node.arguments;
  if (!(t.isArrowFunctionExpression(fn) || t.isFunctionExpression(fn)) || rest.length > 0) {
    throw new PrecompileSyntaxError(
      `${location(filename, path.node)}: precompile() takes an inline arrow function, and optionally an object literal of options.`,
    );
  }
  if (fn.params.length > 1) {
    throw new PrecompileSyntaxError(
      `${location(filename, fn.params[1] as t.Node)}: a precompile() arrow only receives the root. ` +
        'Values known only at runtime (e.g. the canvas format) are precompiled as variants instead: ' +
        'return one pipeline per possible value, and pick one at runtime.',
    );
  }
  if (options && !isLiteralish(options)) {
    throw new PrecompileSyntaxError(
      `${location(filename, options)}: the options of precompile() have to be an object literal of constant values.`,
    );
  }

  const imports = new Map<string, string>();
  const constants = new Map<string, string>();
  const slice = (node: t.Node) => code.slice(node.start ?? 0, node.end ?? 0);

  path.traverse({
    Identifier(idPath) {
      // Types are erased, so only values matter
      if (!idPath.isReferencedIdentifier() || idPath.findParent((p) => p.isTSType())) {
        return;
      }
      const name = idPath.node.name;
      const binding = idPath.scope.getBinding(name);
      if (!binding || !isProgramBinding(binding) || imports.has(name) || constants.has(name)) {
        return;
      }

      if (binding.kind === 'module') {
        const spec = binding.path.node;
        const decl = binding.path.parent as t.ImportDeclaration;
        const source = JSON.stringify(decl.source.value);
        if (t.isImportDefaultSpecifier(spec)) {
          imports.set(name, `import ${name} from ${source};`);
        } else if (t.isImportNamespaceSpecifier(spec)) {
          imports.set(name, `import * as ${name} from ${source};`);
        } else if (t.isImportSpecifier(spec)) {
          const imported = importedName(spec);
          const specifier = !t.isValidIdentifier(imported)
            ? `${JSON.stringify(imported)} as ${name}`
            : imported === name
              ? name
              : `${imported} as ${name}`;
          imports.set(name, `import { ${specifier} } from ${source};`);
        }
        return;
      }

      const declarator = binding.path.node;
      if (
        binding.kind === 'const' &&
        t.isVariableDeclarator(declarator) &&
        t.isIdentifier(declarator.id) &&
        isLiteralish(declarator.init)
      ) {
        constants.set(name, `const ${name} = ${slice(declarator.init as t.Node)};`);
        return;
      }

      throw new PrecompileSyntaxError(
        `${location(filename, idPath.node)}: the precompile() arrow uses '${name}', a module-level value that isn't a constant literal. ` +
          'Define it inside of the arrow, or move it to another module and import it.',
      );
    },
  });

  const moduleSource = [
    ...imports.values(),
    ...constants.values(),
    `export default (${slice(fn)});`,
    `export const options = ${options ? `(${slice(options)})` : 'undefined'};`,
  ].join('\n');

  return { node: path.node, moduleSource };
}

/**
 * Precompiles every `precompile()` call of a module. Also points imports of
 * `@typegpu/prune` at the pruned runtime. Returns `undefined` if nothing changed.
 */
export async function transformPrecompile(
  code: string,
  filename: string,
  options: TransformOptions = {},
): Promise<TransformResult | undefined> {
  if (!code.includes(PACKAGE_NAME)) {
    return undefined;
  }

  const ast = parser.parse(code, {
    sourceType: 'module',
    sourceFilename: filename,
    plugins: /\.[cm]?tsx?$/.test(filename)
      ? filename.endsWith('x')
        ? ['typescript', 'jsx']
        : ['typescript']
      : ['jsx'],
  });

  const calls: FoundCall[] = [];
  const pruneImports: t.ImportDeclaration[] = [];
  const moduleBindings: Binding[] = [];

  traverse(ast, {
    Program(programPath) {
      for (const binding of Object.values(programPath.scope.bindings)) {
        if (binding.kind === 'module') {
          moduleBindings.push(binding);
        }
      }
    },
    ImportDeclaration(declPath) {
      if (declPath.node.source.value === PACKAGE_NAME) {
        pruneImports.push(declPath.node);
      }
    },
    CallExpression(callPath) {
      if (isPrecompileCallee(callPath)) {
        calls.push(collectCall(callPath, code, filename));
        callPath.skip();
      }
    },
  });

  if (pruneImports.length === 0) {
    return undefined;
  }

  const s = new MagicString(code);
  const warnings: string[] = [];

  for (const call of calls) {
    let result;
    try {
      result = await evaluatePrecompile({
        filename,
        moduleSource: call.moduleSource,
        typegpuOptions: options.typegpuOptions,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${location(filename, call.node)}: precompile() failed.\n${message}`, {
        cause: error,
      });
    }
    warnings.push(
      ...result.warnings.map((warning) => `${location(filename, call.node)}: ${warning}`),
    );
    s.overwrite(call.node.start ?? 0, call.node.end ?? 0, result.code);
  }

  // Imports only the precompiled arrows used are not needed anymore
  const inCall = (node: t.Node) =>
    calls.some(
      (call) =>
        (node.start ?? 0) >= (call.node.start ?? 0) && (node.end ?? 0) <= (call.node.end ?? 0),
    );
  const unused = new Set<t.Node>();
  for (const binding of moduleBindings) {
    if (
      binding.referencePaths.length > 0 &&
      binding.referencePaths.every((ref) => inCall(ref.node))
    ) {
      unused.add(binding.path.node);
    }
  }

  traverse(ast, {
    ImportDeclaration(declPath) {
      const decl = declPath.node;
      const kept = decl.specifiers.filter((spec) => !unused.has(spec));
      if (kept.length === decl.specifiers.length) {
        if (decl.source.value === PACKAGE_NAME) {
          s.overwrite(decl.source.start ?? 0, decl.source.end ?? 0, JSON.stringify(RUNTIME_ENTRY));
        }
        return;
      }
      if (kept.length === 0) {
        s.remove(decl.start ?? 0, decl.end ?? 0);
        return;
      }
      const source = decl.source.value === PACKAGE_NAME ? RUNTIME_ENTRY : decl.source.value;
      const specs = kept.map((spec) => code.slice(spec.start ?? 0, spec.end ?? 0));
      const defaults = kept.filter((spec) => !t.isImportSpecifier(spec));
      const named = specs.filter((_, idx) => t.isImportSpecifier(kept[idx]));
      const clauses = [
        ...defaults.map((spec) => code.slice(spec.start ?? 0, spec.end ?? 0)),
        ...(named.length > 0 ? [`{ ${named.join(', ')} }`] : []),
      ];
      const typeOnly = decl.importKind === 'type' ? 'type ' : '';
      s.overwrite(
        decl.start ?? 0,
        decl.end ?? 0,
        `import ${typeOnly}${clauses.join(', ')} from ${JSON.stringify(source)};`,
      );
    },
  });

  if (calls.length > 0) {
    s.prepend(`import { ${ATTACH} } from ${JSON.stringify(RUNTIME_ENTRY)};\n`);
  }

  return {
    code: s.toString(),
    map: s.generateMap({ source: filename, includeContent: true, hires: true }),
    warnings,
  };
}
