import { $comptimeValueOf } from '../shared/symbols.ts';
import { asComptime, type ComptimeValue, type WithComptimeValue } from '../types.ts';
import type { Snippet } from './snippet.ts';
import type { AnyMatInstance } from './wgslTypes.ts';

export class MatrixColumnsAccess implements WithComptimeValue {
  readonly matrix: Snippet;

  constructor(matrix: Snippet) {
    this.matrix = matrix;
  }

  [$comptimeValueOf](): ComptimeValue {
    // Same as accessing `.columns` on a matrix in JS
    const known = asComptime(this.matrix);
    return known
      ? { comptime: true, value: (known.value as AnyMatInstance).columns }
      : { comptime: false };
  }
}
