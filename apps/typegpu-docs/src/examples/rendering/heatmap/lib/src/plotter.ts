import tgpu from 'typegpu';
import type {
  IndexFlag,
  TgpuBindGroup,
  TgpuBuffer,
  TgpuRenderPipeline,
  TgpuRoot,
  VertexFlag,
} from 'typegpu';
import * as d from 'typegpu/data';

import type { CameraConfig, IPlotter, ISurface, PlotConfig } from './types.ts';
import { fragmentFn, vertexFn } from './shaders.ts';
import { layout, vertexLayout } from './layouts.ts';
import * as c from './constants.ts';
import { EventHandler } from './event-handler.ts';
import { ResourceKeeper } from './resource-keeper.ts';
import type * as s from './structures.ts';

interface SurfaceResources {
  vertexBuffer: TgpuBuffer<d.WgslArray<typeof s.Vertex>> & VertexFlag;
  indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag;
}

export class Plotter implements IPlotter {
  readonly #context: GPUCanvasContext;
  readonly #canvas: HTMLCanvasElement;
  #presentationFormat: GPUTextureFormat;
  #cameraConfig: CameraConfig;
  #eventHandler: EventHandler;
  #surfaceStack: SurfaceResources[] = [];
  #root!: TgpuRoot;
  #resources!: ResourceKeeper;
  #renderPipeline!: TgpuRenderPipeline;
  #plotConfig!: PlotConfig;
  #bindedFrameFunction!: () => void;

  constructor(canvas: HTMLCanvasElement, cameraConfig?: CameraConfig) {
    this.#canvas = canvas;
    this.#context = canvas.getContext('webgpu') as GPUCanvasContext;
    this.#presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.#cameraConfig = cameraConfig ?? c.DEFAULT_CAMERA_CONFIG;
    this.#eventHandler = new EventHandler(this.#canvas, this.#cameraConfig);
  }

  async init(): Promise<void> {
    this.#root = await tgpu.init();

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

    this.updateCamera(this.#cameraConfig);

    this.#createRenderPipeline();
  }

  plot(surfaces: ISurface[], options: PlotConfig): void {
    if (surfaces.length !== 0) {
      for (const resource of this.#surfaceStack) {
        resource.vertexBuffer.destroy();
        resource.indexBuffer.destroy();
      }
    }

    const root = this.#root;

    this.#plotConfig = options;

    for (const surface of surfaces) {
      const vertices = surface.getVertexBufferData();
      const indices = surface.getIndexBufferData();
      this.#surfaceStack.push(
        {
          vertexBuffer: root.createBuffer(
            vertexLayout.schemaForCount(vertices.length),
            vertices,
          ).$usage('vertex'),

          indexBuffer: root.createBuffer(
            d.arrayOf(d.u16, indices.length),
            indices,
          ).$usage('index'),
        },
      );
    }
  }

  startRenderLoop(): void {
    this.#eventHandler.setup();

    const resizeObserver = new ResizeObserver(() =>
      this.#resources.updateDepthAndMsaa()
    );
    resizeObserver.observe(this.#canvas);
    this.#canvas;

    if (!this.#bindedFrameFunction) {
      this.#bindedFrameFunction = this.#frame.bind(this);
    }
    this.#frame();
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

  #frame() {
    if (this.#eventHandler.cameraChanged) {
      this.#resources.updateCameraView(this.#eventHandler.cameraViewMatrix);
      this.#eventHandler.resetCameraChangedFlag();
    }

    this.#render();
    requestAnimationFrame(this.#bindedFrameFunction);
  }

  #render() {
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

  #drawObject(
    buffer: TgpuBuffer<d.WgslArray<typeof s.Vertex>> & VertexFlag,
    group: TgpuBindGroup<typeof layout.entries>,
    indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag,
    vertexCount: number,
    loadOp: 'clear' | 'load',
  ): void {
    const resources = this.#resources;
    this.#renderPipeline
      .withColorAttachment({
        view: resources.depthAndMsaa.msaaTextureView,
        resolveTarget: this.#context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 0],
        loadOp: loadOp,
        storeOp: 'store',
      })
      .withDepthStencilAttachment({
        view: resources.depthAndMsaa.depthTextureView,
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
    this.#eventHandler.destroy();
    this.#root.destroy();
  }
}
