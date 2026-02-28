export function multiplyMatricesCPU(
  matA: number[],
  matB: number[],
  firstRowCount: number,
  firstColumnCount: number,
  secondColumnCount: number,
): number[] {
  const result = Array(firstRowCount * secondColumnCount).fill(0);
  for (let i = 0; i < firstRowCount; i++) {
    for (let j = 0; j < secondColumnCount; j++) {
      for (let k = 0; k < firstColumnCount; k++) {
        result[i * secondColumnCount + j] +=
          matA[i * firstColumnCount + k] * matB[k * secondColumnCount + j];
      }
    }
  }
  return result;
}
