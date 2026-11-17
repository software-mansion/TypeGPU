import { tgpu, d, std, type TgpuRoot } from 'typegpu';
import {
  MAX_PLUMS,
  PlumInstance,
  type PlumRenderer,
  QUAD_CENTER,
  QUAD_HALF_SIZE,
  current,
  plumPixel,
  quadCorner,
  toClipSpace,
} from './plum-renderer.ts';

/**
 * The WebGL 2 fallback only has uniforms of plain vectors and matrices, and draws one batch of
 * triangles without blending or instancing. So each plum is packed into four matrices, and
 * drawn as a quad of its own. Quads are drawn back to front, each compositing its plum over the
 * ones behind it, so the last quad covering a pixel has all the plums there.
 */
const packPlum = (plum: PlumInstance) => {
  const [b0, b1, b2] = plum.bodyInvRot.columns;
  const [t0, t1, t2] = plum.tailInvRot.columns;
  return {
    // Body rotation, with the center and scale tucked into the fourth row
    body: d.mat4x4f(
      d.vec4f(b0, plum.center.x),
      d.vec4f(b1, plum.center.y),
      d.vec4f(b2, plum.scale),
      d.vec4f(plum.tailOffset, plum.opacity),
    ),
    // Tail rotation, with the iris tucked into the fourth row
    tail: d.mat4x4f(d.vec4f(t0, plum.iris.x), d.vec4f(t1, plum.iris.y), d.vec4f(t2, 0), plum.lids),
    bodyColors: d.mat4x4f(
      d.vec4f(plum.bodyTop, 0),
      d.vec4f(plum.bodyBottom, 0),
      d.vec4f(plum.ringTop, 0),
      d.vec4f(plum.ringBottom, 0),
    ),
    tailColors: d.mat4x4f(
      d.vec4f(plum.tailTop, 0),
      d.vec4f(plum.tailBottom, 0),
      d.vec4f(),
      d.vec4f(),
    ),
  };
};

const unpackPlum = (body: d.m4x4f, tail: d.m4x4f, bodyColors: d.m4x4f, tailColors: d.m4x4f) => {
  'use gpu';
  return PlumInstance({
    center: d.vec2f(body.columns[0].w, body.columns[1].w),
    scale: body.columns[2].w,
    opacity: body.columns[3].w,
    bodyInvRot: d.mat3x3f(body.columns[0].xyz, body.columns[1].xyz, body.columns[2].xyz),
    tailOffset: body.columns[3].xyz,
    tailInvRot: d.mat3x3f(tail.columns[0].xyz, tail.columns[1].xyz, tail.columns[2].xyz),
    iris: d.vec2f(tail.columns[0].w, tail.columns[1].w),
    lids: tail.columns[3],
    bodyTop: bodyColors.columns[0].xyz,
    bodyBottom: bodyColors.columns[1].xyz,
    ringTop: bodyColors.columns[2].xyz,
    ringBottom: bodyColors.columns[3].xyz,
    tailTop: tailColors.columns[0].xyz,
    tailBottom: tailColors.columns[1].xyz,
  });
};

export function createPlumRendererGL(root: TgpuRoot, context: GPUCanvasContext): PlumRenderer {
  const viewport = root.createUniform(d.vec2f);
  const pixelRatio = root.createUniform(d.f32);
  const ambient = root.createUniform(d.f32);
  type Slot = ReturnType<typeof createSlot>;
  const createSlot = () => ({
    body: root.createUniform(d.mat4x4f),
    tail: root.createUniform(d.mat4x4f),
    bodyColors: root.createUniform(d.mat4x4f),
    tailColors: root.createUniform(d.mat4x4f),
  });
  const slots = Array.from({ length: MAX_PLUMS }, createSlot);
  const [slot0, slot1, slot2] = slots as [Slot, Slot, Slot];

  // One function per plum, since uniforms can't be picked with an index at runtime
  const createLayer = (slot: Slot) => (px: d.v2f, under: d.v4f) => {
    'use gpu';
    current.$ = unpackPlum(slot.body.$, slot.tail.$, slot.bodyColors.$, slot.tailColors.$);
    // Plum units have y pointing up, CSS pixels have it pointing down
    const offset = (px - current.$.center) / current.$.scale;
    const local = d.vec2f(offset.x, -offset.y);
    const edge = std.abs(local - QUAD_CENTER);
    if (current.$.opacity <= 0 || std.max(edge.x, edge.y) > QUAD_HALF_SIZE) {
      return d.vec4f(under);
    }
    // Premultiplied "over"
    const color = plumPixel(local, pixelRatio.$, ambient.$);
    return color + under * (1 - color.a);
  };
  const [layer0, layer1, layer2] = [slot0, slot1, slot2].map(createLayer);

  /** Body center and scale, from the packed body matrix */
  const placement = (body: d.m4x4f) => {
    'use gpu';
    return d.vec3f(body.columns[0].w, body.columns[1].w, body.columns[2].w);
  };

  const pipeline = root.createRenderPipeline({
    vertex: tgpu.vertexFn({
      in: { vertexIndex: d.builtin.vertexIndex },
      // The index is a float, the GLSL generator doesn't make integer varyings flat yet
      out: { position: d.builtin.position, px: d.vec2f, plumIndex: d.f32 },
    })(({ vertexIndex }) => {
      'use gpu';
      const plumIndex = std.floor(d.f32(vertexIndex) / 6);
      let plum = placement(slot0.body.$);
      if (plumIndex > 0.5) {
        plum = placement(slot1.body.$);
      }
      if (plumIndex > 1.5) {
        plum = placement(slot2.body.$);
      }
      const corner = quadCorner(plum.xy, plum.z, vertexIndex % 6);
      return {
        position: toClipSpace(corner.px, viewport.$),
        px: corner.px,
        plumIndex,
      };
    }),
    fragment: tgpu.fragmentFn({
      in: { px: d.vec2f, plumIndex: d.f32 },
      out: d.vec4f,
    })(({ px, plumIndex }) => {
      'use gpu';
      // Instances come sorted back to front, each quad has the plums behind it too
      let color = layer0(px, d.vec4f());
      if (plumIndex > 0.5) {
        color = layer1(px, color);
      }
      if (plumIndex > 1.5) {
        color = layer2(px, color);
      }
      // The GLSL generator can't return a local variable from an entry point, copying it
      return d.vec4f(color);
    }),
  });

  return {
    render(instances, size, ratio, light) {
      viewport.write(d.vec2f(...size));
      pixelRatio.write(ratio);
      ambient.write(light);
      instances.forEach((instance, i) => {
        const slot = slots[i];
        if (!slot) return;
        const packed = packPlum(instance);
        slot.body.write(packed.body);
        slot.tail.write(packed.tail);
        slot.bodyColors.write(packed.bodyColors);
        slot.tailColors.write(packed.tailColors);
      });
      pipeline
        .withColorAttachment({ view: context, loadOp: 'clear', clearValue: [0, 0, 0, 0] })
        .draw(6 * Math.min(instances.length, MAX_PLUMS));
    },
    destroy() {
      // Uniforms of the WebGL fallback live on the CPU, there's nothing to free
    },
  };
}
