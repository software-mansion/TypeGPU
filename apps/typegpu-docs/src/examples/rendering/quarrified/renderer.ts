import tgpu, {
  d,
  std,
  type RenderFlag,
  type TgpuRenderPipeline,
  type TgpuRoot,
  type TgpuTexture,
  type TgpuUniform,
} from 'typegpu';
import { Camera, MeshLayout } from './schemas.ts';
import { type Mesher } from './mesher.ts';

export class Renderer {
  #root: TgpuRoot;
  pipeline: TgpuRenderPipeline;
  #depthTexture?: TgpuTexture<{
    size: [number, number];
    format: 'depth24plus';
  }> &
    RenderFlag;
  constructor(root: TgpuRoot, cameraUniform: TgpuUniform<typeof Camera>) {
    this.#root = root;
    // prettier-ignore
    const faceOffsets = tgpu.const(d.arrayOf(d.vec3i, 4 * 6), [
      // 0: bottom (y-1)
      d.vec3i(1,0,0), d.vec3i(1,0,1), d.vec3i(0,0,0), d.vec3i(0,0,1),
      // 1: top (y+1)
      d.vec3i(1,1,1), d.vec3i(1,1,0), d.vec3i(0,1,1), d.vec3i(0,1,0),
      // 2: left (x-1)
      d.vec3i(0,1,1), d.vec3i(0,1,0), d.vec3i(0,0,1), d.vec3i(0,0,0),
      // 3: right (x+1)
      d.vec3i(1,0,1), d.vec3i(1,0,0), d.vec3i(1,1,1), d.vec3i(1,1,0),
      // 4: front (z+1)
      d.vec3i(0,1,1), d.vec3i(0,0,1), d.vec3i(1,1,1), d.vec3i(1,0,1),
      // 5: back (z-1)
      d.vec3i(0,0,0), d.vec3i(0,1,0), d.vec3i(1,0,0), d.vec3i(1,1,0),
    ])

    this.pipeline = root.createRenderPipeline({
      attribs: { position: MeshLayout.attrib },
      vertex: ({ position, $vertexIndex }) => {
        'use gpu';

        const blockPos = d.vec3i(position.xyz);
        // TODO: replace with bitshifts
        const blockType = d.u32(position.w) & (2 ** 8 - 1);
        const sideNumber = d.u32(position.w / 2 ** 8) & (2 ** 8 - 1);
        const sideVertex = $vertexIndex;
        const blockMetadata = d.u32(position.w / 2 ** 16);

        const worldPos = d.vec3f(blockPos + faceOffsets.$[sideNumber * 4 + sideVertex]);

        return {
          $position: cameraUniform.$.projection * cameraUniform.$.view * d.vec4f(worldPos, 1),
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
      primitive: { cullMode: /* debug option */ 'none', topology: 'triangle-strip' },
    });
  }

  render(context: GPUCanvasContext, mesherResources: ReturnType<Mesher['getResources']>) {
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

    this.pipeline
      .withColorAttachment(passDescriptor.colorAttachments[0])
      .withDepthStencilAttachment(passDescriptor.depthStencilAttachment)
      .with(MeshLayout, mesherResources.vertexBuffer)
      .draw(4, mesherResources.instanceCount);
  }
}
