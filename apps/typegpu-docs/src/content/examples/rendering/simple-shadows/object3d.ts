import type {
  IndexFlag,
  TgpuBuffer,
  TgpuRoot,
  UniformFlag,
  VertexFlag,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';
import { mat3 } from 'wgpu-matrix';

export const VertexInfo = d.struct({
  position: d.vec4f,
  normal: d.vec4f,
  color: d.vec4f,
});
export type VertexInfo = typeof VertexInfo;

export class Object3D {
  vertexBuffer: TgpuBuffer<d.WgslArray<VertexInfo>> & VertexFlag;
  indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag;
  modelMatrixBuffer: TgpuBuffer<d.Mat4x4f> & UniformFlag;
  normalMatrixBuffer: TgpuBuffer<d.Mat3x3f> & UniformFlag;
  parent: Object3D | null = null;
  children: Object3D[] = [];

  private _modelMatrix: d.m4x4f;

  constructor(
    root: TgpuRoot,
    vertexBuffer: TgpuBuffer<d.WgslArray<VertexInfo>> & VertexFlag,
    indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag,
    initialTransform: d.m4x4f = m.mat4.identity(d.mat4x4f()),
  ) {
    this.vertexBuffer = vertexBuffer;
    this.indexBuffer = indexBuffer;
    this._modelMatrix = initialTransform;
    this.modelMatrixBuffer = root
      .createBuffer(d.mat4x4f, this._modelMatrix)
      .$usage('uniform');
    this.normalMatrixBuffer = root
      .createBuffer(d.mat3x3f, this.computeNormalMatrix())
      .$usage('uniform');
  }

  translate(x: number, y: number, z: number) {
    this._modelMatrix = m.mat4.translate(
      this._modelMatrix,
      d.vec3f(x, y, z),
      this._modelMatrix,
    );
    this.updateModelMatrix();
  }

  rotateX(angle: number) {
    this._modelMatrix = m.mat4.rotateX(
      this._modelMatrix,
      angle,
      this._modelMatrix,
    );
    this.updateModelMatrix();
  }

  rotateY(angle: number) {
    this._modelMatrix = m.mat4.rotateY(
      this._modelMatrix,
      angle,
      this._modelMatrix,
    );
    this.updateModelMatrix();
  }

  rotateZ(angle: number) {
    this._modelMatrix = m.mat4.rotateZ(
      this._modelMatrix,
      angle,
      this._modelMatrix,
    );
    this.updateModelMatrix();
  }

  scale(x: number, y: number, z: number) {
    this._modelMatrix = m.mat4.scale(
      this._modelMatrix,
      d.vec3f(x, y, z),
      this._modelMatrix,
    );
    this.updateModelMatrix();
  }

  setTransform(transform: d.m4x4f) {
    this._modelMatrix = transform;
    this.updateModelMatrix();
  }

  private updateModelMatrix() {
    this.modelMatrixBuffer.write(this._modelMatrix);
    this.normalMatrixBuffer.write(this.computeNormalMatrix());
  }

  private computeNormalMatrix(): d.m3x3f {
    const m3 = mat3.fromMat4(this._modelMatrix, d.mat3x3f());
    mat3.invert(m3, m3);
    mat3.transpose(m3, m3);
    return m3;
  }
}
