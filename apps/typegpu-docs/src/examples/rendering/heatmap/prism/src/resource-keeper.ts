import type {
  IndexFlag,
  TgpuBindGroup,
  TgpuBuffer,
  TgpuRoot,
  UniformFlag,
  VertexFlag,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';

import type { CameraConfig, ScaleTransform } from './types.ts';
import * as s from './structures.ts';
import { layout, vertexLayout } from './layouts.ts';
import { createTransformMatrix } from './utils.ts';
import { GridSurface } from './grid.ts';
import * as c from './constants.ts';

interface DepthAndMsaa {
  depthTexture: GPUTexture;
  depthTextureView: GPUTextureView;
  msaaTexture: GPUTexture;
  msaaTextureView: GPUTextureView;
}

interface PlanesResources {
  vertexBuffer: TgpuBuffer<d.WgslArray<typeof s.Vertex>> & VertexFlag;
  indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag;
  xZero: {
    transformUniform: TgpuBuffer<typeof s.Transform> & UniformFlag;
    bindgroup: TgpuBindGroup<(typeof layout)['entries']>;
  };
  yZero: {
    transformUniform: TgpuBuffer<typeof s.Transform> & UniformFlag;
    bindgroup: TgpuBindGroup<(typeof layout)['entries']>;
  };
  zZero: {
    transformUniform: TgpuBuffer<typeof s.Transform> & UniformFlag;
    bindgroup: TgpuBindGroup<(typeof layout)['entries']>;
  };
}

interface SurfaceResources {
  vertexBuffer: TgpuBuffer<d.WgslArray<typeof s.Vertex>> & VertexFlag;
  indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag;
  indexCount: number;
}

export class ResourceKeeper {
  #root: TgpuRoot;
  #canvas: HTMLCanvasElement;
  #presentationFormat: GPUTextureFormat;
  #cameraUniform: TgpuBuffer<typeof s.Camera> & UniformFlag;
  #transformUniform: TgpuBuffer<typeof s.Transform> & UniformFlag;
  #bindgroup: TgpuBindGroup<(typeof layout)['entries']>;
  #planes: PlanesResources;
  #depthAndMsaa: DepthAndMsaa;
  #surfaceStack: SurfaceResources[] = [];

  constructor(
    root: TgpuRoot,
    canvas: HTMLCanvasElement,
    presentationFormat: GPUTextureFormat,
  ) {
    this.#root = root;
    this.#canvas = canvas;
    this.#presentationFormat = presentationFormat;

    this.#cameraUniform = root.createBuffer(s.Camera).$usage('uniform');

    this.#transformUniform = root.createBuffer(s.Transform)
      .$usage('uniform');

    this.#bindgroup = root.createBindGroup(layout, {
      camera: this.#cameraUniform,
      transform: this.#transformUniform,
    });

    this.#planes = this.#initPlanes();

    this.#depthAndMsaa = this.#createDepthAndMsaaTextures(
      canvas,
      presentationFormat,
    );
  }

  createSurfaceStackResources(
    surfaces: {
      vertices: d.Infer<typeof s.Vertex>[];
      indices: number[];
    }[],
  ): void {
    for (const { vertices, indices } of surfaces) {
      const vertexBuffer = this.#root.createBuffer(
        vertexLayout.schemaForCount(vertices.length),
        vertices,
      ).$usage(
        'vertex',
      );
      const indexBuffer = this.#root.createBuffer(
        d.arrayOf(d.u16, indices.length),
        indices,
      ).$usage(
        'index',
      );
      this.#surfaceStack.push({
        vertexBuffer,
        indexBuffer,
        indexCount: indices.length,
      });
    }
  }

  resetSurfaceStack(): void {
    for (const surface of this.#surfaceStack) {
      surface.vertexBuffer.destroy();
      surface.indexBuffer.destroy();
    }
    this.#surfaceStack = [];
  }

  get surfaceStack(): SurfaceResources[] {
    return this.#surfaceStack;
  }

  get bindgroup(): TgpuBindGroup<(typeof layout)['entries']> {
    return this.#bindgroup;
  }

  get planes(): PlanesResources {
    return this.#planes;
  }

  get depthAndMsaa(): DepthAndMsaa {
    return this.#depthAndMsaa;
  }

  updateTransformUniform(scaleTransform: ScaleTransform): void {
    this.#transformUniform.write(
      createTransformMatrix(scaleTransform.offset, scaleTransform.scale),
    );
  }

  updatePlanesTransformUniforms(scaleTransform: ScaleTransform): void {
    const yZeroTransform = createTransformMatrix(
      d.vec3f(0, scaleTransform.offset.y, 0),
      scaleTransform.scale,
    );

    const xZeroMatrix = d.mat4x4f
      .rotationZ(-Math.PI / 2)
      .mul(
        createTransformMatrix(
          d.vec3f(0, scaleTransform.offset.x, 0),
          scaleTransform.scale,
        ).model,
      );

    const zZeroMatrix = d.mat4x4f
      .rotationX(Math.PI / 2)
      .mul(
        createTransformMatrix(
          d.vec3f(0, scaleTransform.offset.z, 0),
          scaleTransform.scale,
        ).model,
      );

    this.#planes.yZero.transformUniform.write(yZeroTransform);
    this.#planes.xZero.transformUniform.write({ model: xZeroMatrix });
    this.#planes.zZero.transformUniform.write({ model: zZeroMatrix });
  }

  updateDepthAndMsaa() {
    this.#depthAndMsaa = this.#createDepthAndMsaaTextures(
      this.#canvas,
      this.#presentationFormat,
    );
  }

  updateCameraUniform(cameraConfig: CameraConfig, aspect: number): void {
    const camera = {
      view: m.mat4.lookAt(
        cameraConfig.position,
        cameraConfig.target,
        cameraConfig.up,
        d.mat4x4f(),
      ),
      projection: m.mat4.perspective(
        cameraConfig.fov,
        aspect,
        cameraConfig.near,
        cameraConfig.far,
        d.mat4x4f(),
      ),
    };
    this.#cameraUniform.write(camera);
  }

  updateCameraView(camereViewMatrix: d.m4x4f) {
    this.#cameraUniform.writePartial({ view: camereViewMatrix });
  }

  #initPlanes(): PlanesResources {
    const grid = new GridSurface(c.PLANE_GRID_CONFIG);

    const gridVertices = grid.getVertexBufferData();

    const gridIndices = grid.getIndexBufferData();

    const vertexBuffer = this.#root.createBuffer(
      vertexLayout.schemaForCount(4),
      gridVertices,
    ).$usage('vertex');

    const indexBuffer = this.#root.createBuffer(
      d.arrayOf(d.u16, 6),
      gridIndices,
    ).$usage('index');

    const xTransform = this.#root.createBuffer(s.Transform).$usage('uniform');

    const xBindgroup = this.#root.createBindGroup(layout, {
      camera: this.#cameraUniform,
      transform: xTransform,
    });

    const yTransform = this.#root.createBuffer(s.Transform).$usage('uniform');

    const yBindgroup = this.#root.createBindGroup(layout, {
      camera: this.#cameraUniform,
      transform: yTransform,
    });

    const zTransform = this.#root.createBuffer(s.Transform).$usage('uniform');

    const zBindgroup = this.#root.createBindGroup(layout, {
      camera: this.#cameraUniform,
      transform: zTransform,
    });

    return {
      vertexBuffer: vertexBuffer,
      indexBuffer: indexBuffer,

      xZero: {
        transformUniform: xTransform,
        bindgroup: xBindgroup,
      },
      yZero: {
        transformUniform: yTransform,
        bindgroup: yBindgroup,
      },
      zZero: {
        transformUniform: zTransform,
        bindgroup: zBindgroup,
      },
    };
  }

  #createDepthAndMsaaTextures(
    canvas: HTMLCanvasElement,
    presentationFormat: GPUTextureFormat,
  ): DepthAndMsaa {
    if (this.#depthAndMsaa?.depthTexture) {
      this.#depthAndMsaa.depthTexture.destroy();
    }
    if (this.#depthAndMsaa?.msaaTexture) {
      this.#depthAndMsaa.msaaTexture.destroy();
    }

    const depthTexture = this.#root.device.createTexture({
      size: [canvas.width, canvas.height, 1],
      format: 'depth24plus',
      sampleCount: 4,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const msaaTexture = this.#root.device.createTexture({
      size: [canvas.width, canvas.height, 1],
      format: presentationFormat,
      sampleCount: 4,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    return {
      depthTexture,
      depthTextureView: depthTexture.createView(),
      msaaTexture,
      msaaTextureView: msaaTexture.createView(),
    };
  }
}
