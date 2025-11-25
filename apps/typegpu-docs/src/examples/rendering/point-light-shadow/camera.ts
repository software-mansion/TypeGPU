import type { TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';
import { CameraData } from './types.ts';

export class Camera {
  readonly #uniform;

  #position = d.vec3f(0, 0, 0);
  #target = d.vec3f(0, 0, -1);
  #up = d.vec3f(0, 1, 0);
  #fov: number;
  #near: number;
  #far: number;

  constructor(root: TgpuRoot, fov = 60, near = 0.1, far = 1000) {
    this.#fov = fov;
    this.#near = near;
    this.#far = far;
    this.#uniform = root.createUniform(CameraData, this.#computeData());
  }

  set position(pos: d.v3f) {
    this.#position = pos;
    this.#update();
  }

  get position() {
    return this.#position;
  }

  set target(tgt: d.v3f) {
    this.#target = tgt;
    this.#update();
  }

  get target() {
    return this.#target;
  }

  set up(upVec: d.v3f) {
    this.#up = upVec;
    this.#update();
  }

  get up() {
    return this.#up;
  }

  set fov(fovDegrees: number) {
    this.#fov = fovDegrees;
    this.#update();
  }

  get fov() {
    return this.#fov;
  }

  get uniform() {
    return this.#uniform;
  }

  #computeData() {
    const view = m.mat4.lookAt(
      d.vec3f(-this.#position.x, this.#position.y, this.#position.z),
      d.vec3f(-this.#target.x, this.#target.y, this.#target.z),
      d.vec3f(-this.#up.x, this.#up.y, this.#up.z),
      d.mat4x4f(),
    );
    m.mat4.scale(view, d.vec3f(-1, 1, 1), view);

    const projection = m.mat4.perspective(
      (this.#fov * Math.PI) / 180,
      1,
      this.#near,
      this.#far,
      d.mat4x4f(),
    );

    const viewProjectionMatrix = m.mat4.mul(projection, view, d.mat4x4f());

    return CameraData({
      viewProjectionMatrix,
      inverseViewProjectionMatrix: m.mat4.invert(viewProjectionMatrix),
    });
  }

  #update() {
    this.#uniform.write(this.#computeData());
  }
}
