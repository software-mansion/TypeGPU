import { load } from '@loaders.gl/core';
import { GLBLoader } from '@loaders.gl/gltf';
import type { ModelData } from './types.ts';

const COMPONENT_TYPE_SIZES: Record<number, number> = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};

const ACCESSOR_TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

const TYPED_ARRAY_CONSTRUCTORS: Record<
  number,
  typeof Uint8Array | typeof Uint16Array | typeof Float32Array
> = {
  5121: Uint8Array,
  5123: Uint16Array,
  5126: Float32Array,
};

export async function loadGLBModel(path: string): Promise<ModelData> {
  const model = await load(path, GLBLoader);

  const binChunkRaw = model.binChunks[0].arrayBuffer;
  const binChunkOffset = model.binChunks[0].byteOffset;
  const binChunkLength = model.binChunks[0].byteLength;

  const binChunk = binChunkRaw.slice(
    binChunkOffset,
    binChunkOffset + binChunkLength,
  );

  const accessors = model.json.accessors;
  const bufferViews = model.json.bufferViews;

  function getTypedArray(accessorIndex: number) {
    const accessor = accessors[accessorIndex];
    const bufferView = bufferViews[accessor.bufferView];
    const bufferOffset = bufferView.byteOffset || 0;
    const accessorOffset = accessor.byteOffset || 0;
    const offset = bufferOffset + accessorOffset;

    const componentSize = COMPONENT_TYPE_SIZES[accessor.componentType];
    const componentsPerElement = ACCESSOR_TYPE_COMPONENTS[accessor.type];
    const byteLength = accessor.count * componentsPerElement * componentSize;

    const data = binChunk.slice(offset, offset + byteLength);
    const TypedArrayConstructor =
      TYPED_ARRAY_CONSTRUCTORS[accessor.componentType];

    return new TypedArrayConstructor(data);
  }

  const positions = getTypedArray(0) as Float32Array;
  const normals = getTypedArray(1) as Float32Array;
  const jointsRaw = getTypedArray(3) as Uint8Array;
  const weightsRaw = getTypedArray(4) as Float32Array;
  const indices = getTypedArray(5) as Uint16Array;
  const inverseBindMatrices = getTypedArray(6) as Float32Array;
  const nodes = model.json.nodes;
  const jointNodes = model.json.skins[0].joints;

  // Extract only first 2 joints and weights per vertex (since we only have 2 bones in this example)
  const vertexCount = positions.length / 3;
  const joints = new Uint32Array(vertexCount * 2);
  const weights = new Float32Array(vertexCount * 2);

  for (let i = 0; i < vertexCount; i++) {
    joints[i * 2] = jointsRaw[i * 4];
    joints[i * 2 + 1] = jointsRaw[i * 4 + 1];
    weights[i * 2] = weightsRaw[i * 4];
    weights[i * 2 + 1] = weightsRaw[i * 4 + 1];
  }

  return {
    positions,
    normals,
    joints,
    weights,
    indices,
    inverseBindMatrices,
    nodes,
    jointNodes,
    vertexCount,
  };
}
