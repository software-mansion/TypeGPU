// Experimental source transforms only: production files are never written.
export const variants = {
  baseline: [],
  'no-callable-wrapper': ['no-callable-wrapper'],
  previous: ['indirect-named-access', 'no-scalar-fast-path'],
  'no-swizzles': ['no-swizzles'],
  'cached-metadata': ['cached-metadata'],
  'no-init-coercion': ['no-init-coercion'],
  'no-array': ['no-array'],
  'indirect-named-access': ['indirect-named-access'],
  'no-scalar-fast-path': ['no-scalar-fast-path'],
  'extra-payload': ['extra-payload'],
  combined: ['no-swizzles', 'cached-metadata', 'no-init-coercion', 'no-array'],
} as const;

export type Variant = keyof typeof variants;

function replace(source: string, pattern: RegExp, replacement: string, count: number): string {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== count) {
    throw new Error(
      `Source drift: expected ${count} matches for ${pattern}, got ${matches.length}`,
    );
  }
  return source.replace(pattern, replacement);
}

export function transform(source: string, file: string, variant: Variant): string {
  const flags: readonly string[] = variants[variant];
  if (
    file.endsWith('/core/function/createCallableSchema.ts') &&
    flags.includes('no-callable-wrapper')
  ) {
    source = replace(
      source,
      /const impl = \(\(\.\.\.args: Parameters<T>\) => \{\n    return options.normalImpl\(\.\.\.args\);\n  \}\) as DualFn<T>;/g,
      'const impl = options.normalImpl as DualFn<T>;',
      1,
    );
  }
  if (file.endsWith('/data/vectorImpl.ts')) {
    if (flags.includes('no-swizzles')) {
      source = replace(source, /  static \{[\s\S]*?\n  \}\n\n  castElement/g, '  castElement', 1);
    }
    if (flags.includes('cached-metadata')) {
      source = `let cached_f32, cached_f16, cached_i32, cached_u32, cached_bool;\n${source}`;
      source = replace(
        source,
        /return \{\n      elementSchema: (f32|f16|i32|u32|bool),\n    \};/g,
        'return cached_$1 ??= { elementSchema: $1 };',
        15,
      );
    }
    if (flags.includes('no-init-coercion')) {
      source = replace(
        source,
        /this\.(e[0-3]) = this\.castElement\(\)\((x|[yzw] \?\? x)\);/g,
        'this.$1 = ($2) ?? 0;',
        9,
      );
    }
    if (flags.includes('no-array')) {
      source = replace(
        source,
        /export abstract class VecBase<S> extends Array/g,
        'class ArrayShell { constructor(length) { this.length = length; } }\nexport abstract class VecBase<S> extends ArrayShell',
        1,
      );
    }
    if (flags.includes('indirect-named-access')) {
      source = replace(
        source,
        /(get [xyzwrgba]\(\) \{\n    )return this\.e([0-3]);/g,
        '$1return this[$2];',
        18,
      );
    }
    if (flags.includes('extra-payload')) {
      source = replace(
        source,
        /    super\(([234])\);/g,
        '    super($1);\n    this.payload0 = 0; this.payload1 = 1; this.payload2 = 2; this.payload3 = 3;\n    this.payload4 = 4; this.payload5 = 5; this.payload6 = 6; this.payload7 = 7;',
        3,
      );
    }
  }
  if (file.endsWith('/data/vector.ts') && flags.includes('no-scalar-fast-path')) {
    source = replace(
      source,
      /    \/\/ Scalar-only calls need no intermediate array or argument flattening\.\n    if \([\s\S]*?return new VecImpl\(\.\.\.\(args as S\[\]\)\) as TValue;\n    \}\n\n/g,
      '',
      1,
    );
  }
  return source;
}
