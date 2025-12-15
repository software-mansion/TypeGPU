import * as d from 'typegpu/data';

export const VertexData = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
  joint: d.vec2u,
  weight: d.vec2f,
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
}
