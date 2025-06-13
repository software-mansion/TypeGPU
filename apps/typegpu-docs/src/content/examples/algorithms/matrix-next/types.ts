import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export type CalculationStrategy = 'gpu-optimized' | 'gpu-simple' | 'cpu';

export const MatrixInfo = d.struct({
  firstRowCount: d.u32,
  firstColumnCount: d.u32,
  secondColumnCount: d.u32,
});

export const createMatrixData = (capacity: number) =>
  d.arrayOf(d.i32, capacity);

export const computeLayout = tgpu.bindGroupLayout({
  firstMatrix: {
    storage: (n: number) => createMatrixData(n),
    access: 'readonly',
  },
  secondMatrix: {
    storage: (n: number) => createMatrixData(n),
    access: 'readonly',
  },
  resultMatrix: {
    storage: (n: number) => createMatrixData(n),
    access: 'mutable',
  },
  dimensions: { uniform: MatrixInfo },
});
