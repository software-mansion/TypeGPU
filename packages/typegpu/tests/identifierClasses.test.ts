import { describe, expect, it, vi } from 'vitest';

describe('identifier regexes (ICU present)', () => {
  it('produces byte-identical .source to the original literals', async () => {
    const { wgslIdentRegex } = await import('../src/shared/identifierClasses.js');
    const { anyIdent, boundedPropChain } = await import('../src/core/resolve/externals.js');

    expect(wgslIdentRegex.source).toBe(
      '^(([_\\p{XID_Start}][\\p{XID_Continue}]+)|([\\p{XID_Start}]))$',
    );
    expect(anyIdent.source).toBe('([$_\\p{XID_Start}][$\\p{XID_Continue}]*)');
    expect(boundedPropChain.source).toBe(
      '(?<![\\p{XID_Continue}\\$.])(([$_\\p{XID_Start}][$\\p{XID_Continue}]*))(\\.([$_\\p{XID_Start}][$\\p{XID_Continue}]*))*(?![\\p{XID_Continue}\\$])',
    );
  });
});

describe('identifier regexes (ICU-less engines)', () => {
  it('falls back to explicit ranges and still works', async () => {
    vi.resetModules();
    vi.stubGlobal(
      'RegExp',
      new Proxy(RegExp, {
        construct(target, args) {
          if (/\\[pP]\{/.test(String(args[0]))) {
            throw new SyntaxError('Invalid regular expression: Invalid property name');
          }
          return Reflect.construct(target, args);
        },
      }),
    );

    const { strictXidStart, strictXidContinue, looseXidStart, looseXidContinue, wgslIdentRegex } =
      await import('../src/shared/identifierClasses.js');
    const { validateIdentifier } = await import('../src/nameUtils.js');
    const { anyIdent } = await import('../src/core/resolve/externals.js');
    const { stringifyObjectProperty } = await import('../src/shared/tseynit.js');

    expect(strictXidStart).toBe('A-Za-z');
    expect(strictXidContinue).toBe('0-9A-Za-z_');
    expect(looseXidStart).toContain('A-Za-z');
    expect(looseXidContinue).toContain('0-9A-Za-z_');

    // wgslIdentRegex is built from the strict fallbacks — ASCII only.
    for (const ok of ['foo', '_a1', 'x']) {
      expect(wgslIdentRegex.test(ok)).toBe(true);
      expect(validateIdentifier(ok).success).toBe(true);
    }
    for (const bad of ['1a', 'a-b']) {
      expect(wgslIdentRegex.test(bad)).toBe(false);
      expect(validateIdentifier(bad).success).toBe(false);
    }
    // Non-ASCII identifiers are rejected under the strict fallback…
    expect(validateIdentifier('ünï').success).toBe(false);
    // …and object keys get JSON-quoted instead of emitted bare.
    expect(stringifyObjectProperty(['ünï', '1', false])).toBe('"ünï": 1');
    expect(stringifyObjectProperty(['abc', '1', false])).toBe('abc: 1');

    // loose anyIdent treats non-ASCII non-blank code points as identifier chars.
    expect('$ñame'.match(anyIdent)?.[0]).toBe('$ñame');

    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('minify tokenizes non-ASCII WGSL identifiers under the fallback', async () => {
    vi.resetModules();
    vi.stubGlobal(
      'RegExp',
      new Proxy(RegExp, {
        construct(target, args) {
          if (/\\[pP]\{/.test(String(args[0]))) {
            throw new SyntaxError('Invalid regular expression: Invalid property name');
          }
          return Reflect.construct(target, args);
        },
      }),
    );
    const { minify } = await import('../src/minify.js');
    const snippet = 'fn f() -> i32 {\n  let ünï = 1;\n  return ünï;\n}';
    const out = minify(snippet);
    expect(out).toContain('ünï');
    vi.unstubAllGlobals();
    vi.resetModules();
  });
});

describe('property-escape source guard', () => {
  // On ICU-less engines (V8 built without ICU — NativeScript iOS/Android,
  // nodejs-mobile, `node --without-intl`) a `\p{…}` regex *literal* is an early
  // SyntaxError that fails the whole module at parse time. They must only ever
  // be built via `new RegExp` inside `shared/identifierClasses.ts`.
  it('has no \\p{…}/\\P{…} escapes outside shared/identifierClasses.ts', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join, relative } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const srcRoot = fileURLToPath(new URL('../src', import.meta.url));

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
        } else if (name.endsWith('.ts')) {
          files.push(path);
        }
      }
    };
    walk(srcRoot);

    const escapeRe = /\\[pP]\{/;
    for (const file of files) {
      if (file.endsWith('identifierClasses.ts')) {
        continue;
      }
      const source = readFileSync(file, 'utf8');
      expect(
        escapeRe.test(source),
        `${relative(srcRoot, file)} contains a \\p{…}/\\P{…} escape`,
      ).toBe(false);
    }
  });
});
