export function transposeFloat32(
  data: Float32Array,
  rows: number,
  cols: number,
) {
  const out = new Float32Array(data.length);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const srcIdx = r * cols + c;
      out[c * rows + r] = data[srcIdx] as number;
    }
  }
  return out;
}
