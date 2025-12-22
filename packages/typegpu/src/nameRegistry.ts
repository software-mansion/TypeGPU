const bannedTokens = new Set([
  // keywords
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
  // reserved words
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
  // Keywords that should be reserved
  'sampler',
]);

export interface NameRegistry {
  /**
   * Creates a valid WGSL identifier, each guaranteed to be unique
   * in the lifetime of a single resolution process.
   * Should append "_" to primer, followed by some id.
   * @param primer Used in the generation process, makes the identifier more recognizable.
   * @param global Whether the name should be registered in the global scope (true), or in the current function scope (false)
   */
  makeUnique(primer: string | undefined, global: boolean): string;

  /**
   * Creates a valid WGSL identifier.
   * Renames identifiers that are WGSL reserved words.
   * @param primer Used in the generation process.
   *
   * @example
   * makeValid("notAKeyword"); // "notAKeyword"
   * makeValid("struct"); // makeUnique("struct")
   * makeValid("struct_1"); // makeUnique("struct_1") (to avoid potential name collisions)
   * makeValid("_"); // ERROR (too difficult to make valid to care)
   */
  makeValid(primer: string): string;

  pushFunctionScope(): void;
  popFunctionScope(): void;
}

function sanitizePrimer(primer: string | undefined) {
  if (primer) {
    // sanitizing
    return primer
      .replaceAll(/\s/g, '_') // whitespaces
      .replaceAll(/[^\w\d]/g, ''); // removing illegal characters
  }
  return 'item';
}

/**
 * A function for checking whether an identifier needs renaming.
 * Throws if provided with an invalid identifier that cannot be easily renamed.
 * @example
 * isValidIdentifier("ident"); // true
 * isValidIdentifier("struct"); // false
 * isValidIdentifier("struct_1"); // false
 * isValidIdentifier("_"); // ERROR
 * isValidIdentifier("my variable"); // ERROR
 */
export function isValidIdentifier(ident: string): boolean {
  if (ident === '_' || ident.startsWith('__') || /\s/.test(ident)) {
    throw new Error(
      `Invalid identifier '${ident}'. Choose an identifier without whitespaces or leading underscores.`,
    );
  }
  const prefix = ident.split('_')[0] as string;
  return !bannedTokens.has(prefix);
}

export class RandomNameRegistry implements NameRegistry {
  #lastUniqueId = 0;
  readonly #usedNames: Set<string>;
  readonly #usedFunctionScopeNamesStack: Set<string>[];

  constructor() {
    this.#usedNames = new Set<string>(bannedTokens);
    this.#usedFunctionScopeNamesStack = [];
  }

  get usedFunctionScopeNames(): Set<string> | undefined {
    return this
      .#usedFunctionScopeNamesStack[
        this.#usedFunctionScopeNamesStack.length - 1
      ];
  }

  makeUnique(primer?: string | undefined): string {
    const sanitizedPrimer = sanitizePrimer(primer);
    const fnScopeNames = this.usedFunctionScopeNames;

    let name = `${sanitizedPrimer}_${this.#lastUniqueId++}`;
    while (this.#usedNames.has(name) || fnScopeNames?.has(name)) {
      name = `${sanitizedPrimer}_${this.#lastUniqueId++}`;
    }

    if (global) {
      this.#usedNames.add(name);
    } else {
      fnScopeNames?.add(name);
    }

    return name;
  }

  makeValid(primer: string): string {
    if (isValidIdentifier(primer) && !this.#usedNames.has(primer)) {
      this.usedFunctionScopeNames?.add(primer);
      return primer;
    }
    return this.makeUnique(primer);
  }

  pushFunctionScope(): void {
    this.#usedFunctionScopeNamesStack.push(new Set<string>());
  }

  popFunctionScope(): void {
    this.#usedFunctionScopeNamesStack.pop();
  }
}

export class StrictNameRegistry implements NameRegistry {
  /**
   * Allows to provide a good fallback for instances of the
   * same function that are bound to different slot values.
   */
  readonly #usedNames: Set<string>;
  readonly #usedFunctionScopeNamesStack: Set<string>[];

  constructor() {
    this.#usedNames = new Set<string>(bannedTokens);
    this.#usedFunctionScopeNamesStack = [];
  }

  get usedFunctionScopeNames(): Set<string> | undefined {
    return this
      .#usedFunctionScopeNamesStack[
        this.#usedFunctionScopeNamesStack.length - 1
      ];
  }

  // TODO: optimize this with a map
  makeUnique(primer: string | undefined, global: boolean): string {
    const sanitizedPrimer = sanitizePrimer(primer);
    const fnScopeNames = this.usedFunctionScopeNames;

    let index = 0;
    let label = sanitizedPrimer;
    while (this.#usedNames.has(label) || fnScopeNames?.has(label)) {
      index++;
      label = `${sanitizedPrimer}_${index}`;
    }

    if (global) {
      this.#usedNames.add(label);
    } else {
      fnScopeNames?.add(label);
    }

    return label;
  }

  makeValid(primer: string): string {
    if (isValidIdentifier(primer) && !this.#usedNames.has(primer)) {
      this.usedFunctionScopeNames?.add(primer);
      return primer;
    }
    return this.makeUnique(primer, false);
  }

  pushFunctionScope(): void {
    this.#usedFunctionScopeNamesStack.push(new Set<string>());
  }

  popFunctionScope(): void {
    this.#usedFunctionScopeNamesStack.pop();
  }
}
