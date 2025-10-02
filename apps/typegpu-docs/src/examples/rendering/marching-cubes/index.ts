import tgpu, { prepareDispatch } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { perlin3d } from '@typegpu/noise';
import { edgeTable, edgeToVertices, triangleTable } from './tables';

const root = await tgpu.init();

const SIZE = 10;

const terrainTexture = root['~unstable'].createTexture({
  size: [SIZE, SIZE, SIZE],
  format: 'rgba16float',
  dimension: '3d',
}).$usage('sampled', 'render', 'storage');

const bindGroupLayout = tgpu.bindGroupLayout({
  terrain: { storageTexture: d.textureStorage3d('rgba16float', 'write-only') },
});

const bindGroup = root.createBindGroup(bindGroupLayout, {
  terrain: terrainTexture,
});

prepareDispatch(root, (x, y, z) => {
  'kernel';
  const level = perlin3d.sample(d.vec3f(x, y, z).div(SIZE));
  std.textureStore(
    bindGroupLayout.$.terrain,
    d.vec3u(x, y, z),
    d.vec4f(level, 0, 0, 0),
  );
})
  .with(bindGroupLayout, bindGroup)
  .dispatch(SIZE, SIZE, SIZE);

// ---generate triangles---
const Point = d.vec3u;
const Triangle = d.arrayOf(Point, 3);

const GridCell = d.struct({
  vertex: d.arrayOf(Point, 8),
  value: d.arrayOf(d.f32, 8),
});

/**
 * Given a `cell`, calculate its cube index
 * The cube index is an 8-bit encoding. Each bit represents a vertex. `index[i]` is the ith bit
 * If the value at the ith vertex is < isovalue, `index[i]` = 1. Else, `index[i]` = 0
 */
const calculateCubeIndex = tgpu.fn([GridCell, d.f32], d.u32)(
  (cell, isoValue) => {
    let cubeIndex = d.u32(0);
    for (let i = 0; i < 8; i++) {
      if (cell.value[i] < isoValue) {
        cubeIndex |= 1 << i;
      }
    }
    return cubeIndex;
  },
);

// Find the point between `v1` and `v2` where the functional value = `isovalue`
const interpolate = tgpu.fn([Point, d.f32, Point, d.f32, d.f32], Point)(
  (v1, val1, v2, val2, isoValue) => {
    const interpolated = Point();
    const mu = (isoValue - val1) / (val2 - val1);

    interpolated.x = mu * (v2.x - v1.x) + v1.x;
    interpolated.y = mu * (v2.y - v1.y) + v1.y;
    interpolated.z = mu * (v2.z - v1.z) + v1.z;

    return interpolated;
  },
);

// Returns all intersection coordinates of a cell with the isosurface
// (Calls `interpolate()`)
const getIntersectionCoordinates = tgpu.fn(
  [GridCell, d.f32],
  d.arrayOf(Point, 12),
)((cell, isoValue) => {
  const intersections = d.arrayOf(Point, 12)();
  const cubeIndex = calculateCubeIndex(cell, isoValue);

  let intersectionsKey = edgeTable.$[cubeIndex];
  let idx = 0;
  while (intersectionsKey) {
    if (intersectionsKey & 1) {
      const v1 = edgeToVertices.$[idx][0];
      const v2 = edgeToVertices.$[idx][1];
      const intersectionPoint = interpolate(
        cell.vertex[v1],
        cell.value[v1],
        cell.vertex[v2],
        cell.value[v2],
        isoValue,
      );
      intersections[idx] = intersectionPoint;
    }
    idx++;
    intersectionsKey >>= 1;
  }

  return intersections;
});

// Given `cubeIndex`, get the edge table entry and using `intersections`, make all triangles
const getTriangles = tgpu.fn(
  [d.arrayOf(Point, 12), d.u32],
  d.arrayOf(Triangle, 4),
)((intersections, cubeIndex) => {
  const triangles = d.arrayOf(Triangle, 4)();
  for (let i = 0; triangleTable.$[cubeIndex][i] != -1; i += 3) {
    const triangle = Triangle();
    for (let j = 0; j < 3; j++) {
      triangle[j] = intersections[triangleTable.$[cubeIndex][i + j]];
    }
    triangles[i / 3] = triangle;
  }

  return triangles;
});

// Get triangles of a single cell
const triangulateCell = tgpu.fn([GridCell, d.f32], d.arrayOf(Triangle, 4))(
  (cell, isoValue) => {
    const cubeIndex = calculateCubeIndex(cell, isoValue);
    const intersections = getIntersectionCoordinates(cell, isoValue);
    const triangles = getTriangles(intersections, cubeIndex);

    return triangles;
  },
);

// Triangulate a scalar field represented by `scalarFunction`. `isovalue` should be used for isovalue computation
// const triangulateField = tgpu.fn([d.f32]);

// #region Example controls and cleanup

export function onCleanup() {
  root.destroy();
}
