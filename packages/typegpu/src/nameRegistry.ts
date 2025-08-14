export interface NameRegistry {
  /**
   * Creates a valid WGSL identifier, each guaranteed to be unique
   * in the lifetime of a single resolution process.
   * @param primer Used in the generation process, makes the identifier more recognizable.
   */
  makeUnique(primer?: string): string;

  /**
   * Creates a valid WGSL identifier.
   * If the parameter could be a WGSL reserved word (with potential suffix) returns `makeUnique(primer)`,
   * otherwise returns `primer`.
   * @param primer Used in the generation process.
   *
   * @example
   * makeValid("notAKeyword"); // "notAKeyword"
   * makeValid("struct"); // makeUnique("struct")
   * makeValid("struct_1"); // makeUnique("struct_1")
   */
  makeValid(primer: string): string;
}

abstract class NameRegistryImpl implements NameRegistry {
  abstract makeUnique(primer?: string): string;

  makeValid(primer: string): string {
    return keywordsAndReservedTokens.has(primer.split('_')[0] as string)
      ? this.makeUnique(primer)
      : primer;
  }
}

export class RandomNameRegistry extends NameRegistryImpl {
  private lastUniqueId = 0;

  makeUnique(primer?: string | undefined): string {
    let label: string;
    if (primer) {
      // sanitizing
      label = primer.replaceAll(/\s/g, '_'); // whitespace -> _
      label = label.replaceAll(/[^\w\d]/g, ''); // removing illegal characters
    } else {
      label = 'item';
    }

    return `${label}_${this.lastUniqueId++}`;
  }
}

export class StrictNameRegistry extends NameRegistryImpl {
  /**
   * Allows to provide a good fallback for instances of the
   * same function that are bound to different slot values.
   */
  private readonly _usedNames = new Set<string>();

  makeUnique(primer?: string | undefined): string {
    if (primer === undefined) {
      throw new Error('Unnamed item found when using a strict name registry');
    }

    let index = 0;
    let unusedName = primer;
    while (this._usedNames.has(unusedName)) {
      index++;
      unusedName = `${primer}_${index}`;
    }

    this._usedNames.add(unusedName);
    return unusedName;
  }
}

const keywordsAndReservedTokens = new Set([
  'alias',
  'break',
  'case',
  'const',
  'const_assert',
  'continue',
  'continuing',
  'default',
  'diagnostic',
  'discard',
  'else',
  'enable',
  'false',
  'fn',
  'for',
  'if',
  'let',
  'loop',
  'override',
  'requires',
  'return',
  'struct',
  'switch',
  'true',
  'var',
  'while',
  'NULL',
  'Self',
  'abstract',
  'active',
  'alignas',
  'alignof',
  'as',
  'asm',
  'asm_fragment',
  'async',
  'attribute',
  'auto',
  'await',
  'become',
  'cast',
  'catch',
  'class',
  'co_await',
  'co_return',
  'co_yield',
  'coherent',
  'column_major',
  'common',
  'compile',
  'compile_fragment',
  'concept',
  'const_cast',
  'consteval',
  'constexpr',
  'constinit',
  'crate',
  'debugger',
  'decltype',
  'delete',
  'demote',
  'demote_to_helper',
  'do',
  'dynamic_cast',
  'enum',
  'explicit',
  'export',
  'extends',
  'extern',
  'external',
  'fallthrough',
  'filter',
  'final',
  'finally',
  'friend',
  'from',
  'fxgroup',
  'get',
  'goto',
  'groupshared',
  'highp',
  'impl',
  'implements',
  'import',
  'inline',
  'instanceof',
  'interface',
  'layout',
  'lowp',
  'macro',
  'macro_rules',
  'match',
  'mediump',
  'meta',
  'mod',
  'module',
  'move',
  'mut',
  'mutable',
  'namespace',
  'new',
  'nil',
  'noexcept',
  'noinline',
  'nointerpolation',
  'non_coherent',
  'noncoherent',
  'noperspective',
  'null',
  'nullptr',
  'of',
  'operator',
  'package',
  'packoffset',
  'partition',
  'pass',
  'patch',
  'pixelfragment',
  'precise',
  'precision',
  'premerge',
  'priv',
  'protected',
  'pub',
  'public',
  'readonly',
  'ref',
  'regardless',
  'register',
  'reinterpret_cast',
  'require',
  'resource',
  'restrict',
  'self',
  'set',
  'shared',
  'sizeof',
  'smooth',
  'snorm',
  'static',
  'static_assert',
  'static_cast',
  'std',
  'subroutine',
  'super',
  'target',
  'template',
  'this',
  'thread_local',
  'throw',
  'trait',
  'try',
  'type',
  'typedef',
  'typeid',
  'typename',
  'typeof',
  'union',
  'unless',
  'unorm',
  'unsafe',
  'unsized',
  'use',
  'using',
  'varying',
  'virtual',
  'volatile',
  'wgsl',
  'where',
  'with',
  'writeonly',
  'yield',
]);
