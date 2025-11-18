import type { IndexFlag, TgpuBuffer, TgpuRoot, VertexFlag } from 'typegpu';
import * as d from 'typegpu/data';
import type { GeometryData } from './types.ts';
import { VertexData } from './types.ts';

export class BoxGeometry {
  #root: TgpuRoot;
  #modelMatrix: d.m4x4f;
  #position: d.v3f;
  #scale: d.v3f;
  #rotation: d.v3f;
  #size: [number, number, number];
  #vertices: GeometryData;
  #indices: number[];
  #vertexBuffer: TgpuBuffer<d.WgslArray<VertexData>> & VertexFlag;
  #indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag;

  constructor(
    root: TgpuRoot,
    size: [number, number, number] = [1, 1, 1],
  ) {
    this.#root = root;
    this.#modelMatrix = d.mat4x4f.identity();
    this.#position = d.vec3f(0, 0, 0);
    this.#scale = d.vec3f(1, 1, 1);
    this.#rotation = d.vec3f(0, 0, 0);
    this.#size = size;
    this.#vertices = [];
    this.#indices = [];

    this.#generateGeometry();

    // Create GPU buffers
    this.#vertexBuffer = root
      .createBuffer(
        d.arrayOf(VertexData, this.#vertices.length),
        this.#vertices,
      )
      .$usage('vertex');

    this.#indexBuffer = root
      .createBuffer(d.arrayOf(d.u16, this.#indices.length), this.#indices)
      .$usage('index');
  }

  set position(value: d.v3f) {
    this.#position = value;
    this.#updateModelMatrix();
  }

  get position(): d.v3f {
    return this.#position;
  }

  set scale(value: d.v3f) {
    this.#scale = value;
    this.#updateModelMatrix();
  }

  get scale(): d.v3f {
    return this.#scale;
  }

  set rotation(value: d.v3f) {
    this.#rotation = value;
    this.#updateModelMatrix();
  }

  get rotation(): d.v3f {
    return this.#rotation;
  }

  get modelMatrix(): d.m4x4f {
    return this.#modelMatrix;
  }

  get vertices(): GeometryData {
    return this.#vertices;
  }

  get indices(): number[] {
    return this.#indices;
  }

  get vertexBuffer() {
    return this.#vertexBuffer;
  }

  get indexBuffer() {
    return this.#indexBuffer;
  }

  get indexCount(): number {
    return this.#indices.length;
  }

  #generateGeometry() {
    const [w, h, d] = this.#size;
    const halfW = w / 2;
    const halfH = h / 2;
    const halfD = d / 2;

    this.#vertices = [];
    this.#indices = [];

    // Front face (+Z)
    this.#addFace(
      [
        [-halfW, -halfH, halfD],
        [halfW, -halfH, halfD],
        [halfW, halfH, halfD],
        [-halfW, halfH, halfD],
      ],
      [0, 0, 1],
      [[0, 0], [1, 0], [1, 1], [0, 1]],
    );

    // Back face (-Z)
    this.#addFace(
      [
        [halfW, -halfH, -halfD],
        [-halfW, -halfH, -halfD],
        [-halfW, halfH, -halfD],
        [halfW, halfH, -halfD],
      ],
      [0, 0, -1],
      [[0, 0], [1, 0], [1, 1], [0, 1]],
    );

    // Right face (+X)
    this.#addFace(
      [
        [halfW, -halfH, -halfD],
        [halfW, -halfH, halfD],
        [halfW, halfH, halfD],
        [halfW, halfH, -halfD],
      ],
      [1, 0, 0],
      [[0, 0], [1, 0], [1, 1], [0, 1]],
    );

    // Left face (-X)
    this.#addFace(
      [
        [-halfW, -halfH, halfD],
        [-halfW, -halfH, -halfD],
        [-halfW, halfH, -halfD],
        [-halfW, halfH, halfD],
      ],
      [-1, 0, 0],
      [[0, 0], [1, 0], [1, 1], [0, 1]],
    );

    // Top face (+Y)
    this.#addFace(
      [
        [-halfW, halfH, halfD],
        [halfW, halfH, halfD],
        [halfW, halfH, -halfD],
        [-halfW, halfH, -halfD],
      ],
      [0, 1, 0],
      [[0, 0], [1, 0], [1, 1], [0, 1]],
    );

    // Bottom face (-Y)
    this.#addFace(
      [
        [-halfW, -halfH, -halfD],
        [halfW, -halfH, -halfD],
        [halfW, -halfH, halfD],
        [-halfW, -halfH, halfD],
      ],
      [0, -1, 0],
      [[0, 0], [1, 0], [1, 1], [0, 1]],
    );
  }

  #addFace(
    positions: [number, number, number][],
    normal: [number, number, number],
    uvs: [number, number][],
  ) {
    const startIndex = this.#vertices.length;

    positions.forEach((pos, i) => {
      this.#vertices.push(
        VertexData({
          position: d.vec3f(...pos),
          normal: d.vec3f(...normal),
          uv: d.vec2f(...uvs[i]),
        }),
      );
    });

    // Two triangles per face
    this.#indices.push(startIndex, startIndex + 1, startIndex + 2);
    this.#indices.push(startIndex, startIndex + 2, startIndex + 3);
  }

  #updateModelMatrix() {
    const translationMatrix = d.mat4x4f.translation(this.#position);
    const rotationXMatrix = d.mat4x4f.rotationX(this.#rotation.x);
    const rotationYMatrix = d.mat4x4f.rotationY(this.#rotation.y);
    const rotationZMatrix = d.mat4x4f.rotationZ(this.#rotation.z);
    const scaleMatrix = d.mat4x4f.scaling(this.#scale);

    this.#modelMatrix = translationMatrix.mul(
      rotationZMatrix.mul(
        rotationYMatrix.mul(
          rotationXMatrix.mul(scaleMatrix),
        ),
      ),
    );
  }
}
