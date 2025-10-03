import * as d from 'typegpu/data';

import type * as s from './structures.ts';
import type { GridConfig, ISurface, ScaleTransform } from './types.ts';

export class GridSurface implements ISurface {
  #gridConfig: GridConfig;

  constructor(
    gridConfig: GridConfig,
  ) {
    this.#gridConfig = gridConfig;
  }

  get gridConfig(): GridConfig {
    return this.#gridConfig;
  }

  set gridConfig(gridConfig: GridConfig) {
    this.#gridConfig = gridConfig;
  }

  getVertexPositions: () => d.v4f[] = () => {
    let vertices = this.#createGrid();
    vertices = this.#populateGridY(vertices);
    return vertices.map((vertex) => vertex.position);
  };

  getVertexBufferData(
    scaleTransform: ScaleTransform,
  ): d.Infer<typeof s.Vertex>[] {
    let vertices = this.#createGrid();
    vertices = this.#populateGridY(vertices);
    vertices = vertices.map((vertex) => {
      const { position, color } = vertex;
      const [x, y, z] = position;
      const [sx, sy, sz] = [
        x * scaleTransform.X.scale + scaleTransform.X.offset,
        y * scaleTransform.Y.scale + scaleTransform.Y.offset,
        z * scaleTransform.Z.scale + scaleTransform.Z.offset,
      ];
      return { position: d.vec4f(sx, sy, sz, 1), color };
    });

    vertices = this.#populateGridColor(vertices);
    return vertices;
  }

  getIndexBufferData(): number[] {
    return this.#createGridIndexArray(
      this.#gridConfig.nx,
      this.#gridConfig.nz,
    );
  }

  /**
   * returns 1D array of vertices
   *    6 --- 7 --- 8
   *    |     |     |
   *    3 --- 4 --- 5
   *    |     |     |
   * -> 0 --- 1 --- 2
   *
   * with x,z coordinates filled
   */
  #createGrid(): d.Infer<typeof s.Vertex>[] {
    const { nx, nz, xRange, zRange } = this.#gridConfig;
    const dz = (zRange.max - zRange.min) / (nz - 1);
    const dx = (xRange.max - xRange.min) / (nx - 1);

    const zs = Array.from({ length: nx }, (_, i) => zRange.min + i * dz);
    const xs = Array.from({ length: nz }, (_, j) => xRange.min + j * dx);

    const vertices = zs.flatMap((z) =>
      xs.map((x) => ({
        position: d.vec4f(x, 0, z, 1),
        color: d.vec4f(0),
      }))
    );

    return vertices;
  }

  #createGridIndexArray(nx: number, nz: number): number[] {
    const indices = [];

    for (let i = 0; i < nz - 1; i++) {
      for (let j = 0; j < nx - 1; j++) {
        const topLeft = i * nx + j;
        const topRight = i * nx + (j + 1);
        const bottomLeft = (i + 1) * nx + j;
        const bottomRight = (i + 1) * nx + (j + 1);

        indices.push(topLeft, bottomLeft, bottomRight);
        indices.push(topLeft, bottomRight, topRight);
      }
    }

    return indices;
  }

  #populateGridColor(
    vertices: d.Infer<typeof s.Vertex>[],
  ): d.Infer<typeof s.Vertex>[] {
    return vertices.map((vertex) => ({
      ...vertex,
      color: this.#gridConfig.colorCallback(vertex.position.y),
    }));
  }

  #populateGridY(
    vertices: d.Infer<typeof s.Vertex>[],
  ): d.Infer<typeof s.Vertex>[] {
    return vertices.map((vertex) => ({
      ...vertex,
      position: d.vec4f(
        vertex.position.x,
        this.#gridConfig.yCallback(vertex.position.x, vertex.position.z),
        vertex.position.z,
        1,
      ),
    }));
  }
}
