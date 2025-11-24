import type {
  IndexFlag,
  RenderFlag,
  SampledFlag,
  TgpuBindGroup,
  TgpuBindGroupLayout,
  TgpuBuffer,
  TgpuRenderPipeline,
  TgpuRoot,
  TgpuTexture,
  TgpuUniform,
  VertexFlag,
} from 'typegpu';
import * as d from 'typegpu/data';
import { Camera } from './camera.ts';
import {
  type InstanceData,
  instanceLayout,
  type VertexData,
  vertexLayout,
} from './types.ts';

export class PointLight {
  #root: TgpuRoot;
  #position: d.v3f;
  #far: number;
  #shadowMapSize: number;
  #depthCubeTexture:
    & TgpuTexture<{
      size: [number, number, 6];
      format: 'depth24plus';
    }>
    & SampledFlag
    & RenderFlag;
  #shadowCameras: {
    right: Camera;
    left: Camera;
    up: Camera;
    down: Camera;
    forward: Camera;
    backward: Camera;
  };
  #positionUniform: TgpuUniform<d.Vec3f>;
  #bindGroups: Map<string, TgpuBindGroup> = new Map();

  constructor(
    root: TgpuRoot,
    position: d.v3f,
    options: {
      far?: number;
      shadowMapSize?: number;
    } = {},
  ) {
    this.#root = root;
    this.#position = position;
    this.#far = options.far ?? 100.0;
    this.#shadowMapSize = options.shadowMapSize ?? 512;

    this.#depthCubeTexture = root['~unstable']
      .createTexture({
        size: [this.#shadowMapSize, this.#shadowMapSize, 6],
        dimension: '2d',
        format: 'depth24plus',
      })
      .$usage('render', 'sampled');

    this.#positionUniform = root.createUniform(d.vec3f, this.#position);

    this.#shadowCameras = {
      right: new Camera(root, 90, 0.1, this.#far),
      left: new Camera(root, 90, 0.1, this.#far),
      up: new Camera(root, 90, 0.1, this.#far),
      down: new Camera(root, 90, 0.1, this.#far),
      forward: new Camera(root, 90, 0.1, this.#far),
      backward: new Camera(root, 90, 0.1, this.#far),
    };

    this.#configureCameras();
  }

  #configureCameras() {
    // +X (Right)
    this.#shadowCameras.right.position = this.#position;
    this.#shadowCameras.right.target = this.#position.add(d.vec3f(1, 0, 0));
    this.#shadowCameras.right.up = d.vec3f(0, 1, 0);

    // -X (Left)
    this.#shadowCameras.left.position = this.#position;
    this.#shadowCameras.left.target = this.#position.add(d.vec3f(-1, 0, 0));
    this.#shadowCameras.left.up = d.vec3f(0, 1, 0);

    // +Y (Top)
    this.#shadowCameras.up.position = this.#position;
    this.#shadowCameras.up.target = this.#position.add(d.vec3f(0, 1, 0));
    this.#shadowCameras.up.up = d.vec3f(0, 0, -1);

    // -Y (Bottom)
    this.#shadowCameras.down.position = this.#position;
    this.#shadowCameras.down.target = this.#position.add(d.vec3f(0, -1, 0));
    this.#shadowCameras.down.up = d.vec3f(0, 0, 1);

    // +Z (Front)
    this.#shadowCameras.forward.position = this.#position;
    this.#shadowCameras.forward.target = this.#position.add(d.vec3f(0, 0, 1));
    this.#shadowCameras.forward.up = d.vec3f(0, 1, 0);

    // -Z (Back)
    this.#shadowCameras.backward.position = this.#position;
    this.#shadowCameras.backward.target = this.#position.add(d.vec3f(0, 0, -1));
    this.#shadowCameras.backward.up = d.vec3f(0, 1, 0);
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

  get far(): number {
    return this.#far;
  }

  get depthCubeTexture() {
    return this.#depthCubeTexture;
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
    vertexBuffer: TgpuBuffer<d.WgslArray<VertexData>> & VertexFlag,
    instanceBuffer: TgpuBuffer<d.WgslArray<InstanceData>> & VertexFlag,
    indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag,
    vertexCount: number,
    instanceCount: number,
  ) {
    const faceIndices = {
      right: 0,
      left: 1,
      up: 2,
      down: 3,
      forward: 4,
      backward: 5,
    };

    for (const [key, camera] of Object.entries(this.#shadowCameras)) {
      const view = this.#depthCubeTexture.createView(d.textureDepth2d(), {
        baseArrayLayer: faceIndices[key as keyof typeof faceIndices],
        arrayLayerCount: 1,
      });

      let bindGroup = this.#bindGroups.get(key);
      if (!bindGroup) {
        bindGroup = this.#root.createBindGroup(bindGroupLayout, {
          camera: camera.uniform.buffer,
          lightPosition: this.#positionUniform.buffer,
        });
        this.#bindGroups.set(key, bindGroup);
      }

      pipeline
        .withDepthStencilAttachment({
          view: this.#root.unwrap(view),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        })
        .with(vertexLayout, vertexBuffer)
        .with(instanceLayout, instanceBuffer)
        .with(bindGroup)
        .withIndexBuffer(indexBuffer)
        .drawIndexed(
          vertexCount,
          instanceCount,
        );
    }
  }
}
