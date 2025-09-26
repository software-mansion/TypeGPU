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

import type { CameraConfig } from './types.ts';
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

export class ResourceKeeper {
  #root: TgpuRoot;
  #canvas: HTMLCanvasElement;
  #presentationFormat: GPUTextureFormat;
  #cameraUniform: TgpuBuffer<typeof s.Camera> & UniformFlag;
  #planes: PlanesResources;
  #depthAndMsaa: DepthAndMsaa;

  constructor(
    root: TgpuRoot,
    canvas: HTMLCanvasElement,
    presentationFormat: GPUTextureFormat,
  ) {
    this.#root = root;
    this.#canvas = canvas;
    this.#presentationFormat = presentationFormat;

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
