import * as TSL from 'three/tsl';
import { tgpu, d } from 'typegpu';
import { fromTSL } from './typegpu-node.ts';

export const uv = /*#__PURE__*/ tgpu.comptime((index?: number) => fromTSL(TSL.uv(index), d.vec2f));

export const vertexColor = /*#__PURE__*/ tgpu.comptime((index?: number) =>
  fromTSL(TSL.vertexColor(index), d.vec4f),
);

export const time = /*#__PURE__*/ fromTSL(TSL.time, d.f32);

export const deltaTime = /*#__PURE__*/ fromTSL(TSL.deltaTime, d.f32);

export const frameId = /*#__PURE__*/ fromTSL(TSL.frameId, d.u32);

export const instanceIndex = /*#__PURE__*/ fromTSL(TSL.instanceIndex, d.u32);

export const vertexIndex = /*#__PURE__*/ fromTSL(TSL.vertexIndex, d.u32);

export const drawIndex = /*#__PURE__*/ fromTSL(TSL.drawIndex, d.u32);

export const invocationLocalIndex = /*#__PURE__*/ fromTSL(TSL.invocationLocalIndex, d.u32);

export const invocationSubgroupIndex = /*#__PURE__*/ fromTSL(TSL.invocationSubgroupIndex, d.u32);

export const subgroupIndex = /*#__PURE__*/ fromTSL(TSL.subgroupIndex, d.u32);

export const numWorkgroups = /*#__PURE__*/ fromTSL(TSL.numWorkgroups, d.vec3u);

export const workgroupId = /*#__PURE__*/ fromTSL(TSL.workgroupId, d.vec3u);

export const globalId = /*#__PURE__*/ fromTSL(TSL.globalId, d.vec3u);

export const localId = /*#__PURE__*/ fromTSL(TSL.localId, d.vec3u);

export const subgroupSize = /*#__PURE__*/ fromTSL(TSL.subgroupSize, d.u32);

export const frontFacing = /*#__PURE__*/ fromTSL(TSL.frontFacing, d.bool);

export const faceDirection = /*#__PURE__*/ fromTSL(TSL.faceDirection, d.f32);

export const pointUV = /*#__PURE__*/ fromTSL(TSL.pointUV, d.vec2f);

export const velocity = /*#__PURE__*/ fromTSL(TSL.velocity, d.vec2f);

export const screenDPR = /*#__PURE__*/ fromTSL(TSL.screenDPR, d.f32);

export const screenUV = /*#__PURE__*/ fromTSL(TSL.screenUV, d.vec2f);

export const screenSize = /*#__PURE__*/ fromTSL(TSL.screenSize, d.vec2f);

export const screenCoordinate = /*#__PURE__*/ fromTSL(TSL.screenCoordinate, d.vec2f);

export const viewport = /*#__PURE__*/ fromTSL(TSL.viewport, d.vec4f);

export const viewportSize = /*#__PURE__*/ fromTSL(TSL.viewportSize, d.vec2f);

export const viewportCoordinate = /*#__PURE__*/ fromTSL(TSL.viewportCoordinate, d.vec2f);

export const viewportUV = /*#__PURE__*/ fromTSL(TSL.viewportUV, d.vec2f);

export const cameraIndex = /*#__PURE__*/ fromTSL(TSL.cameraIndex, d.u32);

export const cameraNear = /*#__PURE__*/ fromTSL(TSL.cameraNear, d.f32);

export const cameraFar = /*#__PURE__*/ fromTSL(TSL.cameraFar, d.f32);

export const cameraProjectionMatrix = /*#__PURE__*/ fromTSL(TSL.cameraProjectionMatrix, d.mat4x4f);

export const cameraProjectionMatrixInverse = /*#__PURE__*/ fromTSL(
  TSL.cameraProjectionMatrixInverse,
  d.mat4x4f,
);

export const cameraViewMatrix = /*#__PURE__*/ fromTSL(TSL.cameraViewMatrix, d.mat4x4f);

export const cameraWorldMatrix = /*#__PURE__*/ fromTSL(TSL.cameraWorldMatrix, d.mat4x4f);

export const cameraNormalMatrix = /*#__PURE__*/ fromTSL(TSL.cameraNormalMatrix, d.mat3x3f);

export const cameraPosition = /*#__PURE__*/ fromTSL(TSL.cameraPosition, d.vec3f);

export const cameraViewport = /*#__PURE__*/ fromTSL(TSL.cameraViewport, d.vec4f);

export const modelDirection = /*#__PURE__*/ fromTSL(TSL.modelDirection, d.vec3f);

export const modelWorldMatrix = /*#__PURE__*/ fromTSL(TSL.modelWorldMatrix, d.mat4x4f);

export const modelPosition = /*#__PURE__*/ fromTSL(TSL.modelPosition, d.vec3f);

export const modelScale = /*#__PURE__*/ fromTSL(TSL.modelScale, d.vec3f);

export const modelViewPosition = /*#__PURE__*/ fromTSL(TSL.modelViewPosition, d.vec3f);

export const modelRadius = /*#__PURE__*/ fromTSL(TSL.modelRadius, d.f32);

export const modelNormalMatrix = /*#__PURE__*/ fromTSL(TSL.modelNormalMatrix, d.mat3x3f);

export const modelWorldMatrixInverse = /*#__PURE__*/ fromTSL(
  TSL.modelWorldMatrixInverse,
  d.mat4x4f,
);

export const modelViewMatrix = /*#__PURE__*/ fromTSL(TSL.modelViewMatrix, d.mat4x4f);

export const mediumpModelViewMatrix = /*#__PURE__*/ fromTSL(TSL.mediumpModelViewMatrix, d.mat4x4f);

export const highpModelNormalViewMatrix = /*#__PURE__*/ fromTSL(
  TSL.highpModelNormalViewMatrix,
  d.mat3x3f,
);

export const modelViewProjection = /*#__PURE__*/ fromTSL(TSL.modelViewProjection, d.vec4f);

export const positionGeometry = /*#__PURE__*/ fromTSL(TSL.positionGeometry, d.vec3f);

export const positionLocal = /*#__PURE__*/ fromTSL(TSL.positionLocal, d.vec3f);

export const positionPrevious = /*#__PURE__*/ fromTSL(TSL.positionPrevious, d.vec3f);

export const positionWorld = /*#__PURE__*/ fromTSL(TSL.positionWorld, d.vec3f);

export const positionWorldDirection = /*#__PURE__*/ fromTSL(TSL.positionWorldDirection, d.vec3f);

export const positionView = /*#__PURE__*/ fromTSL(TSL.positionView, d.vec3f);

export const positionViewDirection = /*#__PURE__*/ fromTSL(TSL.positionViewDirection, d.vec3f);

export const normalGeometry = /*#__PURE__*/ fromTSL(TSL.normalGeometry, d.vec3f);

export const normalLocal = /*#__PURE__*/ fromTSL(TSL.normalLocal, d.vec3f);

export const normalFlat = /*#__PURE__*/ fromTSL(TSL.normalFlat, d.vec3f);

export const normalViewGeometry = /*#__PURE__*/ fromTSL(TSL.normalViewGeometry, d.vec3f);

export const normalWorldGeometry = /*#__PURE__*/ fromTSL(TSL.normalWorldGeometry, d.vec3f);

export const normalView = /*#__PURE__*/ fromTSL(TSL.normalView, d.vec3f);

export const normalWorld = /*#__PURE__*/ fromTSL(TSL.normalWorld, d.vec3f);

export const clearcoatNormalView = /*#__PURE__*/ fromTSL(TSL.clearcoatNormalView, d.vec3f);

export const tangentGeometry = /*#__PURE__*/ fromTSL(TSL.tangentGeometry, d.vec3f);

export const tangentLocal = /*#__PURE__*/ fromTSL(TSL.tangentLocal, d.vec3f);

export const tangentView = /*#__PURE__*/ fromTSL(TSL.tangentView, d.vec3f);

export const tangentWorld = /*#__PURE__*/ fromTSL(TSL.tangentWorld, d.vec3f);

export const bitangentGeometry = /*#__PURE__*/ fromTSL(TSL.bitangentGeometry, d.vec3f);

export const bitangentLocal = /*#__PURE__*/ fromTSL(TSL.bitangentLocal, d.vec3f);

export const bitangentView = /*#__PURE__*/ fromTSL(TSL.bitangentView, d.vec3f);

export const bitangentWorld = /*#__PURE__*/ fromTSL(TSL.bitangentWorld, d.vec3f);

export const tbnViewMatrix = /*#__PURE__*/ fromTSL(TSL.TBNViewMatrix, d.mat3x3f);

export const parallaxDirection = /*#__PURE__*/ fromTSL(TSL.parallaxDirection, d.vec3f);

export const bentNormalView = /*#__PURE__*/ fromTSL(TSL.bentNormalView, d.vec3f);

export const reflectView = /*#__PURE__*/ fromTSL(TSL.reflectView, d.vec3f);

export const refractView = /*#__PURE__*/ fromTSL(TSL.refractView, d.vec3f);

export const reflectVector = /*#__PURE__*/ fromTSL(TSL.reflectVector, d.vec3f);

export const refractVector = /*#__PURE__*/ fromTSL(TSL.refractVector, d.vec3f);

export const matcapUV = /*#__PURE__*/ fromTSL(TSL.matcapUV, d.vec2f);
