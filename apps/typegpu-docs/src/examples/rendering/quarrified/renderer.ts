import tgpu, {
  d,
  type RenderFlag,
  std,
  type TgpuRenderPipeline,
  type TgpuRoot,
  type TgpuTexture,
  type TgpuUniform,
} from 'typegpu';
import { Camera, MeshLayout } from './schemas.ts';
import { type Mesher } from './mesher.ts';
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
      vertex: tgpu.vertexFn({
        in: { vertexIndex: d.builtin.vertexIndex, position: d.vec4i },
        out: { position: d.builtin.position, worldPos: d.vec3f, lightLevel: d.interpolate("flat", d.u32) },
      })(({ position, vertexIndex }) => {
        "use gpu";
        // TODO: remove this temporary solution (without this, every "empty" draw creates a face at 0, 0, 0 that has enormous overdraw)
        if (std.allEq(position.xyz, d.vec3i(0, 0, 0))) {
          return {
            position: d.vec4f(),
            worldPos: d.vec3f(),
            lightLevel: 0,
          };
        }

        const blockPos = position.xyz;
        // TODO: replace with bitshifts (also make sure its u32 not i32)
        // const blockType = d.u32(position.w) & (2 ** 8 - 1);
        const sideNumber = d.u32(position.w >> 8) & ((1 << 8) - 1);
        const sideVertex = vertexIndex;
        // const blockMetadata = d.u32(position.w / 2 ** 16) & (2 ** 8 - 1);
        const lightLevel = d.u32(position.w >> 24) &( (1 << 4) - 1);

        const worldPos = d.vec3f(
          blockPos + faceOffsets.$[sideNumber * 4 + sideVertex],
        );

        return {
          position: cameraUniform.$.projection * cameraUniform.$.view *
            d.vec4f(worldPos, 1),
          worldPos,
          lightLevel,
        };
      }),
      fragment: ({ worldPos, lightLevel }) => {
        "use gpu";
        const localPos = std.fract(worldPos.xyz);
        const nearEdge = std.min(localPos, 1 - localPos);
        const highest = std.max(nearEdge.x, nearEdge.y, nearEdge.z);
        const secondHighest = nearEdge.x + nearEdge.y + nearEdge.z - highest;
        const distFromEdge = std.min(highest, secondHighest);
        const color = std.select(
          d.vec3f(0.5),
          d.vec3f(0.3),
          distFromEdge < 0.05,
        );
        return d.vec4f(color, 1) * lightLevel / 15;
      },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
      primitive: {
        cullMode: /* debug option */ "none",
        topology: "triangle-strip",
      },
    });

    const playerPosUniform = root.createUniform(d.vec4f);
    this.#playerPosUniform = playerPosUniform;

    const hx = playerDims.x;
    const hy = playerDims.y;
    const hz = playerDims.x;
    const v = (x: number, y: number, z: number) => d.vec4f(x, y, z, 1);
    // oxfmt-ignore
    const cuboidVertices: d.v4f[] = [
      v(-hx, -hy, -hz), v( hx, -hy, -hz), v( hx,  hy, -hz), v(-hx,  hy, -hz),
      v(-hx, -hy,  hz), v( hx, -hy,  hz), v( hx,  hy,  hz), v(-hx,  hy,  hz),
    ];
    // oxfmt-ignore
    const cuboidIndices = new Uint16Array([
      4, 5, 6, 4, 6, 7,
      1, 0, 3, 1, 3, 2,
      3, 7, 6, 3, 6, 2,
      4, 0, 1, 4, 1, 5,
      5, 1, 2, 5, 2, 6,
      0, 4, 7, 0, 7, 3,
    ]);
    this.#playerIndexCount = cuboidIndices.length;

    const playerVertexBuffer = root
      .createBuffer(d.arrayOf(d.vec4f, cuboidVertices.length), cuboidVertices)
      .$usage('uniform')
      .as('uniform');
    const playerIndexBuffer = root
      .createBuffer(d.arrayOf(d.u16, cuboidIndices.length), Array.from(cuboidIndices))
      .$usage('index');

    const playerVertexFn = tgpu.vertexFn({
      in: { idx: d.builtin.vertexIndex },
      out: { pos: d.builtin.position, localPos: d.vec3f },
    })((input) => {
      'use gpu';
      const vtx = playerVertexBuffer.$[input.idx];
      const worldPos =
        cameraUniform.$.projection * cameraUniform.$.view * (vtx + playerPosUniform.$);
      return {
        pos: worldPos,
        localPos: vtx.xyz,
      };
    });

    const playerFragmentFn = tgpu.fragmentFn({
      in: { localPos: d.vec3f },
      out: d.vec4f,
    })((input) => {
      'use gpu';
      const t = input.localPos / d.vec3f(2 * hx, 2 * hy, 2 * hz) + 0.5;
      const lo = d.vec3f(0.85, 0.2, 0.55);
      const hi = d.vec3f(0.15, 0.85, 0.95);
      const base = std.mix(lo, hi, d.vec3f(t.y));
      const color = base + d.vec3f(0.12 * std.sin(t.x * 3.14), 0, 0.1 * std.cos(t.z * 3.14));
      return d.vec4f(color, 1);
    });

    this.#playerPipeline = root
      .createRenderPipeline({
        vertex: playerVertexFn,
        fragment: playerFragmentFn,
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: true,
          depthCompare: 'less',
        },
        primitive: {
          topology: 'triangle-list',
          frontFace: 'ccw',
          cullMode: 'back',
        },
      })
      .withIndexBuffer(playerIndexBuffer);
  }

  render(
    context: GPUCanvasContext,
    mesherResources: ReturnType<Mesher['getResources']>,
    playerPos: d.v3f,
  ) {
    // --- debug ---
    console.log(`Drawing ${mesherResources.instanceCount} instances...`);
    // --- debug end ---

    if (mesherResources.instanceCount === 0) {
      return;
    }

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
