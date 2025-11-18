import type { TgpuRoot, TgpuUniform } from 'typegpu';
import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';
import { CameraData } from './types.ts';

export class Camera {
  #root: TgpuRoot;
  #viewProjectionMatrix: d.m4x4f;
  #position: d.v3f;
  #target: d.v3f;
  #up: d.v3f;
  #fov: number;
  #near: number;
  #far: number;
  #inverseViewProjectionMatrix: d.m4x4f;
  #data: d.Infer<CameraData>;
  #uniform: TgpuUniform<CameraData>;

  constructor(
    root: TgpuRoot,
    fov: number = 60,
    near: number = 0.1,
    far: number = 1000,
  ) {
    this.#root = root;
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

    // Create uniform buffer
    this.#uniform = root.createUniform(CameraData, this.#data);
  }

  set position(pos: d.v3f) {
    this.#position = pos;
    this.#recompute();
  }

  get position(): d.v3f {
    return this.#position;
  }

  set target(tgt: d.v3f) {
    this.#target = tgt;
    this.#recompute();
  }

  get target(): d.v3f {
    return this.#target;
  }

  set up(upVec: d.v3f) {
    this.#up = upVec;
    this.#recompute();
  }

  get up(): d.v3f {
    return this.#up;
  }

  set fov(fovDegrees: number) {
    this.#fov = fovDegrees;
    this.#recompute();
  }

  get fov(): number {
    return this.#fov;
  }

  get data(): d.Infer<CameraData> {
    return this.#data;
  }

  get uniform() {
    return this.#uniform;
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

    // Update the uniform buffer
    this.#uniform.write(this.#data);
  }
}
