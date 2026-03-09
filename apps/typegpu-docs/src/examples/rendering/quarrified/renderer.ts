import {
  d,
  std,
  type RenderFlag,
  type TgpuRenderPipeline,
  type TgpuRoot,
  type TgpuTexture,
  type TgpuUniform,
} from 'typegpu';
import { Camera, MeshLayout } from './schemas.ts';
import { MAX_CHUNKS_AT_ONCE, type Mesher } from './mesher.ts';

export class Renderer {
  #root: TgpuRoot;
  pipeline: TgpuRenderPipeline;
  #depthTexture?: TgpuTexture<{
    size: [number, number];
    format: 'depth24plus';
  }> &
    RenderFlag;
  #renderBundle?: GPURenderBundle;
  constructor(root: TgpuRoot, cameraUniform: TgpuUniform<typeof Camera>) {
    this.#root = root;
    this.pipeline = root.createRenderPipeline({
      attribs: { position: MeshLayout.attrib },
      vertex: (input) => {
        'use gpu';
        const worldPos = input.position;
        return {
          $position: cameraUniform.$.projection * cameraUniform.$.view * worldPos,
          worldPos,
        };
      },
      fragment: ({ worldPos }) => {
        'use gpu';
        const localPos = std.fract(worldPos.xyz);
        const nearEdge = std.min(localPos, 1 - localPos);
        const highest = std.max(nearEdge.x, nearEdge.y, nearEdge.z);
        const secondHighest = nearEdge.x + nearEdge.y + nearEdge.z - highest;
        const distFromEdge = std.min(highest, secondHighest);
        const color = std.select(d.vec3f(0.5), d.vec3f(0.3), distFromEdge < 0.05);
        return d.vec4f(color, 1);
      },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      primitive: { cullMode: 'back' },
    });
  }

  render(
    context: GPUCanvasContext,
    presentationFormat: GPUTextureFormat,
    mesherResources: ReturnType<Mesher['getResources']>,
  ) {
    const currentTexture = context.getCurrentTexture();
    if (
      !this.#depthTexture ||
      this.#depthTexture.props.size[0] !== currentTexture.width ||
      this.#depthTexture.props.size[1] !== currentTexture.height
    ) {
      this.#depthTexture = this.#root['~unstable']
        .createTexture({
          size: [currentTexture.width, currentTexture.height],
          format: 'depth24plus',
        })
        .$usage('render');
      this.#renderBundle = this.#root['~unstable'].beginRenderBundleEncoder(
        {
          colorFormats: [presentationFormat],
          depthStencilFormat: 'depth24plus',
        },
        (pass) => {
          pass.setPipeline(this.pipeline);
          pass.setVertexBuffer(MeshLayout, mesherResources.vertexBuffer);

          for (let i = 0; i < MAX_CHUNKS_AT_ONCE; i++) {
            pass.drawIndirect(this.#root.unwrap(mesherResources.indirectBuffer), 16 * i);
          }
        },
      );
    }

    const passDescriptor = {
      colorAttachments: [
        {
          view: currentTexture.createView(),
          clearValue: [1, 0.85, 0.74, 1],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.#root.unwrap(this.#depthTexture).createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    } as const;

    this.#root['~unstable'].beginRenderPass(passDescriptor, (pass) => {
      pass.executeBundles([this.#renderBundle as GPURenderBundle]);
    });
  }
}
