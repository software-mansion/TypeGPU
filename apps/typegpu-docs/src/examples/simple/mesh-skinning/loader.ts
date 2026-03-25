import { load } from '@loaders.gl/core';
import { GLBLoader } from '@loaders.gl/gltf';
import type { Animation, AnimationChannel, AnimationSampler, ModelData } from './types.ts';

interface GLTFAnimationSampler {
  input: number;
  output: number;
  interpolation?: string;
}

interface GLTFAnimationChannel {
  sampler: number;
  target: { node: number; path: 'translation' | 'rotation' | 'scale' };
}

interface GLTFAnimation {
  name?: string;
  samplers: GLTFAnimationSampler[];
  channels: GLTFAnimationChannel[];
}

const GLTF_COMPONENT_TYPE = {
  BYTE: 5120,
  UNSIGNED_BYTE: 5121,
  SHORT: 5122,
  UNSIGNED_SHORT: 5123,
  UNSIGNED_INT: 5125,
  FLOAT: 5126,
} as const;

const COMPONENT_SIZES: Record<number, number> = {
  [GLTF_COMPONENT_TYPE.BYTE]: 1,
  [GLTF_COMPONENT_TYPE.UNSIGNED_BYTE]: 1,
  [GLTF_COMPONENT_TYPE.SHORT]: 2,
  [GLTF_COMPONENT_TYPE.UNSIGNED_SHORT]: 2,
  [GLTF_COMPONENT_TYPE.UNSIGNED_INT]: 4,
  [GLTF_COMPONENT_TYPE.FLOAT]: 4,
};

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT4: 16,
};

const TYPED_ARRAYS: Record<
  number,
  | typeof Int8Array
  | typeof Uint8Array
  | typeof Int16Array
  | typeof Uint16Array
  | typeof Uint32Array
  | typeof Float32Array
> = {
  [GLTF_COMPONENT_TYPE.BYTE]: Int8Array,
  [GLTF_COMPONENT_TYPE.UNSIGNED_BYTE]: Uint8Array,
  [GLTF_COMPONENT_TYPE.SHORT]: Int16Array,
  [GLTF_COMPONENT_TYPE.UNSIGNED_SHORT]: Uint16Array,
  [GLTF_COMPONENT_TYPE.UNSIGNED_INT]: Uint32Array,
  [GLTF_COMPONENT_TYPE.FLOAT]: Float32Array,
};

export async function loadGLBModel(path: string): Promise<ModelData> {
  const model = await load(path, GLBLoader);
  const { arrayBuffer, byteOffset, byteLength } = model.binChunks[0];
  const binChunk = arrayBuffer.slice(byteOffset, byteOffset + byteLength);
  const { accessors, bufferViews, meshes, skins, nodes, animations: rawAnims } = model.json;

  const getTypedArray = (idx: number) => {
    const acc = accessors[idx];
    const view = bufferViews[acc.bufferView];
    const offset = (view.byteOffset || 0) + (acc.byteOffset || 0);
    const length = acc.count * TYPE_COMPONENTS[acc.type] * COMPONENT_SIZES[acc.componentType];
    return new TYPED_ARRAYS[acc.componentType](binChunk.slice(offset, offset + length));
  };

  const primitiveData: {
    pos: Float32Array;
    norm: Float32Array;
    joints: Uint8Array | Uint16Array;
    weights: Float32Array;
    indices: Uint16Array;
  }[] = [];
  let totalVerts = 0;
  let totalIndices = 0;

  for (const mesh of meshes) {
    for (const prim of mesh.primitives) {
      const pos = getTypedArray(prim.attributes.POSITION) as Float32Array;
      const norm = getTypedArray(prim.attributes.NORMAL) as Float32Array;
      const joints = getTypedArray(prim.attributes.JOINTS_0) as Uint8Array | Uint16Array;
      const weights = getTypedArray(prim.attributes.WEIGHTS_0) as Float32Array;
      const indices = getTypedArray(prim.indices) as Uint16Array;
      primitiveData.push({ pos, norm, joints, weights, indices });
      totalVerts += pos.length / 3;
      totalIndices += indices.length;
    }
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const joints = new Uint32Array(totalVerts * 4);
  const weights = new Float32Array(totalVerts * 4);
  const indices = new Uint16Array(totalIndices);

  let vOff = 0;
  let iOff = 0;
  let base = 0;

  for (const { pos, norm, joints: j, weights: w, indices: idx } of primitiveData) {
    const count = pos.length / 3;
    positions.set(pos, vOff * 3);
    normals.set(norm, vOff * 3);
    for (let v = 0; v < count; v++) {
      for (let c = 0; c < 4; c++) {
        joints[(vOff + v) * 4 + c] = j[v * 4 + c];
        weights[(vOff + v) * 4 + c] = w[v * 4 + c];
      }
    }
    for (let i = 0; i < idx.length; i++) {
      indices[iOff + i] = idx[i] + base;
    }
    vOff += count;
    iOff += idx.length;
    base += count;
  }

  const skin = skins[0];
  const inverseBindMatrices = getTypedArray(skin.inverseBindMatrices) as Float32Array;

  const animations: Animation[] = ((rawAnims || []) as GLTFAnimation[]).map((anim) => {
    let duration = 0;
    const samplers: AnimationSampler[] = anim.samplers.map((s) => {
      const input = getTypedArray(s.input) as Float32Array;
      const output = getTypedArray(s.output) as Float32Array;

      if (input.length > 0) {
        duration = Math.max(duration, input[input.length - 1]);
      }

      return {
        input,
        output,
        interpolation: (s.interpolation || 'LINEAR') as AnimationSampler['interpolation'],
      };
    });
    const channels: AnimationChannel[] = anim.channels.map((c) => ({
      samplerIndex: c.sampler,
      targetNode: c.target.node,
      targetPath: c.target.path,
    }));
    return { name: anim.name || 'Animation', duration, samplers, channels };
  });

  return {
    positions,
    normals,
    joints,
    weights,
    indices,
    inverseBindMatrices,
    nodes,
    jointNodes: skin.joints,
    vertexCount: totalVerts,
    animations,
    jointCount: skin.joints.length,
  };
}
