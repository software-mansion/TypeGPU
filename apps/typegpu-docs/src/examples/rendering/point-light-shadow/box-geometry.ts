import type { IndexFlag, TgpuBuffer, TgpuRoot, VertexFlag } from 'typegpu';
import { d } from 'typegpu';
import type { GeometryData } from './types.ts';
import { InstanceData, VertexData } from './types.ts';

export class BoxGeometry {
  static #vertexBuffer: (TgpuBuffer<d.WgslArray<VertexData>> & VertexFlag) | null = null;
  static #indexBuffer: (TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag) | null = null;
  static #indexCount = 0;

  #modelMatrix = d.mat4x4f.identity();
  #position = d.vec3f(0, 0, 0);
  #scale = d.vec3f(1, 1, 1);
  #rotation = d.vec3f(0, 0, 0);

  constructor(root: TgpuRoot) {
    if (!BoxGeometry.#vertexBuffer || !BoxGeometry.#indexBuffer) {
      this.#initBuffers(root);
    }
  }

  #initBuffers(root: TgpuRoot) {
    const vertices: GeometryData = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    const addFace = (
      u: number,
      v: number,
      w: number,
      udir: number,
      vdir: number,
      depth: number,
    ) => {
      for (let iy = 0; iy < 2; iy++) {
        for (let ix = 0; ix < 2; ix++) {
          const pos = [0, 0, 0];
          pos[u] = (ix - 0.5) * udir;
          pos[v] = (iy - 0.5) * vdir;
          pos[w] = 0.5 * Math.sign(depth);

          const norm = [0, 0, 0];
          norm[w] = Math.sign(depth);

          vertices.push({
            position: d.vec3f(pos[0], pos[1], pos[2]),
            normal: d.vec3f(norm[0], norm[1], norm[2]),
            uv: d.vec2f(ix, 1 - iy),
          });
        }
      }

      indices.push(
        vertexOffset,
        vertexOffset + 1,
        vertexOffset + 2,
        vertexOffset + 1,
        vertexOffset + 3,
        vertexOffset + 2,
      );
      vertexOffset += 4;
    };

    addFace(2, 1, 0, -1, 1, 1); // +X
    addFace(2, 1, 0, 1, 1, -1); // -X
    addFace(0, 2, 1, 1, 1, 1); // +Y
    addFace(0, 2, 1, 1, -1, -1); // -Y
    addFace(0, 1, 2, 1, 1, 1); // +Z
    addFace(0, 1, 2, -1, 1, -1); // -Z

    BoxGeometry.#vertexBuffer = root
      .createBuffer(d.arrayOf(VertexData, vertices.length), vertices)
      .$usage('vertex');
    BoxGeometry.#indexBuffer = root
      .createBuffer(d.arrayOf(d.u16, indices.length), indices)
      .$usage('index');
    BoxGeometry.#indexCount = indices.length;
  }

  set position(value: d.v3f) {
    this.#position = value;
    this.#updateModelMatrix();
  }

  get position() {
    return this.#position;
  }

  set scale(value: d.v3f) {
    this.#scale = value;
    this.#updateModelMatrix();
  }

  get scale() {
    return this.#scale;
  }

  set rotation(value: d.v3f) {
    this.#rotation = value;
    this.#updateModelMatrix();
  }

  get rotation() {
    return this.#rotation;
  }

  get instanceData(): d.Infer<InstanceData> {
    return InstanceData({
      column1: this.#modelMatrix.columns[0],
      column2: this.#modelMatrix.columns[1],
      column3: this.#modelMatrix.columns[2],
      column4: this.#modelMatrix.columns[3],
    });
  }

  static get vertexBuffer() {
    if (!BoxGeometry.#vertexBuffer) {
      throw new Error('BoxGeometry buffers not initialized');
    }
    return BoxGeometry.#vertexBuffer;
  }

  static get indexBuffer() {
    if (!BoxGeometry.#indexBuffer) {
      throw new Error('BoxGeometry buffers not initialized');
    }
    return BoxGeometry.#indexBuffer;
  }

  static get indexCount() {
    return BoxGeometry.#indexCount;
  }

  static clearBuffers() {
    BoxGeometry.#vertexBuffer = null;
    BoxGeometry.#indexBuffer = null;
  }

  #updateModelMatrix() {
    this.#modelMatrix = d.mat4x4f
      .translation(this.#position)
      .mul(d.mat4x4f.rotationZ(this.#rotation.z))
      .mul(d.mat4x4f.rotationY(this.#rotation.y))
      .mul(d.mat4x4f.rotationX(this.#rotation.x))
      .mul(d.mat4x4f.scaling(this.#scale));
  }
}
