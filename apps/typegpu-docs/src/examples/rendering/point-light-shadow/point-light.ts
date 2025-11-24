import type {
  RenderFlag,
  SampledFlag,
  TgpuBindGroupLayout,
  TgpuBuffer,
  TgpuRenderPipeline,
  TgpuRoot,
  TgpuTexture,
  TgpuUniform,
  TgpuVertexLayout,
  UniformFlag,
} from 'typegpu';
import * as d from 'typegpu/data';
import type { BoxGeometry } from './box-geometry.ts';
import { Camera } from './camera.ts';

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

    // Create cubemap depth texture
    this.#depthCubeTexture = root['~unstable']
      .createTexture({
        size: [this.#shadowMapSize, this.#shadowMapSize, 6],
        dimension: '2d',
        format: 'depth24plus',
      })
      .$usage('render', 'sampled');

    // Create position uniform
    this.#positionUniform = root.createUniform(d.vec3f, this.#position);

    // Create shadow cameras for each cubemap face
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
    // WebGPU cubemap face orientations based on spec diagram
    // For lookAt: right = cross(forward, worldUp), so we need to find worldUp such that right matches +U direction

    // [0] +X face: forward=+X, +U=-Z, +V=-Y
    // cross(+X, worldUp) = -Z → cross((1,0,0), (0,a,b)) = (0,-b,a) = (0,0,-1) → a=-1, b=0
    this.#shadowCameras.right.position = this.#position;
    this.#shadowCameras.right.target = this.#position.add(d.vec3f(1, 0, 0));
    this.#shadowCameras.right.up = d.vec3f(0, -1, 0);

    // [1] -X face: forward=-X, +U=+Z, +V=-Y
    // cross(-X, worldUp) = +Z → cross((-1,0,0), (0,a,b)) = (0,b,-a) = (0,0,1) → b=0, a=-1
    this.#shadowCameras.left.position = this.#position;
    this.#shadowCameras.left.target = this.#position.add(d.vec3f(-1, 0, 0));
    this.#shadowCameras.left.up = d.vec3f(0, -1, 0);

    // [2] +Y face: forward=+Y, +U=+X, +V=+Z
    // cross(+Y, worldUp) = +X → cross((0,1,0), (a,0,c)) = (c,0,-a) = (1,0,0) → c=1, a=0
    this.#shadowCameras.up.position = this.#position;
    this.#shadowCameras.up.target = this.#position.add(d.vec3f(0, -1, 0));
    this.#shadowCameras.up.up = d.vec3f(0, 0, -1);

    // [3] -Y face: +U points +X, +V points -Z
    // Camera right should be +X, camera up should be -Z
    this.#shadowCameras.down.position = this.#position;
    this.#shadowCameras.down.target = this.#position.add(d.vec3f(0, 1, 0));
    this.#shadowCameras.down.up = d.vec3f(0, 0, 1);

    // [4] +Z face: +U points +X, +V points -Y
    // Camera right should be +X, camera up should be -Y
    this.#shadowCameras.forward.position = this.#position;
    this.#shadowCameras.forward.target = this.#position.add(d.vec3f(0, 0, 1));
    this.#shadowCameras.forward.up = d.vec3f(0, -1, 0);

    // [5] -Z face: +U points -X, +V points -Y
    // Camera right should be -X, camera up should be -Y
    this.#shadowCameras.backward.position = this.#position;
    this.#shadowCameras.backward.target = this.#position.add(d.vec3f(0, 0, -1));
    this.#shadowCameras.backward.up = d.vec3f(0, -1, 0);
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

  createDebugArrayView() {
    return this.#depthCubeTexture.createView(d.textureDepth2dArray(), {
      baseArrayLayer: 0,
      arrayLayerCount: 6,
      aspect: 'depth-only',
    });
  }

  renderShadowMaps(
    pipeline: TgpuRenderPipeline,
    bindGroupLayout: TgpuBindGroupLayout,
    modelMatrixUniform: TgpuBuffer<d.Mat4x4f> & UniformFlag,
    vertexLayout: TgpuVertexLayout,
    geometries: BoxGeometry[],
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

      const bindGroup = this.#root.createBindGroup(bindGroupLayout, {
        camera: camera.uniform.buffer,
        modelMatrix: modelMatrixUniform,
        lightPosition: this.#positionUniform.buffer,
      });

      // Render each geometry
      for (let i = 0; i < geometries.length; i++) {
        const geometry = geometries[i];
        modelMatrixUniform.write(geometry.modelMatrix);

        pipeline
          .withDepthStencilAttachment({
            view: this.#root.unwrap(view),
            depthClearValue: 1,
            depthLoadOp: i === 0 ? 'clear' : 'load',
            depthStoreOp: 'store',
          })
          .with(vertexLayout, geometry.vertexBuffer)
          .with(bindGroup)
          .withIndexBuffer(geometry.indexBuffer)
          .drawIndexed(geometry.indexCount);
      }
    }
  }
}
