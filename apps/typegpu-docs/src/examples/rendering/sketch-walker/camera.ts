import { clamp, mat4, spherical, vec3, vec4, type Vec3, type Vec4 } from 'math';
import { mulberry32, random } from 'math/random';
import { spring, spring3 } from 'math/time';
import type { Terrain } from './terrain.ts';

const FOV = (50 * Math.PI) / 180;

export function createCamera(canvas: HTMLCanvasElement, terrain: Terrain, focusStart: Vec3) {
  // Orbit around the walker in spherical coordinates: [radius, theta (around Y), phi (from +Y)].
  const orbit = spherical.fromValues(28, 0.9, 1.28);
  const zoom = spring.create(orbit[0]);
  // theta is measured around +Y from +Z, the direction the walker faces at the start.
  let targetZoom = orbit[0];

  const focus = spring3.create(focusStart);
  const shake = spring3.create([0, 0, 0]);
  const rng = mulberry32.create(7);
  const sample = () => mulberry32.sample(rng);

  const eye = vec3.create();
  const lookAt = vec3.create();
  const offset = vec3.create();
  const view = mat4.create();
  const projection = mat4.create();
  const viewProj = mat4.create();
  const invViewProj = mat4.create();

  function update(dt: number, target: Vec3) {
    spring3.damp(focus, target, 0.35, dt);
    spring3.update(shake, [0, 0, 0], 0.12, 0.25, dt);
    spring.damp(zoom, targetZoom, 0.2, dt);
    orbit[0] = zoom.value;

    vec3.add(lookAt, focus.value, shake.value);
    spherical.toVec3(offset, orbit);
    vec3.add(eye, lookAt, offset);
    // Never dip below the ground.
    eye[1] = Math.max(eye[1], terrain.heightAt(eye[0], eye[2]) + 2.5);

    mat4.lookAt(view, eye, lookAt, [0, 1, 0]);
    mat4.perspectiveZO(projection, FOV, canvas.width / canvas.height, 0.5, 1500);
    mat4.multiply(viewProj, projection, view);
    mat4.invert(invViewProj, viewProj);
  }

  /** Kicks the camera, stronger when the stomp happens close by. */
  function stomp(strength: number, at: Vec3) {
    const falloff = clamp(1 - vec3.distance(at, eye) / 90, 0, 1);
    const kick = random.vec3(vec3.create(), sample);
    kick[1] = -Math.abs(kick[1]) * 2;
    vec3.scaleAndAdd(shake.velocity, shake.velocity, kick, 2.2 * strength * falloff);
  }

  function rotate(dx: number, dy: number) {
    orbit[1] -= dx * 0.006;
    orbit[2] = clamp(orbit[2] - dy * 0.005, 0.35, 1.5);
  }

  function zoomBy(amount: number) {
    targetZoom = clamp(targetZoom * Math.exp(amount * 0.001), 16, 70);
  }

  /** Slowly swings the orbit towards `angle` relative to the walker's heading. */
  function follow(dt: number, heading: number, angle: number) {
    const goal = heading + angle;
    const delta = Math.atan2(Math.sin(goal - orbit[1]), Math.cos(goal - orbit[1]));
    orbit[1] += delta * Math.min(1, dt * 0.35);
  }

  /** The walking direction on XZ for a stick/keyboard input, relative to where the camera looks. */
  function toWorld(out: [number, number], right: number, forward: number) {
    const fx = -Math.sin(orbit[1]);
    const fz = -Math.cos(orbit[1]);
    // Screen-right is forward x up.
    out[0] = fx * forward - fz * right;
    out[1] = fz * forward + fx * right;
    return out;
  }

  const _near: Vec4 = [0, 0, 0, 1];
  const _far: Vec4 = [0, 0, 0, 1];
  const _dir = vec3.create();
  const _p = vec3.create();

  /** Casts a ray through a point on the canvas and returns where it hits the terrain. */
  function pick(clientX: number, clientY: number): Vec3 | undefined {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = 1 - ((clientY - rect.top) / rect.height) * 2;
    vec4.transformMat4(_near, vec4.set(_near, x, y, 0, 1), invViewProj);
    vec4.transformMat4(_far, vec4.set(_far, x, y, 1, 1), invViewProj);
    const origin: Vec3 = [_near[0] / _near[3], _near[1] / _near[3], _near[2] / _near[3]];
    vec3.sub(_dir, [_far[0] / _far[3], _far[1] / _far[3], _far[2] / _far[3]], origin);
    vec3.normalize(_dir, _dir);

    // March until we pass below the ground, then bisect to the surface.
    let previous = 0;
    for (let t = 1; t < 700; t += 1) {
      vec3.scaleAndAdd(_p, origin, _dir, t);
      if (_p[1] < terrain.heightAt(_p[0], _p[2])) {
        let lo = previous;
        let hi = t;
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          vec3.scaleAndAdd(_p, origin, _dir, mid);
          if (_p[1] < terrain.heightAt(_p[0], _p[2])) {
            hi = mid;
          } else {
            lo = mid;
          }
        }
        return vec3.clone(_p);
      }
      previous = t;
    }
    return undefined;
  }

  return {
    eye,
    view,
    viewProj,
    invViewProj,
    update,
    stomp,
    rotate,
    zoomBy,
    follow,
    toWorld,
    pick,
  };
}

export type Camera = ReturnType<typeof createCamera>;
