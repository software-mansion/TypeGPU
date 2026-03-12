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
import { faceOffsets } from './cubeVertices.ts';

export class Renderer {
  #root: TgpuRoot;
  #pipeline: TgpuRenderPipeline<d.Vec4f>;
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
    // prettier-ignore

    this.#pipeline = root.createRenderPipeline({
      attribs: { position: MeshLayout.attrib },
      vertex: ({ position, $vertexIndex }) => {
        'use gpu';
        // TODO: remove this temporary solution (without this, every "empty" draw creates a face at 0, 0, 0 that has enormous overdraw)
        if (std.allEq(position.xyz, d.vec3i(0, 0, 0))) {
          return {
            $position: d.vec4f(),
            worldPos: d.vec3f()
          }
        }

        const blockPos = position.xyz;
        // TODO: replace with bitshifts (also make sure its u32 not i32)
        // const blockType = d.u32(position.w) & (2 ** 8 - 1);
        const sideNumber = d.u32(position.w / 2 ** 8) & (2 ** 8 - 1);
        const sideVertex = $vertexIndex;
        // const blockMetadata = d.u32(position.w / 2 ** 16) & (2 ** 8 - 1);
        // const skyLightLevel = d.u32(position.w / 2 ** 24) & (2 ** 4 - 1);
        // const blockLightLevel = d.u32(position.w / 2 ** 28) & (2 ** 4 - 1);

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

    this.#pipeline
      .withColorAttachment({
        view: currentTexture.createView(),
        clearValue: [1, 0.75, 0.8, 1],
        loadOp: 'clear',
        storeOp: 'store',
      })
      .withDepthStencilAttachment({
        view: this.#root.unwrap(this.#depthTexture).createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      })
      .with(MeshLayout, mesherResources.vertexBuffer)
      .draw(4, mesherResources.instanceCount);

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
