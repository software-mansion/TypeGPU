import type * as t from '@babel/types';
import type MagicString from 'magic-string';

/**
 * Namespaces re-exported by the 'typegpu' entry, and the subpaths that
 * export the same module namespace objects directly.
 */
const namespaceSubpaths: Record<string, string> = {
  tgpu: 'tgpu',
  d: 'data',
  std: 'std',
  common: 'common',
};

/**
 * Lists the subpaths (e.g. `./tgpu`) that the 'typegpu' package resolved from `importer` exports.
 */
export type TypegpuSubpathResolver = (importer: string) => ReadonlySet<string>;

/**
 * Rewrites `import { tgpu, d } from 'typegpu'` into
 * `import * as tgpu from 'typegpu/tgpu'` and `import * as d from 'typegpu/data'`.
 *
 * esbuild and Bun only tree-shake property accesses on namespaces imported with
 * `import * as`. A namespace re-exported from another module (`export * as tgpu`)
 * gets materialized as an object with every export, so `tgpu.slot` would otherwise
 * pull in all of TypeGPU. Both forms evaluate to the same namespace object.
 *
 * Only namespaces whose subpath the installed TypeGPU exports are rewritten.
 */
export function rewriteNamespaceImports(
  program: t.Program,
  magicString: MagicString,
  subpaths: ReadonlySet<string>,
): void {
  for (const node of program.body) {
    if (
      node.type !== 'ImportDeclaration' ||
      node.source.value !== 'typegpu' ||
      node.importKind === 'type' ||
      node.importKind === 'typeof' ||
      node.phase ||
      node.attributes?.length
    ) {
      continue;
    }

    const kept: t.ImportDeclaration['specifiers'] = [];
    const namespaceImports: string[] = [];

    for (const spec of node.specifiers) {
      // The default export of 'typegpu' is the `tgpu` namespace
      const imported =
        spec.type === 'ImportDefaultSpecifier'
          ? 'tgpu'
          : spec.type === 'ImportSpecifier' && spec.importKind !== 'type'
            ? spec.imported.type === 'Identifier'
              ? spec.imported.name
              : spec.imported.value
            : undefined;
      const subpath = imported !== undefined ? namespaceSubpaths[imported] : undefined;

      if (subpath !== undefined && subpaths.has(`./${subpath}`)) {
        namespaceImports.push(`import * as ${spec.local.name} from 'typegpu/${subpath}';`);
      } else {
        kept.push(spec);
      }
    }

    if (namespaceImports.length === 0 || node.start == null || node.source.start == null) {
      continue;
    }

    // Replacing only the import clause (between `import` and the source), so that code
    // inserted right before the declaration stays intact. With nothing kept,
    // `import 'typegpu'` is left behind, which bundlers drop (the package has no side effects).
    const slice = (spec: t.Node) => magicString.original.slice(spec.start ?? 0, spec.end ?? 0);
    const leading = kept.filter((spec) => spec.type !== 'ImportSpecifier').map(slice);
    const named = kept.filter((spec) => spec.type === 'ImportSpecifier').map(slice);
    const clause = [...leading, ...(named.length > 0 ? [`{ ${named.join(', ')} }`] : [])].join(
      ', ',
    );

    magicString.overwrite(
      node.start + 'import'.length,
      node.source.start,
      clause ? ` ${clause} from ` : ' ',
    );
    magicString.appendLeft(node.end ?? 0, `\n${namespaceImports.join('\n')}`);
  }
}
