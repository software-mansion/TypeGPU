import { tgpu, d, std } from 'typegpu';
import { evaluateSource } from '../explorer/compile.ts';

type Scene = (point: d.v3f, time: number) => { dist: number; color: d.v3f };

export function compileScene(source: string): string {
  const exports = evaluateSource(source, 'scene.ts');
  if (typeof exports.scene !== 'function') {
    throw new Error(
      'Export a GPU function named scene(point: d.v3f, time: number) that returns { dist, color }.',
    );
  }
  const scene = exports.scene as Scene;
  const parameters = tgpu
    .bindGroupLayout({
      view: {
        uniform: d.struct({ resolution: d.vec2f, time: d.f32, eye: d.vec3f, lookAt: d.vec3f }),
      },
    })
    .$idx(0);

  const distance = (p: d.v3f): number => {
    'use gpu';
    return scene(p, parameters.$.view.time).dist;
  };
  const normal = (p: d.v3f): d.v3f => {
    'use gpu';
    const e = 0.001;
    return std.normalize(
      d.vec3f(
        distance(p.add(d.vec3f(e, 0, 0))) - distance(p.sub(d.vec3f(e, 0, 0))),
        distance(p.add(d.vec3f(0, e, 0))) - distance(p.sub(d.vec3f(0, e, 0))),
        distance(p.add(d.vec3f(0, 0, e))) - distance(p.sub(d.vec3f(0, 0, e))),
      ),
    );
  };
  const shadow = (p: d.v3f, light: d.v3f): number => {
    'use gpu';
    const delta = light.sub(p);
    const direction = std.normalize(delta);
    const end = std.length(delta);
    let visibility = d.f32(1);
    let travel = d.f32(0.025);
    for (let i = 0; i < 64; i++) {
      const h = distance(p.add(direction.mul(travel)));
      if (h < 0.0005) return 0;
      visibility = std.min(visibility, (10 * h) / travel);
      travel += std.clamp(h, 0.015, 0.35);
      if (travel >= end) break;
    }
    return std.clamp(visibility, 0, 1);
  };
  const fragment = tgpu
    .fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })(({ position }) => {
      'use gpu';
      const view = parameters.$.view;
      const uv = position.xy.mul(2).sub(view.resolution).div(view.resolution.y);
      const forward = std.normalize(view.lookAt.sub(view.eye));
      const right = std.normalize(std.cross(forward, d.vec3f(0, 1, 0)));
      const up = std.cross(right, forward);
      const direction = std.normalize(forward.mul(1.8).add(right.mul(uv.x)).sub(up.mul(uv.y)));
      const sky = std.mix(
        d.vec3f(0.72, 0.78, 0.88),
        d.vec3f(0.22, 0.3, 0.46),
        std.clamp(direction.y * 0.5 + 0.5, 0, 1),
      );
      let travel = d.f32(0);
      let hit = false;
      for (let i = 0; i < 160; i++) {
        const h = distance(view.eye.add(direction.mul(travel)));
        if (std.abs(h) < 0.001) {
          hit = true;
          break;
        }
        travel += std.max(std.abs(h) * 0.8, 0.0005);
        if (travel > 45) break;
      }
      if (!hit) return d.vec4f(std.pow(sky, d.vec3f(0.4545)), 1);
      const p = view.eye.add(direction.mul(travel));
      const n = normal(p);
      const material = scene(p, view.time);
      const light = d.vec3f(-3, 7, 4);
      const l = std.normalize(light.sub(p));
      const visibility = shadow(p.add(n.mul(0.005)), light);
      let occlusion = d.f32(0);
      for (let i = 1; i <= 4; i++) {
        const h = d.f32(i) * 0.12;
        occlusion += std.max(h - distance(p.add(n.mul(h))), 0) / d.f32(i);
      }
      const ao = std.clamp(1 - occlusion * 1.5, 0.2, 1);
      const ambient = d.vec3f(0.18, 0.23, 0.32).mul(ao * (0.6 + 0.4 * n.y));
      const diffuse = d.vec3f(1.15, 1.02, 0.85).mul(std.max(std.dot(n, l), 0) * visibility);
      const halfway = std.normalize(l.sub(direction));
      const specular = std.pow(std.max(std.dot(n, halfway), 0), 48) * visibility * 0.28;
      const lit = material.color.mul(ambient.add(diffuse)).add(d.vec3f(specular));
      const fog = 1 - std.exp(-0.012 * travel);
      const color = std.mix(lit, sky, fog);
      return d.vec4f(std.pow(std.max(color, d.vec3f(0)), d.vec3f(0.4545)), 1);
    })
    .$name('sdfFragment');
  return tgpu.resolve([fragment]);
}
