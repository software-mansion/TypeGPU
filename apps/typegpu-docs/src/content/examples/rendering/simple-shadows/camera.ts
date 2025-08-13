import type { TgpuBuffer, TgpuRoot, UniformFlag } from 'typegpu';
import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';

export const CameraInfo = d.struct({
  projectionMatrix: d.mat4x4f,
  viewMatrix: d.mat4x4f,
});
type CameraInfo = typeof CameraInfo;

export class PerspectiveCamera {
  shaderInfo: TgpuBuffer<CameraInfo> & UniformFlag;

  private _position: d.v3f;
  private _forward: d.v3f = d.vec3f(0, 0, -1);
  private _right: d.v3f = d.vec3f(1, 0, 0);
  private _up: d.v3f;
  private _fov: number;
  private _aspect: number;
  private _near: number;
  private _far: number;
  private _yaw = 0;
  private _pitch = 0;

  constructor(
    shaderInfo: TgpuBuffer<CameraInfo> & UniformFlag,
    position: d.v3f,
    target: d.v3f,
    up: d.v3f,
    fov: number,
    aspect: number,
    near: number,
    far: number,
  ) {
    this.shaderInfo = shaderInfo;
    this._position = position;
    this._up = up;
    this._fov = fov;
    this._aspect = aspect;
    this._near = near;
    this._far = far;

    // Calculate initial yaw and pitch from position and target
    const direction = [
      target[0] - position[0],
      target[1] - position[1],
      target[2] - position[2],
    ];
    const length = Math.sqrt(
      direction[0] * direction[0] + direction[1] * direction[1] +
        direction[2] * direction[2],
    );
    direction[0] /= length;
    direction[1] /= length;
    direction[2] /= length;

    this._yaw = Math.atan2(direction[0], direction[2]);
    this._pitch = Math.asin(-direction[1]);

    this.updateVectors();
    this.updateProjectionMatrix();
    this.updateViewMatrix();
  }

  get position() {
    return this._position;
  }
  set position(v: d.v3f) {
    this._position = v;
    this.updateViewMatrix();
  }

  get forward() {
    return this._forward;
  }

  get fov() {
    return this._fov;
  }
  set fov(v: number) {
    this._fov = v;
    this.updateProjectionMatrix();
  }

  get aspectRatio() {
    return this._aspect;
  }
  set aspectRatio(v: number) {
    this._aspect = v;
    this.updateProjectionMatrix();
  }

  get near() {
    return this._near;
  }
  set near(v: number) {
    this._near = v;
    this.updateProjectionMatrix();
  }

  get far() {
    return this._far;
  }
  set far(v: number) {
    this._far = v;
    this.updateProjectionMatrix();
  }

  moveForward(distance: number) {
    this._position = d.vec3f(
      this._position[0] + this._forward[0] * distance,
      this._position[1] + this._forward[1] * distance,
      this._position[2] + this._forward[2] * distance,
    );
    this.updateViewMatrix();
  }

  moveRight(distance: number) {
    this._position = d.vec3f(
      this._position[0] + this._right[0] * distance,
      this._position[1] + this._right[1] * distance,
      this._position[2] + this._right[2] * distance,
    );
    this.updateViewMatrix();
  }

  moveUp(distance: number) {
    this._position = d.vec3f(
      this._position[0] + this._up[0] * distance,
      this._position[1] + this._up[1] * distance,
      this._position[2] + this._up[2] * distance,
    );
    this.updateViewMatrix();
  }

  rotateYaw(delta: number) {
    this._yaw += delta;
    this.updateVectors();
    this.updateViewMatrix();
  }

  rotatePitch(delta: number) {
    this._pitch = Math.max(
      -Math.PI / 2 + 0.1,
      Math.min(Math.PI / 2 - 0.1, this._pitch + delta),
    );
    this.updateVectors();
    this.updateViewMatrix();
  }

  private updateVectors() {
    // Calculate forward vector from yaw and pitch
    this._forward = d.vec3f(
      Math.sin(this._yaw) * Math.cos(this._pitch),
      -Math.sin(this._pitch),
      Math.cos(this._yaw) * Math.cos(this._pitch),
    );

    // Calculate right vector (cross product of forward and world up)
    const worldUp = d.vec3f(0, 1, 0);
    this._right = d.vec3f(
      this._forward[2] * worldUp[1] - this._forward[1] * worldUp[2],
      this._forward[0] * worldUp[2] - this._forward[2] * worldUp[0],
      this._forward[1] * worldUp[0] - this._forward[0] * worldUp[1],
    );

    // Normalize right vector
    const rightLength = Math.sqrt(
      this._right[0] * this._right[0] + this._right[1] * this._right[1] +
        this._right[2] * this._right[2],
    );
    this._right = d.vec3f(
      this._right[0] / rightLength,
      this._right[1] / rightLength,
      this._right[2] / rightLength,
    );

    // Calculate up vector (cross product of right and forward)
    this._up = d.vec3f(
      this._right[1] * this._forward[2] - this._right[2] * this._forward[1],
      this._right[2] * this._forward[0] - this._right[0] * this._forward[2],
      this._right[0] * this._forward[1] - this._right[1] * this._forward[0],
    );
  }

  private updateProjectionMatrix() {
    this.shaderInfo.writePartial({
      projectionMatrix: m.mat4.perspective(
        this._fov,
        this._aspect,
        this._near,
        this._far,
        d.mat4x4f(),
      ),
    });
  }

  private updateViewMatrix() {
    const target = d.vec3f(
      this._position[0] + this._forward[0],
      this._position[1] + this._forward[1],
      this._position[2] + this._forward[2],
    );

    this.shaderInfo.writePartial({
      viewMatrix: m.mat4.lookAt(
        this._position,
        target,
        this._up,
        d.mat4x4f(),
      ),
    });
  }
}

export function createCamera(
  root: TgpuRoot,
  {
    position,
    target,
    up,
    fov,
    aspect,
    near,
    far,
  }: {
    position: d.v3f;
    target: d.v3f;
    up: d.v3f;
    fov: number;
    aspect: number;
    near: number;
    far: number;
  },
): PerspectiveCamera {
  return new PerspectiveCamera(
    root.createBuffer(CameraInfo).$usage('uniform'),
    position,
    target,
    up,
    fov,
    aspect,
    near,
    far,
  );
}
