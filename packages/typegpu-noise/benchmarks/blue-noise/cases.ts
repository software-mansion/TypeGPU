import { generate } from '../../src/blue-noise-2d.ts';
import { generate as baseline } from './baseline.ts';
import { generateVariant, type Variant } from './variants.ts';

export const seeds = [0, 42, 0xffffffff];
export const sizes = [32, 63, 64, 128];
export const cases = [
  { name: 'baseline', run: (size: number, seed: number) => baseline({ size, seed }) },
  ...(['fused', 'split', 'split-fused', 'doubled'] satisfies Variant[]).map((variant) => ({
    name: variant,
    run: (size: number, seed: number) => generateVariant(size, seed, variant),
  })),
  { name: 'doubled-fused', run: (size: number, seed: number) => generate({ size, seed }) },
];
