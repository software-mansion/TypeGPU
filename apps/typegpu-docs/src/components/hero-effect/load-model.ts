import { load } from '@loaders.gl/core';
import { GLTFLoader, GLTFScenegraph } from '@loaders.gl/gltf';
import { tgpu, d, common, type TgpuRoot } from 'typegpu';

const ModelVertexInput = d.struct({
  pos: d.vec3f,
  normal: d.vec3f,
});

export const modelVertexLayout = tgpu.vertexLayout(d.arrayOf(ModelVertexInput));

function createMeshBuffers(root: TgpuRoot, graph: GLTFScenegraph, meshIdx: number) {
  const mesh = graph.getMesh(meshIdx);
  const posPtr = mesh.primitives[0].attributes.POSITION;
  const normalPtr = mesh.primitives[0].attributes.NORMAL;
  const idxPtr = mesh.primitives[0].indices;
  if (posPtr === undefined || normalPtr === undefined || idxPtr === undefined) {
    throw new Error(`Missing required attributes: ${posPtr}, ${normalPtr}, ${idxPtr}`);
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

  const idxBuffer = graph.gltf.buffers[idxView.buffer];
  const idxBufferView = new Uint16Array(
    idxBuffer.arrayBuffer,
    idxBuffer.byteOffset + (idxView.byteOffset ?? 0),
  );

  const vertexBufferGPU = root
    .createBuffer(modelVertexLayout.schemaForCount(vertexCount), (buffer) => {
      common.writeSoA(buffer, {
        normal: normalBufferView,
        pos: posBufferView,
      });
    })
    .$usage('vertex')
    .$name(`plum body vertices`);

  const indexBufferGPU = root
    .createBuffer(d.arrayOf(d.u16, indexCount), idxBufferView)
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

  const body = createMeshBuffers(root, graph, 0);
  const tail = createMeshBuffers(root, graph, 1);

  return {
    body,
    tail,
    destroy() {
      body.indexBuffer.destroy();
      body.vertexBuffer.destroy();

      tail.indexBuffer.destroy();
      tail.vertexBuffer.destroy();
    },
  };
}
