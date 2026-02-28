import { invariant } from './errors.ts';

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
  'uniform',
  'storage',
]);

const builtins = new Set([
  // constructors
  'array',
  'bool',
  'f16',
  'f32',
  'i32',
  'u32',
  'mat2x2',
  'mat2x3',
  'mat2x4',
  'mat3x2',
  'mat3x3',
  'mat3x4',
  'mat4x2',
  'mat4x3',
  'mat4x4',
  'vec2',
  'vec3',
  'vec4',
  // bitcast
  'bitcast',
  // logical
  'all',
  'any',
  'select',
  // array
  'arrayLength',
  // numeric
  'abs',
  'acos',
  'acosh',
  'asin',
  'asinh',
  'atan',
  'atanh',
  'atan2',
  'ceil',
  'clamp',
  'cos',
  'cosh',
  'countLeadingZeros',
  'countOneBits',
  'countTrailingZeros',
  'cross',
  'degrees',
  'determinant',
  'distance',
  'dot',
  'dot4U8Packed',
  'dot4I8Packed',
  'exp',
  'exp2',
  'extractBits',
  'faceForward',
  'firstLeadingBit',
  'firstTrailingBit',
  'floor',
  'fma',
  'fract',
  'frexp',
  'insertBits',
  'inverseSqrt',
  'ldexp',
  'length',
  'log',
  'log2',
  'max',
  'min',
  'mix',
  'modf',
  'normalize',
  'pow',
  'quantizeToF16',
  'radians',
  'reflect',
  'refract',
  'reverseBits',
  'round',
  'saturate',
  'sign',
  'sin',
  'sinh',
  'smoothstep',
  'sqrt',
  'step',
  'tan',
  'tanh',
  'transpose',
  'trunc',
  // derivative
  'dpdx',
  'dpdxCoarse',
  'dpdxFine',
  'dpdy',
  'dpdyCoarse',
  'dpdyFine',
  'fwidth',
  'fwidthCoarse',
  'fwidthFine',
  // texture
  'textureDimensions',
  'textureGather',
  'textureGatherCompare',
  'textureLoad',
  'textureNumLayers',
  'textureNumLevels',
  'textureNumSamples',
  'textureSample',
  'textureSampleBias',
  'textureSampleCompare',
  'textureSampleCompareLevel',
  'textureSampleGrad',
  'textureSampleLevel',
  'textureSampleBaseClampToEdge',
  'textureStore',
  // atomic
  'atomicLoad',
  'atomicStore',
  'atomicAdd',
  'atomicSub',
  'atomicMax',
  'atomicMin',
  'atomicAnd',
  'atomicOr',
  'atomicXor',
  'atomicExchange',
  'atomicCompareExchangeWeak',
  // data packing
  'pack4x8snorm',
  'pack4x8unorm',
  'pack4xI8',
  'pack4xU8',
  'pack4xI8Clamp',
  'pack4xU8Clamp',
  'pack2x16snorm',
  'pack2x16unorm',
  'pack2x16float',
  // data unpacking
  'unpack4x8snorm',
  'unpack4x8unorm',
  'unpack4xI8',
  'unpack4xU8',
  'unpack2x16snorm',
  'unpack2x16unorm',
  'unpack2x16float',
  // synchronization
  'storageBarrier',
  'textureBarrier',
  'workgroupBarrier',
  'workgroupUniformLoad',
  // subgroup
  'subgroupAdd',
  'subgroupExclusiveAdd',
  'subgroupInclusiveAdd',
  'subgroupAll',
  'subgroupAnd',
  'subgroupAny',
  'subgroupBallot',
  'subgroupBroadcast',
  'subgroupBroadcastFirst',
  'subgroupElect',
  'subgroupMax',
  'subgroupMin',
  'subgroupMul',
  'subgroupExclusiveMul',
  'subgroupInclusiveMul',
  'subgroupOr',
  'subgroupShuffle',
  'subgroupShuffleDown',
  'subgroupShuffleUp',
  'subgroupShuffleXor',
  'subgroupXor',
  // quad operations
  'quadBroadcast',
  'quadSwapDiagonal',
  'quadSwapX',
  'quadSwapY',
]);

export interface NameRegistry {
  /**
   * Creates a valid WGSL identifier, each guaranteed to be unique
   * in the lifetime of a single resolution process
   * (excluding non-global identifiers from popped scopes).
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
  pushBlockScope(): void;
  popBlockScope(): void;
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
function isValidIdentifier(ident: string): boolean {
  if (ident === '_' || ident.startsWith('__') || /\s/.test(ident)) {
    throw new Error(
      `Invalid identifier '${ident}'. Choose an identifier without whitespaces or leading underscores.`,
    );
  }
  const prefix = ident.split('_')[0] as string;
  return !bannedTokens.has(prefix) && !builtins.has(prefix);
}

/**
 * Same as `isValidIdentifier`, except does not check for builtin clashes.
 */
export function isValidProp(ident: string): boolean {
  if (ident === '_' || ident.startsWith('__') || /\s/.test(ident)) {
    throw new Error(
      `Invalid identifier '${ident}'. Choose an identifier without whitespaces or leading underscores.`,
    );
  }
  const prefix = ident.split('_')[0] as string;
  return !bannedTokens.has(prefix);
}
type FunctionScopeLayer = {
  type: 'functionScope';
};

type BlockScopeLayer = {
  type: 'blockScope';
  usedBlockScopeNames: Set<string>;
};

type ScopeLayer = FunctionScopeLayer | BlockScopeLayer;

abstract class NameRegistryImpl implements NameRegistry {
  abstract getUniqueVariant(base: string): string;

  readonly #usedNames: Set<string>;
  readonly #scopeStack: ScopeLayer[];

  constructor() {
    this.#usedNames = new Set<string>([...bannedTokens, ...builtins]);
    this.#scopeStack = [];
  }

  get #usedBlockScopeNames(): Set<string> | undefined {
    return (this.#scopeStack[this.#scopeStack.length - 1] as BlockScopeLayer | undefined)
      ?.usedBlockScopeNames;
  }

  makeUnique(primer: string | undefined, global: boolean): string {
    const sanitizedPrimer = sanitizePrimer(primer);
    const name = this.getUniqueVariant(sanitizedPrimer);

    if (global) {
      this.#usedNames.add(name);
    } else {
      this.#usedBlockScopeNames?.add(name);
    }

    return name;
  }

  #isUsedInBlocksBefore(name: string): boolean {
    const functionScopeIndex = this.#scopeStack.findLastIndex(
      (scope) => scope.type === 'functionScope',
    );
    return this.#scopeStack
      .slice(functionScopeIndex + 1)
      .some((scope) => (scope as BlockScopeLayer).usedBlockScopeNames.has(name));
  }

  makeValid(primer: string): string {
    if (
      isValidIdentifier(primer) &&
      !this.#usedNames.has(primer) &&
      !this.#isUsedInBlocksBefore(primer)
    ) {
      this.#usedBlockScopeNames?.add(primer);
      return primer;
    }
    return this.makeUnique(primer, false);
  }

  isUsed(name: string): boolean {
    return this.#usedNames.has(name) || this.#isUsedInBlocksBefore(name);
  }

  pushFunctionScope(): void {
    this.#scopeStack.push({ type: 'functionScope' });
    this.#scopeStack.push({
      type: 'blockScope',
      usedBlockScopeNames: new Set(),
    });
  }

  popFunctionScope(): void {
    const functionScopeIndex = this.#scopeStack.findLastIndex(
      (scope) => scope.type === 'functionScope',
    );

    if (functionScopeIndex === -1) {
      throw new Error('Tried to pop function scope when no scope was present.');
    }

    this.#scopeStack.splice(functionScopeIndex);
  }

  pushBlockScope(): void {
    this.#scopeStack.push({
      type: 'blockScope',
      usedBlockScopeNames: new Set(),
    });
  }
  popBlockScope(): void {
    invariant(
      this.#scopeStack[this.#scopeStack.length - 1]?.type === 'blockScope',
      'Tried to pop block scope, but it is not present',
    );
    this.#scopeStack.pop();
  }
}

export class RandomNameRegistry extends NameRegistryImpl {
  #lastUniqueId = 0;

  getUniqueVariant(base: string): string {
    let name = `${base}_${this.#lastUniqueId++}`;
    while (this.isUsed(name)) {
      name = `${base}_${this.#lastUniqueId++}`;
    }
    return name;
  }
}

export class StrictNameRegistry extends NameRegistryImpl {
  getUniqueVariant(base: string): string {
    let index = 0;
    let name = base;
    while (this.isUsed(name)) {
      index++;
      name = `${base}_${index}`;
    }
    return name;
  }
}
