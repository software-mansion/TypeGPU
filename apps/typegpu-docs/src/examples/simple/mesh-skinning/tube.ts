export function generateTube(rings: number, segs: number, radius: number, height: number) {
  const vertexCount = rings * segs;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const joints = new Uint32Array(vertexCount * 4);
  const weights = new Float32Array(vertexCount * 4);

  for (let r = 0; r < rings; r++) {
    const y = (r / (rings - 1)) * height - height / 2;
    const blend = r / (rings - 1);
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const i = r * segs + s;
      positions.set([Math.cos(a) * radius, y, Math.sin(a) * radius], i * 3);
      normals.set([Math.cos(a), 0, Math.sin(a)], i * 3);
      joints.set([0, 1, 0, 0], i * 4);
      weights.set([1 - blend, blend, 0, 0], i * 4);
    }
  }

  const indexCount = (rings - 1) * segs * 6;
  const indices = new Uint16Array(indexCount);
  let idx = 0;
  for (let r = 0; r < rings - 1; r++) {
    for (let s = 0; s < segs; s++) {
      const c = r * segs + s;
      const n = r * segs + ((s + 1) % segs);
      indices.set([c, c + segs, n, n, c + segs, n + segs], idx);
      idx += 6;
    }
  }

  return { positions, normals, joints, weights, indices, vertexCount, indexCount };
}
