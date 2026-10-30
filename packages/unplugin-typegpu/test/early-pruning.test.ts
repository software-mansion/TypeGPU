import { describe, expect, it } from 'vitest';
import { babelTransform } from './transform.ts';

describe('[BABEL] early pruning', () => {
  const code = `const buffer = root.createBuffer(d.f32);`;

  it('assigns an auto-name when early pruning is disabled', () => {
    expect(babelTransform(code, { autoNamingEnabled: true, earlyPruning: false })).toContain(
      '__TYPEGPU_AUTONAME__',
    );
  });

  it('skips files without keywords', () => {
    expect(babelTransform(code, { autoNamingEnabled: true, earlyPruning: true })).toBe(code);
  });

  it.each(['typegpu', 'tgpu', "'use gpu'", '"use gpu"'])(
    'processes files containing %s',
    (marker) => {
      expect(
        babelTransform(`// ${marker}\n${code}`, { autoNamingEnabled: true, earlyPruning: true }),
      ).toContain('__TYPEGPU_AUTONAME__');
    },
  );
});
