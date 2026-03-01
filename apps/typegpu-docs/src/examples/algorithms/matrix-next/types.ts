import tgpu, { d } from 'typegpu';

export type CalculationStrategy = 'gpu-optimized' | 'gpu-simple' | 'cpu';

export const MatrixInfo = d.struct({
  firstRowCount: d.u32,
  firstColumnCount: d.u32,
  secondColumnCount: d.u32,
});

export const createMatrixData = (capacity: number) => d.arrayOf(d.i32, capacity);

export const computeLayout = tgpu.bindGroupLayout({
  firstMatrix: {
    storage: createMatrixData,
    access: 'readonly',
  },
  secondMatrix: {
    storage: createMatrixData,
    access: 'readonly',
  },
  resultMatrix: {
    storage: createMatrixData,
    access: 'mutable',
  },
  dimensions: { uniform: MatrixInfo },
});
