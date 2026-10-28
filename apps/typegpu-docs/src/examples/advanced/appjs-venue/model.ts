import { d, tgpu, type TgpuRoot } from 'typegpu';

export const ModelVertexInput = d.unstruct({
  position: d.float32x3,
  normal: d.float32x3,
  uv: d.float32x2,
});

export const modelVertexLayout = tgpu.vertexLayout(d.disarrayOf(ModelVertexInput));

/**
 * Loads a model stored as raw, tightly packed `ModelVertexInput` vertices (one triangle every 3 vertices).
 */
export async function loadModel(root: TgpuRoot, url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load model: ${url}`);
  }
  const data = await response.arrayBuffer();
  const vertexCount = data.byteLength / d.sizeOf(ModelVertexInput);

  const vertexBuffer = root
    .createBuffer(modelVertexLayout.schemaForCount(vertexCount))
    .$usage('vertex');
  vertexBuffer.write(data);

  return { vertexBuffer, vertexCount };
}
