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
import { getCapsuleVertices } from './helpers.ts';

export class Renderer {
  #root: TgpuRoot;
  pipeline: TgpuRenderPipeline;
  #depthTexture?: TgpuTexture<{
    size: [number, number];
    format: 'depth24plus';
  }> &
    RenderFlag;

  #playerPosUniform: TgpuUniform<typeof d.vec4f>;
  #playerPipeline;
  #playerIndexCount: number;

  constructor(root: TgpuRoot, cameraUniform: TgpuUniform<typeof Camera>, playerDims: d.v2f) {
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
      primitive: { cullMode: 'none' }, // for debugging meshes
    });

    const playerPosUniform = root.createUniform(d.vec4f);
    this.#playerPosUniform = playerPosUniform;

    const [positionArray, indexArray] = getCapsuleVertices(
      playerDims.x,
      2 * (playerDims.y + playerDims.x),
    );
    this.#playerIndexCount = indexArray.length;

    const playerColliderPositionBuffer = root
      .createBuffer(d.arrayOf(d.vec4f, positionArray.length), positionArray)
      .$usage('uniform')
      .as('uniform');
    const playerColliderIndexBuffer = root
      .createBuffer(d.arrayOf(d.u16, indexArray.length), Array.from(indexArray))
      .$usage('index');

    const playerVertexFn = tgpu.vertexFn({
      in: { idx: d.builtin.vertexIndex },
      out: { pos: d.builtin.position, rawCol: d.vec3f },
    })((input) => {
      'use gpu';
      const localPos = playerColliderPositionBuffer.$[input.idx] + playerPosUniform.$;
      const worldPos = cameraUniform.$.projection * cameraUniform.$.view * localPos;
      return {
        pos: worldPos,
        rawCol: playerColliderPositionBuffer.$[input.idx].xyz,
      };
    });

    const playerFragmentFn = tgpu.fragmentFn({
      in: { rawCol: d.vec3f },
      out: d.vec4f,
    })((input) => {
      'use gpu';
      return d.vec4f(std.normalize(std.abs(input.rawCol)), 1);
    });

    this.#playerPipeline = root
      .createRenderPipeline({
        vertex: playerVertexFn,
        fragment: playerFragmentFn,
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
        primitive: { topology: 'triangle-list', frontFace: 'ccw', cullMode: 'back' },
      })
      .withIndexBuffer(playerColliderIndexBuffer);
  }

  render(
    context: GPUCanvasContext,
    mesherResources: ReturnType<Mesher['getResources']>,
    playerPos: d.v3f,
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
      // @ts-expect-error internal error
      .withColorAttachment(passDescriptor.colorAttachments[0])
      .withDepthStencilAttachment(passDescriptor.depthStencilAttachment)
      .with(MeshLayout, mesherResources.vertexBuffer)
      .draw(mesherResources.vertexCount);

    this.#playerPosUniform.write(d.vec4f(playerPos, 0));
    this.#playerPipeline
      .withColorAttachment({
        view: context,
        loadOp: 'load',
      })
      .withDepthStencilAttachment({
        view: this.#root.unwrap(this.#depthTexture).createView(),
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .drawIndexed(this.#playerIndexCount);
  }
}
