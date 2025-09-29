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
  indexCount: number;
}

export class Plotter implements IPlotter {
  readonly #context: GPUCanvasContext;
  readonly #canvas: HTMLCanvasElement;
  readonly #presentationFormat: GPUTextureFormat;
  #cameraConfig: CameraConfig;
  readonly #eventHandler: EventHandler;
  #surfaceStack: SurfaceResources[] = [];
  #root!: TgpuRoot;
  #resourceKeeper!: ResourceKeeper;
  #backgroundRenderPipeline!: TgpuRenderPipeline;
  #noBackgroudRenderPipeline!: TgpuRenderPipeline;
  #plotConfig!: PlotConfig;
  #bindedFrameFunction!: () => void;
  #keepRendering = false;

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

    this.#resourceKeeper = new ResourceKeeper(
      this.#root,
      this.#canvas,
      this.#presentationFormat,
    );

    this.updateCamera(this.#cameraConfig);

    this.#createRenderPipelines();
  }

  addPlots(surfaces: ISurface[], options: PlotConfig): void {
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

          indexCount: indices.length,
        },
      );
    }
  }

  resetPlots(): void {
    for (const surface of this.#surfaceStack) {
      surface.vertexBuffer.destroy();
      surface.indexBuffer.destroy();
    }
    this.#surfaceStack = [];
  }

  startRenderLoop(): void {
    this.#keepRendering = true;
    this.#eventHandler.setup();

    const resizeObserver = new ResizeObserver(() =>
      this.#resourceKeeper.updateDepthAndMsaa()
    );
    resizeObserver.observe(this.#canvas);
    this.#canvas;

    if (!this.#bindedFrameFunction) {
      this.#bindedFrameFunction = this.#frame.bind(this);
    }
    this.#frame();
  }

  stopRenderLoop(): void {
    this.#keepRendering = false;
  }

  updateCamera(cameraConfig: CameraConfig): void {
    this.#cameraConfig = cameraConfig;
    this.#resourceKeeper.updateCameraUniform(
      this.#cameraConfig,
      this.#canvas.clientWidth / this.#canvas.clientHeight,
    );
  }

  #frame() {
    if (!this.#keepRendering) {
      return;
    }

    if (this.#eventHandler.cameraChanged) {
      this.#resourceKeeper.updateCameraView(
        this.#eventHandler.cameraViewMatrix,
      );
      this.#eventHandler.resetCameraChangedFlag();
    }

    this.#render();
    requestAnimationFrame(this.#bindedFrameFunction);
  }

  #render() {
    const emptySurfaceStack = this.#surfaceStack.length === 0;
    if (!emptySurfaceStack) {
      const firstSurface = this.#surfaceStack[0];
      this.#drawObject(
        firstSurface.vertexBuffer,
        this.#resourceKeeper.bindgroup,
        firstSurface.indexBuffer,
        firstSurface.indexCount,
        'clear',
        true,
      );
      for (const surface of this.#surfaceStack.slice(1)) {
        this.#drawObject(
          surface.vertexBuffer,
          this.#resourceKeeper.bindgroup,
          surface.indexBuffer,
          surface.indexCount,
          'load',
          true,
        );
      }
    }

    const planes = this.#resourceKeeper.planes;

    const yPlane = this.#plotConfig.yZeroPlane;
    const xPlane = this.#plotConfig.xZeroPlane;
    const zPlane = this.#plotConfig.zZeroPlane;
    const xLoadOp = emptySurfaceStack ? 'clear' : 'load';
    const zLoadOp = emptySurfaceStack && !xPlane ? 'clear' : 'load';
    const yLoadOp = emptySurfaceStack && !xPlane && !zPlane ? 'clear' : 'load';

    if (xPlane) {
      this.#drawObject(
        planes.vertexBuffer,
        planes.xZero.bindgroup,
        planes.indexBuffer,
        6,
        xLoadOp,
        true,
      );
    }

    if (zPlane) {
      this.#drawObject(
        planes.vertexBuffer,
        planes.zZero.bindgroup,
        planes.indexBuffer,
        6,
        zLoadOp,
        true,
      );
    }

    if (yPlane) {
      this.#drawObject(
        planes.vertexBuffer,
        planes.yZero.bindgroup,
        planes.indexBuffer,
        6,
        yLoadOp,
        true,
      );
    }
  }

  #drawObject(
    buffer: TgpuBuffer<d.WgslArray<typeof s.Vertex>> & VertexFlag,
    group: TgpuBindGroup<typeof layout.entries>,
    indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag,
    vertexCount: number,
    loadOp: 'clear' | 'load',
    includeBackground: boolean,
  ): void {
    const resources = this.#resourceKeeper;
    const pipeline = includeBackground
      ? this.#backgroundRenderPipeline
      : this.#noBackgroudRenderPipeline;

    pipeline
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

  #createRenderPipelines(): void {
    this.#backgroundRenderPipeline = this.#root['~unstable']
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

    this.#noBackgroudRenderPipeline = this.#root['~unstable']
      .withVertex(vertexFn, vertexLayout.attrib)
      .withFragment(fragmentFn, {
        format: this.#presentationFormat,
        blend: {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'zero',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'zero',
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

  [Symbol.dispose]() {
    this.#eventHandler.destroy();
    this.#root.destroy();
  }
}
