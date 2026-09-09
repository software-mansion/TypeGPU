import { tgpu, d, type TgpuCommandEncoder, type TgpuRenderPipeline, type TgpuRoot } from 'typegpu';
import * as m from 'wgpu-matrix';
import { BoxGeometry } from './box-geometry.ts';
import type { Scene } from './scene.ts';
import { instanceLayout, vertexLayout } from './types.ts';

const FACE_CONFIGS = [
  { name: 'right', dir: d.vec3f(-1, 0, 0), up: d.vec3f(0, 1, 0) },
  { name: 'left', dir: d.vec3f(1, 0, 0), up: d.vec3f(0, 1, 0) },
  { name: 'up', dir: d.vec3f(0, 1, 0), up: d.vec3f(0, 0, -1) },
  { name: 'down', dir: d.vec3f(0, -1, 0), up: d.vec3f(0, 0, 1) },
  { name: 'forward', dir: d.vec3f(0, 0, 1), up: d.vec3f(0, 1, 0) },
  { name: 'backward', dir: d.vec3f(0, 0, -1), up: d.vec3f(0, 1, 0) },
] as const;

export const faceViewProj = tgpu.accessor(d.mat4x4f);

const faceLayout = tgpu.bindGroupLayout({
  viewProj: { uniform: d.mat4x4f },
});

export class PointLight {
  readonly far: number;
  readonly #positionUniform;
  readonly #depthCubeTexture;
  readonly #faceViews;
  readonly #faceMatrices;
  readonly #faceProjection;
  readonly #faceImmediate;
  readonly #faceUniforms;
  readonly #faceBindGroups;

  #position: d.v3f;

  constructor(
    root: TgpuRoot,
    position: d.v3f,
    options: { far?: number; shadowMapSize?: number } = {},
  ) {
    this.#position = position;
    this.far = options.far ?? 100.0;
    const shadowMapSize = options.shadowMapSize ?? 512;

    this.#depthCubeTexture = root
      .createTexture({
        size: [shadowMapSize, shadowMapSize, 6],
        dimension: '2d',
        format: 'depth24plus',
      })
      .$usage('render', 'sampled');

    this.#faceViews = FACE_CONFIGS.map((_, i) =>
      this.#depthCubeTexture.createView(d.textureDepth2d(), {
        baseArrayLayer: i,
        arrayLayerCount: 1,
      }),
    );

    this.#positionUniform = root.createUniform(d.vec3f, position);
    this.#faceProjection = m.mat4.perspective(Math.PI / 2, 1, 0.1, this.far, d.mat4x4f());
    this.#faceMatrices = FACE_CONFIGS.map(() => d.mat4x4f());

    this.#faceImmediate = root.enabledWgslLanguageFeatures.has('immediate_address_space')
      ? tgpu['~unstable'].immediateVar(d.mat4x4f)
      : undefined;
    this.#faceUniforms = this.#faceImmediate
      ? []
      : FACE_CONFIGS.map(() => root.createUniform(d.mat4x4f));
    this.#faceBindGroups = this.#faceUniforms.map((uniform) =>
      root.createBindGroup(faceLayout, { viewProj: uniform.buffer }),
    );

    this.#updateFaceMatrices();
  }

  #updateFaceMatrices() {
    FACE_CONFIGS.forEach((config, i) => {
      const view = m.mat4.lookAt(
        this.#position,
        this.#position.add(config.dir),
        config.up,
        d.mat4x4f(),
      );
      m.mat4.mul(this.#faceProjection, view, this.#faceMatrices[i]);
      this.#faceUniforms[i]?.write(this.#faceMatrices[i]);
    });
  }

  set position(pos: d.v3f) {
    this.#position = pos;
    this.#positionUniform.write(pos);
    this.#updateFaceMatrices();
  }

  get position() {
    return this.#position;
  }

  get positionUniform() {
    return this.#positionUniform;
  }

  get faceViewProjSource() {
    return this.#faceImmediate ?? (() => faceLayout.$.viewProj);
  }

  createCubeView() {
    return this.#depthCubeTexture.createView(d.textureDepthCube());
  }

  createDepthArrayView() {
    return this.#depthCubeTexture.createView(d.textureDepth2dArray(), {
      baseArrayLayer: 0,
      arrayLayerCount: 6,
      aspect: 'depth-only',
    });
  }

  renderShadowMaps(pipeline: TgpuRenderPipeline, scene: Scene, encoder: TgpuCommandEncoder) {
    this.#faceViews.forEach((view, face) => {
      const pass = encoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view },
      });
      pass.setVertexBuffer(vertexLayout, BoxGeometry.vertexBuffer);
      pass.setVertexBuffer(instanceLayout, scene.instanceBuffer);
      pass.setIndexBuffer(BoxGeometry.indexBuffer, 'uint16');
      pass.setPipeline(pipeline);
      if (this.#faceImmediate) {
        pass.setImmediates(this.#faceImmediate, this.#faceMatrices[face]);
      } else {
        pass.setBindGroup(this.#faceBindGroups[face]);
      }
      pass.drawIndexed(BoxGeometry.indexCount, scene.instanceCount);
      pass.end();
    });
  }
}
