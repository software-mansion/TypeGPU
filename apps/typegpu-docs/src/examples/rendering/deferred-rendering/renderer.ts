import type { d, TgpuRoot } from 'typegpu';
import { lightingFragmentFn } from './lighting.ts';
import { cameraAccess, geometryFragmentFn, geometryVertexFn } from './geometry.ts';
import { fullScreenTriangle } from 'typegpu/common';
import { GBuffer } from './gBuffer.ts';
import { scene } from './scene.ts';
import { Camera } from '../../common/setup-first-person-camera.ts';

export class Renderer {
  root: TgpuRoot;
  context: GPUCanvasContext;
  gBuffer: GBuffer;

  geometryPipeline;
  lightingPipeline;
  cameraUniform;
  depthTexture;

  constructor(root: TgpuRoot, context: GPUCanvasContext) {
    this.root = root;
    this.context = context;
    this.gBuffer = new GBuffer(root, 100, 100);

    this.cameraUniform = root.createUniform(Camera);
    this.depthTexture = root
      .createTexture({
        size: [100, 100] as [number, number],
        format: 'depth24plus',
      })
      .$usage('render');

    this.geometryPipeline = root.with(cameraAccess, this.cameraUniform).createRenderPipeline({
      fragment: geometryFragmentFn,
      vertex: geometryVertexFn,
      targets: this.gBuffer.targets,
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.lightingPipeline = root.createRenderPipeline({
      vertex: fullScreenTriangle,
      fragment: lightingFragmentFn,
    });
  }

  resize(width: number, height: number) {
    // TODO: destroys everywhere
    const oldGBuffer = this.gBuffer;
    this.gBuffer = new GBuffer(this.root, width, height);
    this.depthTexture = this.root
      .createTexture({
        size: [width, height],
        format: 'depth24plus',
      })
      .$usage('render');
    oldGBuffer.destroy();
  }

  render() {
    this.geometryPipeline
      .withDepthStencilAttachment({ view: this.depthTexture })
      .withColorAttachment(this.gBuffer.colorAttachment)
      .draw(scene.vertexCount);
    this.lightingPipeline
      .with(this.gBuffer.bindGroup)
      .withColorAttachment({ view: this.context })
      .draw(3);
  }

  updateCamera(update: Partial<d.Infer<typeof Camera>>) {
    this.cameraUniform.patch(update);
  }
}
