export const bannedTokens = new Set([
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

export const builtins = new Set([
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

/*#__NO_SIDE_EFFECTS__*/
export function sanitizePrimer(primer: string | undefined) {
  if (primer) {
    const base = primer
      .replaceAll(/\s/g, '_') // whitespaces
      .replaceAll(/[^\w\d]/g, ''); // removing illegal characters

    if (base === '_' || base === '' || base.startsWith('__')) {
      return 'item';
    }
    return base;
  }
  return 'item';
}

type ValidationResult =
  | {
      success: true;
      error?: undefined;
    }
  | {
      success: false;
      error?: string | undefined;
    };

/**
 * A function for checking whether an identifier needs renaming.
 * Throws if provided with an invalid identifier that cannot be easily renamed.
 * @example
 * validateIdentifier("ident"); // { success: true }
 * validateIdentifier("struct"); // { success: false, error: "Identifiers cannot start with reserved keywords." }
 * validateIdentifier("struct_1"); { success: false, error: "Identifiers cannot start with reserved keywords." }
 * validateIdentifier("_"); // { success: false }
 * validateIdentifier("my variable"); // { success: false, error: "Identifiers cannot contain whitespace." }
 */
/*#__NO_SIDE_EFFECTS__*/
export function validateIdentifier(ident: string): ValidationResult {
  if (ident === '_') {
    return {
      success: false,
    };
  }
  if (/\s/.test(ident)) {
    return {
      success: false,
      error: `Identifiers cannot contain whitespace.`,
    };
  }
  if (ident.startsWith('__')) {
    return {
      success: false,
      error: `Identifiers cannot start with double underscores.`,
    };
  }
  const prefix = ident.split('_')[0] as string;
  if (bannedTokens.has(prefix) || builtins.has(prefix)) {
    return {
      success: false,
      error: `Identifiers cannot start with reserved keywords.`,
    };
  }
  return {
    success: true,
  };
}

/**
 * Same as `validateIdentifier`, except does not check for builtin clashes.
 */
/*#__NO_SIDE_EFFECTS__*/
export function validateProp(ident: string): ValidationResult {
  if (ident === '_') {
    return {
      success: false,
    };
  }
  if (/\s/.test(ident)) {
    return {
      success: false,
      error: `Identifiers cannot contain whitespace.`,
    };
  }
  if (ident.startsWith('__')) {
    return {
      success: false,
      error: `Identifiers cannot start with double underscores.`,
    };
  }
  const prefix = ident.split('_')[0] as string;
  if (bannedTokens.has(prefix)) {
    return {
      success: false,
      error: `Identifiers cannot start with reserved keywords.`,
    };
  }
  return {
    success: true,
  };
}
