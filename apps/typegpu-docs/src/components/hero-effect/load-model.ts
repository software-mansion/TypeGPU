import { load } from '@loaders.gl/core';
import { GLTFLoader, GLTFScenegraph } from '@loaders.gl/gltf';
import { tgpu, type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';

const ModelVertexInput = d.unstruct({
  pos: d.vec3f,
  normal: d.vec3f,
});

export const modelVertexLayout = tgpu.vertexLayout(
  d.disarrayOf(ModelVertexInput),
);

function createMeshBuffers(
  root: TgpuRoot,
  graph: GLTFScenegraph,
  meshIdx: number,
) {
  const mesh = graph.getMesh(meshIdx);
  const posPtr = mesh.primitives[0].attributes.POSITION;
  const normalPtr = mesh.primitives[0].attributes.NORMAL;
  const idxPtr = mesh.primitives[0].indices;
  if (posPtr === undefined || normalPtr === undefined || idxPtr === undefined) {
    throw new Error(
      `Missing required attributes: ${posPtr}, ${normalPtr}, ${idxPtr}`,
    );
  }

  const posView = graph.getBufferView(posPtr);
  const normalView = graph.getBufferView(normalPtr);
  const idxView = graph.getBufferView(idxPtr);

  const posBuffer = graph.gltf.buffers[posView.buffer];
  const posBufferView = new Float32Array(
    posBuffer.arrayBuffer,
    posBuffer.byteOffset + (posView.byteOffset ?? 0),
    posView.byteLength / 4,
  );

  const normalBuffer = graph.gltf.buffers[normalView.buffer];
  const normalBufferView = new Float32Array(
    normalBuffer.arrayBuffer,
    normalBuffer.byteOffset + (normalView.byteOffset ?? 0),
    normalView.byteLength / 4,
  );

  // Assuming u16 format for indices
  const indexCount = idxView.byteLength / 2;
  // Assuming f32 format for positions and normals
  const vertexCount = posView.byteLength / 4 / 3;

  const vertices: d.Infer<typeof ModelVertexInput>[] = [];
  for (let i = 0; i < vertexCount; i++) {
    vertices.push({
      pos: d.vec3f(
        posBufferView[3 * i],
        posBufferView[3 * i + 1],
        posBufferView[3 * i + 2],
      ),
      normal: d.vec3f(
        normalBufferView[3 * i],
        normalBufferView[3 * i + 1],
        normalBufferView[3 * i + 2],
      ),
    });
  }

  const idxBuffer = graph.gltf.buffers[idxView.buffer];
  const idxBufferView = new Uint16Array(
    idxBuffer.arrayBuffer,
    idxBuffer.byteOffset + (idxView.byteOffset ?? 0),
  );

  const bodyIndices: number[] = [];
  for (let i = 0; i < indexCount; i++) {
    bodyIndices.push(idxBufferView[i]);
  }

  const vertexBufferGPU = root
    .createBuffer(
      modelVertexLayout.schemaForCount(vertexCount),
      vertices,
    )
    .$usage('vertex')
    .$name(`plum body vertices`);

  const indexBufferGPU = root
    .createBuffer(d.arrayOf(d.u16, indexCount), bodyIndices)
    .$usage('index')
    .$name(`plum body indices`);

  return {
    indexCount,
    vertexBuffer: vertexBufferGPU,
    indexBuffer: indexBufferGPU,
  };
}

export async function loadModel(root: TgpuRoot) {
  const modelMesh = await load('/TypeGPU/assets/plum.glb', GLTFLoader);
  const graph = new GLTFScenegraph(modelMesh);

  return {
    body: createMeshBuffers(root, graph, 0),
    tail: createMeshBuffers(root, graph, 1),
  };
}
