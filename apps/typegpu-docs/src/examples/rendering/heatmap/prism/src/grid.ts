import * as d from 'typegpu/data';

import type * as s from './structures.ts';
import type { GridConfig, ISurface } from './types.ts';

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

  getVertexBufferData(): d.Infer<typeof s.Vertex>[] {
    let vertices = this.#createGrid();
    vertices = this.#populateGridY(vertices);
    vertices = this.#populateGridColor(vertices);
    vertices = this.#populateGridEdgeColor(vertices);
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
        color: d.vec4f(),
        edgeColor: d.vec4f(),
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

        indices.push(
          topLeft,
          bottomLeft,
          bottomRight,
          topLeft,
          bottomRight,
          topRight,
        );
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

  #populateGridEdgeColor(
    vertices: d.Infer<typeof s.Vertex>[],
  ): d.Infer<typeof s.Vertex>[] {
    return vertices.map((vertex) => ({
      ...vertex,
      edgeColor: this.#gridConfig.edgeColorCallback(vertex.position.y),
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
