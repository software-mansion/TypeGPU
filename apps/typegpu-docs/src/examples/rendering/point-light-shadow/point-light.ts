import type { TgpuBindGroup, TgpuBindGroupLayout, TgpuRenderPipeline, TgpuRoot } from 'typegpu';
import { d } from 'typegpu';
import { BoxGeometry } from './box-geometry.ts';
import { Camera } from './camera.ts';
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

export class PointLight {
  readonly far: number;
  readonly #root: TgpuRoot;
  readonly #positionUniform;
  readonly #depthCubeTexture;
  readonly #shadowCameras: Camera[];
  readonly #bindGroups: TgpuBindGroup[] = [];

  #position: d.v3f;

  constructor(
    root: TgpuRoot,
    position: d.v3f,
    options: { far?: number; shadowMapSize?: number } = {},
  ) {
    this.#root = root;
    this.#position = position;
    this.far = options.far ?? 100.0;
    const shadowMapSize = options.shadowMapSize ?? 512;

    this.#depthCubeTexture = root['~unstable']
      .createTexture({
        size: [shadowMapSize, shadowMapSize, 6],
        dimension: '2d',
        format: 'depth24plus',
      })
      .$usage('render', 'sampled');

    this.#positionUniform = root.createUniform(d.vec3f, position);
    this.#shadowCameras = FACE_CONFIGS.map(() => new Camera(root, 90, 0.1, this.far));
    this.#configureCameras();
  }

  #configureCameras() {
    FACE_CONFIGS.forEach((config, i) => {
      const camera = this.#shadowCameras[i];
      camera.position = this.#position;
      camera.target = this.#position.add(config.dir);
      camera.up = config.up;
    });
  }

  set position(pos: d.v3f) {
    this.#position = pos;
    this.#positionUniform.write(pos);
    this.#configureCameras();
  }

  get position() {
    return this.#position;
  }

  get positionUniform() {
    return this.#positionUniform;
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

  renderShadowMaps(
    pipeline: TgpuRenderPipeline,
    bindGroupLayout: TgpuBindGroupLayout,
    scene: Scene,
  ) {
    this.#shadowCameras.forEach((camera, i) => {
      if (!this.#bindGroups[i]) {
        this.#bindGroups[i] = this.#root.createBindGroup(bindGroupLayout, {
          camera: camera.uniform.buffer,
          lightPosition: this.#positionUniform.buffer,
        });
      }

      const view = this.#depthCubeTexture.createView(d.textureDepth2d(), {
        baseArrayLayer: i,
        arrayLayerCount: 1,
      });

      pipeline
        .withDepthStencilAttachment({
          view,
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        })
        .with(vertexLayout, BoxGeometry.vertexBuffer)
        .with(instanceLayout, scene.instanceBuffer)
        .with(this.#bindGroups[i])
        .withIndexBuffer(BoxGeometry.indexBuffer)
        .drawIndexed(BoxGeometry.indexCount, scene.instanceCount);
    });
  }
}
