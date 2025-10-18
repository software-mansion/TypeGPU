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
import type {
  CameraConfig,
  IPlotter,
  IScaler,
  ISurface,
  PlotConfig,
} from './types.ts';
import {
  fragmentFn,
  lineFragmentFn,
  lineVertexFn,
  vertexFn,
} from './shaders.ts';
import { layout, vertexLayout } from './layouts.ts';
import * as c from './constants.ts';
import { EventHandler } from './event-handler.ts';
import { ResourceKeeper } from './resource-keeper.ts';
import type * as s from './structures.ts';
import { createLineListFromTriangleList } from './utils.ts';

export class Plotter implements IPlotter {
  readonly #context: GPUCanvasContext;
  readonly #canvas: HTMLCanvasElement;
  readonly #presentationFormat: GPUTextureFormat;
  #cameraConfig: CameraConfig;
  readonly #eventHandler: EventHandler;
  #root!: TgpuRoot;
  #resourceKeeper!: ResourceKeeper;
  #triangleRenderPipeline!: TgpuRenderPipeline;
  #lineRenderPipeline!: TgpuRenderPipeline;
  #plotConfig!: PlotConfig;
  #bindedFrameFunction!: () => void;
  #keepRendering = false;
  readonly #coordsToNumMap = new Map<string, number>([
    ['x', 0],
    ['y', 1],
    ['z', 2],
  ]);

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

  addPlots(surfaces: ISurface[], options?: PlotConfig): void {
    this.#plotConfig = options ?? c.DEFAULT_PLOT_CONFIG;
    const {
      xScaler,
      yScaler,
      zScaler,
      basePlanesTranslation,
      basePlanesScale,
      basePlotsTranslation,
      basePlotsScale,
    } = this.#plotConfig;

    const vertices = surfaces.flatMap((surface) =>
      surface.getVertexBufferData()
    );

    const [X, Y, Z] = [0, 1, 2].map((coord) =>
      vertices.map((vertex) => vertex.position[coord])
    );

    let xOffset = 0;
    let yOffset = 0;
    let zOffset = 0;
    let xScale = 1;
    let yScale = 1;
    let zScale = 1;

    if (xScaler.type === 'affine' && X.length) {
      ({ offset: xOffset, scale: xScale } = xScaler.fit(X));
    }
    if (yScaler.type === 'affine' && Y.length) {
      ({ offset: yOffset, scale: yScale } = yScaler.fit(Y));
    }
    if (zScaler.type === 'affine' && Z.length) {
      ({ offset: zOffset, scale: zScale } = zScaler.fit(Z));
    }

    this.#resourceKeeper.updateTransformUniform({
      offset: d.vec3f(xOffset, yOffset, zOffset).mul(basePlotsScale).add(
        basePlotsTranslation,
      ),
      scale: d.vec3f(xScale, yScale, zScale).mul(basePlotsScale),
    });
    this.#resourceKeeper.updatePlanesTransformUniforms(
      {
        offset: d.vec3f(xOffset, yOffset, zOffset).mul(basePlotsScale)
          .add(
            basePlanesTranslation,
          ),
        scale: basePlanesScale,
      },
    );

    let vertexBuffers = surfaces.map((surface) =>
      surface.getVertexBufferData()
    );

    if (xScaler.type === 'non-affine') {
      vertexBuffers = this.#applyNonAffine(vertexBuffers, xScaler, 'x');
    }
    if (yScaler.type === 'non-affine') {
      vertexBuffers = this.#applyNonAffine(vertexBuffers, yScaler, 'y');
    }
    if (zScaler.type === 'non-affine') {
      vertexBuffers = this.#applyNonAffine(vertexBuffers, zScaler, 'z');
    }

    this.#resourceKeeper.createSurfaceStackResources(
      surfaces.map((surface, i) => {
        const triangleIndices = surface.getIndexBufferData();
        return {
          vertices: vertexBuffers[i],
          triangleIndices,
          lineIndices: createLineListFromTriangleList(triangleIndices),
        };
      }),
    );
  }

  resetPlots(): void {
    this.#resourceKeeper.resetSurfaceStack();
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

  #applyNonAffine(
    vertexBuffers: (d.Infer<typeof s.Vertex>[])[],
    scaler: Extract<IScaler, { type: 'non-affine' }>,
    coord: 'x' | 'y' | 'z',
  ): (d.Infer<typeof s.Vertex>[])[] {
    return vertexBuffers.map((vertices) =>
      vertices.map((vertex) => {
        const newPos = vertex.position;
        //biome-ignore lint/style/noNonNullAssertion: it's hardcoded map
        newPos[this.#coordsToNumMap.get(coord)!] = scaler.transform(
          vertex.position[coord],
        );
        return {
          ...vertex,
          position: newPos,
        };
      })
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
    const emptySurfaceStack = this.#resourceKeeper.surfaceStack.length === 0;
    const topology = this.#plotConfig.topology;
    if (!emptySurfaceStack) {
      const firstSurface = this.#resourceKeeper.surfaceStack[0];

      if (topology === 'triangle' || topology === 'all') {
        this.#drawObject(
          firstSurface.vertexBuffer,
          this.#resourceKeeper.bindgroup,
          firstSurface.triangleIndexBuffer,
          firstSurface.triangleIndexCount,
          'clear',
          'triangle',
        );

        for (const surface of this.#resourceKeeper.surfaceStack.slice(1)) {
          this.#drawObject(
            surface.vertexBuffer,
            this.#resourceKeeper.bindgroup,
            surface.triangleIndexBuffer,
            surface.triangleIndexCount,
            'load',
            'triangle',
          );
        }
      }

      const lineFirstLoadOp = topology === 'line' ? 'clear' : 'load';

      if (topology === 'line' || topology === 'all') {
        this.#drawObject(
          firstSurface.vertexBuffer,
          this.#resourceKeeper.bindgroup,
          firstSurface.lineIndexBuffer,
          firstSurface.lineIndexCount,
          lineFirstLoadOp,
          'line',
        );

        for (const surface of this.#resourceKeeper.surfaceStack.slice(1)) {
          this.#drawObject(
            surface.vertexBuffer,
            this.#resourceKeeper.bindgroup,
            surface.lineIndexBuffer,
            surface.lineIndexCount,
            'load',
            'line',
          );
        }
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
        'triangle',
      );
    }

    if (zPlane) {
      this.#drawObject(
        planes.vertexBuffer,
        planes.zZero.bindgroup,
        planes.indexBuffer,
        6,
        zLoadOp,
        'triangle',
      );
    }

    if (yPlane) {
      this.#drawObject(
        planes.vertexBuffer,
        planes.yZero.bindgroup,
        planes.indexBuffer,
        6,
        yLoadOp,
        'triangle',
      );
    }
  }

  #drawObject(
    buffer: TgpuBuffer<d.WgslArray<typeof s.Vertex>> & VertexFlag,
    group: TgpuBindGroup<typeof layout.entries>,
    indexBuffer: TgpuBuffer<d.WgslArray<d.U32>> & IndexFlag,
    vertexCount: number,
    loadOp: 'clear' | 'load',
    topology: 'line' | 'triangle' = 'triangle',
  ): void {
    const resources = this.#resourceKeeper;
    const pipeline = topology === 'triangle'
      ? this.#triangleRenderPipeline
      : this.#lineRenderPipeline;

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
    this.#triangleRenderPipeline = this.#root['~unstable']
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
            srcFactor: 'src-alpha',
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
      .withPrimitive({
        topology: 'triangle-list',
      })
      .createPipeline();

    this.#lineRenderPipeline = this.#root['~unstable']
      .withVertex(lineVertexFn, vertexLayout.attrib)
      .withFragment(lineFragmentFn, {
        format: this.#presentationFormat,
        blend: {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'src-alpha',
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
      .withPrimitive({
        topology: 'line-list',
      })
      .createPipeline();
  }

  [Symbol.dispose]() {
    this.#eventHandler.destroy();
    // surface stack will be handled by root
    this.#root.destroy();
  }
}
