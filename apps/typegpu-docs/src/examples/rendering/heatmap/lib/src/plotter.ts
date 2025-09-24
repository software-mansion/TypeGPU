import tgpu from 'typegpu';
import type {
  IndexFlag,
  TgpuBindGroup,
  TgpuBuffer,
  TgpuRenderPipeline,
  TgpuRoot,
  UniformFlag,
  VertexFlag,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';

import type { CameraConfig, IPlotter, ISurface, PlotConfig } from './types.ts';
import * as s from './structures.ts';
import { fragmentFn, vertexFn } from './shaders.ts';
import { layout, vertexLayout } from './layouts.ts';
import {
  createGrid,
  createGridIndexArray,
  createTransformMatrix,
} from './helpers.ts';
import * as c from './constants.ts';

export class Plotter implements IPlotter {
  readonly #context: GPUCanvasContext;
  readonly #canvas: HTMLCanvasElement;
  #presentationFormat!: GPUTextureFormat;
  #root!: TgpuRoot;
  #renderPipeline!: TgpuRenderPipeline;
  #cameraConfig!: CameraConfig;
  #resources!: ResourceKeeper;
  #plotConfig!: PlotConfig;

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    this.#context = canvas.getContext('webgpu') as GPUCanvasContext;
  }

  async init(): Promise<void> {
    this.#root = await tgpu.init();

    this.#presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    this.#context.configure({
      device: this.#root.device,
      format: this.#presentationFormat,
      alphaMode: 'premultiplied',
    });

    this.#resources = new ResourceKeeper(
      this.#root,
      this.#canvas,
      this.#presentationFormat,
    );

    this.updateCamera(c.DEFAULT_CAMERA_CONFIG);

    this.#createRenderPipeline();
  }

  plot(surfaces: ISurface[], options: PlotConfig): void {
    this.#plotConfig = options;
  }

  startRenderLoop(): void {
    const planes = this.#resources.planes;
    this.#drawObject(
      planes.vertexBuffer,
      planes.yZero.bindgroup,
      planes.indexBuffer,
      6,
      'clear',
    );

    if (this.#plotConfig.yZeroPlane) {
      this.#drawObject(
        planes.vertexBuffer,
        planes.yZero.bindgroup,
        planes.indexBuffer,
        6,
        'load',
      );
    }

    if (this.#plotConfig.xZeroPlane) {
      this.#drawObject(
        planes.vertexBuffer,
        planes.xZero.bindgroup,
        planes.indexBuffer,
        6,
        'load',
      );
    }

    if (this.#plotConfig.zZeroPlane) {
      this.#drawObject(
        planes.vertexBuffer,
        planes.zZero.bindgroup,
        planes.indexBuffer,
        6,
        'load',
      );
    }
  }

  stopRenderLoop(): void {
  }

  updateCamera(cameraConfig: CameraConfig): void {
    this.#cameraConfig = cameraConfig;
    this.#resources.updateCameraUniform(
      this.#cameraConfig,
      this.#canvas.clientWidth / this.#canvas.clientHeight,
    );
  }

  #drawObject(
    buffer: TgpuBuffer<d.WgslArray<typeof s.Vertex>> & VertexFlag,
    group: TgpuBindGroup<typeof layout.entries>,
    indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag,
    vertexCount: number,
    loadOp: 'clear' | 'load',
  ): void {
    this.#renderPipeline
      .withColorAttachment({
        view: this.#resources.depthAndMsaa.msaaTextureView,
        resolveTarget: this.#context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 0],
        loadOp: loadOp,
        storeOp: 'store',
      })
      .withDepthStencilAttachment({
        view: this.#resources.depthAndMsaa.depthTextureView,
        depthClearValue: 1,
        depthLoadOp: loadOp,
        depthStoreOp: 'store',
      })
      .with(vertexLayout, buffer)
      .with(layout, group)
      .withIndexBuffer(indexBuffer)
      .drawIndexed(vertexCount);
  }

  #createRenderPipeline(): void {
    this.#renderPipeline = this.#root['~unstable']
      .withVertex(vertexFn, vertexLayout.attrib)
      .withFragment(fragmentFn, {
        format: this.#presentationFormat,
        blend: {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        },
      })
      .withDepthStencil({
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      })
      .withMultisample({
        count: 4,
      })
      .createPipeline();
  }

  destroy(): void {
    this.#root.destroy();
  }
}

type DepthAndMsaa = {
  depthTexture: GPUTexture;
  depthTextureView: GPUTextureView;
  msaaTexture: GPUTexture;
  msaaTextureView: GPUTextureView;
};

type PlanesResources = {
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
};

class ResourceKeeper {
  #root: TgpuRoot;
  #cameraUniform: TgpuBuffer<typeof s.Camera> & UniformFlag;
  #planes: PlanesResources;
  #depthAndMsaa: DepthAndMsaa;

  constructor(
    root: TgpuRoot,
    canvas: HTMLCanvasElement,
    presentationFormat: GPUTextureFormat,
  ) {
    this.#root = root;

    this.#cameraUniform = root.createBuffer(s.Camera).$usage('uniform');

    this.#planes = this.#initPlanes();

    this.#depthAndMsaa = this.#createDepthAndMsaaTextures(
      canvas,
      presentationFormat,
    );
  }

  get planes(): PlanesResources {
    return this.#planes;
  }

  get depthAndMsaa(): DepthAndMsaa {
    return this.#depthAndMsaa;
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

  #initPlanes(): PlanesResources {
    const gridVertices = createGrid(c.PLANE_GRID_CONFIG)
      .map((vertex) => ({
        position: vertex.position,
        color: c.DEFAULT_PLANE_COLOR,
      }));

    const gridIndices = createGridIndexArray(
      c.PLANE_GRID_CONFIG.nx,
      c.PLANE_GRID_CONFIG.nz,
    );

    const vertexBuffer = this.#root.createBuffer(
      vertexLayout.schemaForCount(4),
      gridVertices,
    ).$usage('vertex');

    const indexBuffer = this.#root.createBuffer(
      d.arrayOf(d.u16, 6),
      gridIndices,
    ).$usage('index');

    const defaultTransform = createTransformMatrix(
      c.DEFAULT_PLANE_TRANSLATION,
      c.DEFAULT_PLANE_SCALE,
    );

    const xTransform = this.#root
      .createBuffer(
        s.Transform,
        {
          model: m.mat4.rotateZ(
            defaultTransform.model,
            Math.PI / 2,
            d.mat4x4f(),
          ),
        },
      )
      .$usage('uniform');

    const xBindgroup = this.#root.createBindGroup(layout, {
      camera: this.#cameraUniform,
      transform: xTransform,
    });

    const yTransform = this.#root
      .createBuffer(s.Transform, defaultTransform)
      .$usage('uniform');

    const yBindgroup = this.#root.createBindGroup(layout, {
      camera: this.#cameraUniform,
      transform: yTransform,
    });

    const zTransform = this.#root
      .createBuffer(
        s.Transform,
        {
          model: m.mat4.rotateX(
            defaultTransform.model,
            Math.PI / 2,
            d.mat4x4f(),
          ),
        },
      )
      .$usage('uniform');

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
