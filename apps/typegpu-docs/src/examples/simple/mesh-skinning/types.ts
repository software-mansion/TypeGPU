import * as d from 'typegpu/data';

export const VertexData = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
  joint: d.vec4u,
  weight: d.vec4f,
});

export interface GLTFNode {
  name?: string;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  children?: number[];
  mesh?: number;
  skin?: number;
}

export interface AnimationSampler {
  input: Float32Array;
  output: Float32Array;
  interpolation: 'LINEAR' | 'STEP' | 'CUBICSPLINE';
}

export interface AnimationChannel {
  samplerIndex: number;
  targetNode: number;
  targetPath: 'translation' | 'rotation' | 'scale';
}

export interface Animation {
  name: string;
  duration: number;
  samplers: AnimationSampler[];
  channels: AnimationChannel[];
}

export interface ModelData {
  positions: Float32Array;
  normals: Float32Array;
  joints: Uint32Array;
  weights: Float32Array;
  indices: Uint16Array;
  inverseBindMatrices: Float32Array;
  nodes: GLTFNode[];
  jointNodes: number[];
  vertexCount: number;
  animations: Animation[];
  jointCount: number;
}
