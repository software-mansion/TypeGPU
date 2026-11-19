import { d, type TgpuRoot } from 'typegpu';
import { lightingFragmentFn } from './lighting.ts';
import { fullScreenTriangle } from 'typegpu/common';
import { GBuffer } from './gBuffer.ts';
import { Camera } from '../../common/setup-first-person-camera.ts';
import { createScene } from './scene.ts';
import { cameraAccess, sceneSlot, timeAccess } from './slots.ts';
import { geometryFragmentFn, geometryVertexFn } from './geometry.ts';

export class Renderer {
  root: TgpuRoot;
  context: GPUCanvasContext;
  gBuffer: GBuffer;

  scene;

  geometryPipeline;
  lightingPipeline;
  cameraUniform;
  timeUniform;

  constructor(root: TgpuRoot, context: GPUCanvasContext) {
    this.root = root;
    this.context = context;
    this.gBuffer = new GBuffer(root, 100, 100);

    this.scene = createScene(root);

    this.cameraUniform = root.createUniform(Camera);
    this.timeUniform = root.createUniform(d.u32);

    const withedRoot = root
      .with(timeAccess, this.timeUniform)
      .with(cameraAccess, this.cameraUniform)
      .with(sceneSlot, this.scene);
    this.geometryPipeline = withedRoot.createRenderPipeline({
      fragment: geometryFragmentFn,
      vertex: geometryVertexFn,
      targets: this.gBuffer.targets,
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      primitive: { cullMode: 'none' },
    });
    this.lightingPipeline = withedRoot.createRenderPipeline({
      vertex: fullScreenTriangle,
      fragment: lightingFragmentFn,
    });
  }

  resize(width: number, height: number) {
    const oldGBuffer = this.gBuffer;
    this.gBuffer = new GBuffer(this.root, width, height);
    oldGBuffer.destroy();
  }

  render(time: number) {
    this.timeUniform.write(time);

    this.geometryPipeline
      .pipe(this.scene.inject())
      .withDepthStencilAttachment({ view: this.gBuffer.depthTexture })
      .withColorAttachment(this.gBuffer.colorAttachment)
      .drawIndexed(this.scene.indexCount, 1, this.scene.firstIndex);
    this.lightingPipeline
      .with(this.gBuffer.bindGroup)
      .withColorAttachment({ view: this.context })
      .draw(3);
  }

  updateCamera(update: Partial<d.Infer<typeof Camera>>) {
    this.cameraUniform.patch(update);
  }
}
