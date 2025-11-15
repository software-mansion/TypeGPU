import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';
import { CameraData } from './types.ts';

export class Camera {
  #viewProjectionMatrix: d.m4x4f;
  #position: d.v3f;
  #target: d.v3f;
  #up: d.v3f;
  #fov: number;
  #near: number;
  #far: number;
  #inverseViewProjectionMatrix: d.m4x4f;
  #data: d.Infer<CameraData>;

  constructor(fov: number = 60, near: number = 0.1, far: number = 1000) {
    this.#viewProjectionMatrix = d.mat4x4f.identity();
    this.#position = d.vec3f(0, 0, 0);
    this.#target = d.vec3f(0, 0, -1);
    this.#up = d.vec3f(0, 1, 0);
    this.#fov = fov;
    this.#near = near;
    this.#far = far;
    this.#inverseViewProjectionMatrix = d.mat4x4f.identity();
    this.#data = CameraData({
      viewProjectionMatrix: this.#viewProjectionMatrix,
      inverseViewProjectionMatrix: this.#inverseViewProjectionMatrix,
    });
  }

  set position(pos: d.v3f) {
    this.#position = pos;
    this.#recompute();
  }

  set target(tgt: d.v3f) {
    this.#target = tgt;
    this.#recompute();
  }

  set up(upVec: d.v3f) {
    this.#up = upVec;
    this.#recompute();
  }

  set fov(fovDegrees: number) {
    this.#fov = fovDegrees;
    this.#recompute();
  }

  get data(): d.Infer<CameraData> {
    return this.#data;
  }

  #recompute() {
    const view = m.mat4.lookAt(
      this.#position,
      this.#target,
      this.#up,
      d.mat4x4f(),
    );
    const projection = m.mat4.perspective(
      (this.#fov * Math.PI) / 180,
      1,
      this.#near,
      this.#far,
      d.mat4x4f(),
    );
    this.#viewProjectionMatrix = m.mat4.mul(projection, view, d.mat4x4f());
    this.#inverseViewProjectionMatrix = m.mat4.invert(
      this.#viewProjectionMatrix,
    );
    this.#data = CameraData({
      viewProjectionMatrix: this.#viewProjectionMatrix,
      inverseViewProjectionMatrix: this.#inverseViewProjectionMatrix,
    });
  }
}
