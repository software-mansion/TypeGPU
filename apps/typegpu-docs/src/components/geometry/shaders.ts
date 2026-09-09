import { meshes } from '@typegpu/geometry';
import { d, std, tgpu } from 'typegpu';

export const Parameters = d.struct({
  amplitude: d.f32,
  frequency: d.f32,
  tilt: d.f32,
  stripes: d.f32,
  twist: d.f32,
  hue: d.f32,
});
export const Scene = d.struct({
  viewProj: d.mat4x4f,
  time: d.f32,
  flat: d.u32,
  wireframe: d.u32,
  params: d.align(16, Parameters),
});
export const Paint = d.struct({ color: d.vec3f });
export type Painted = meshes.Attached<typeof meshes.Surface, typeof Paint>;
export type VertexSchema = typeof meshes.Surface | Painted;

export const sceneAccess = tgpu.accessor(Scene);
const lightDirection = std.normalize(d.vec3f(0.5, 1, 0.35));
const varyings = {
  worldPos: d.vec3f,
  normal: d.vec3f,
  color: d.vec3f,
  barycentric: d.interpolate('linear', d.vec3f),
};

export const fragment = tgpu.fragmentFn({
  in: { ...varyings, front: d.builtin.frontFacing },
  out: d.vec4f,
})(({ worldPos, normal, color, barycentric, front }) => {
  'use gpu';
  const smooth = std.normalize(normal);
  const faceted = std.normalize(std.cross(std.dpdx(worldPos), std.dpdy(worldPos)));
  const oriented = std.mul(faceted, std.sign(std.dot(faceted, smooth)));
  const n = std.mul(
    std.select(smooth, oriented, sceneAccess.$.flat === 1),
    std.select(-1, d.f32(1), front),
  );
  const diffuse = std.max(std.dot(n, lightDirection), 0);
  const sky = n.y * 0.5 + 0.5;
  const lit = std.mul(color, 0.2 + 0.25 * sky + 0.6 * diffuse);

  const edges = std.smoothstep(d.vec3f(0), std.mul(std.fwidth(barycentric), 1.2), barycentric);
  const interior = std.min(edges.x, std.min(edges.y, edges.z));
  const wire = std.mix(d.vec3f(0.65, 0.8, 1), std.mul(lit, 0.25), interior);
  return d.vec4f(std.select(lit, wire, sceneAccess.$.wireframe === 1), 1);
});

export function vertexShader(schema: VertexSchema) {
  const layout = tgpu.bindGroupLayout({
    vertices: { storage: d.arrayOf(schema) },
    indices: { storage: d.arrayOf(d.u32) },
  });
  const painted = 'color' in schema.propTypes;
  const vertex = tgpu.vertexFn({
    in: { vid: d.builtin.vertexIndex },
    out: { pos: d.builtin.position, ...varyings },
  })(({ vid }) => {
    'use gpu';
    let index = vid;
    if (sceneAccess.$.wireframe === 1) index = layout.$.indices[vid];
    const v = layout.$.vertices[index];
    const color = painted ? (v as d.InferGPU<Painted>).color : d.vec3f(0.55, 0.7, 0.95);
    const corner = vid % 3;
    return {
      pos: std.mul(sceneAccess.$.viewProj, d.vec4f(v.position, 1)),
      worldPos: v.position,
      normal: v.normal,
      color,
      barycentric: std.select(
        d.vec3f(0),
        d.vec3f(1),
        d.vec3b(corner === 0, corner === 1, corner === 2),
      ),
    };
  });
  return { layout, vertex };
}
