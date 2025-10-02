import tgpu, { prepareDispatch } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { perlin3d, randf } from '@typegpu/noise';
import { edgeTable, edgeToVertices, triangleTable } from './tables';

const root = await tgpu.init();

const SIZE = 10;

const terrainTexture = root['~unstable'].createTexture({
  size: [SIZE, SIZE, SIZE],
  format: 'rgba16float',
  dimension: '3d',
}).$usage('sampled', 'render', 'storage');

// fill texture with noise

const fillBindGroupLayout = tgpu.bindGroupLayout({
  terrain: { storageTexture: d.textureStorage3d('rgba16float', 'write-only') },
});

const fillBindGroup = root.createBindGroup(fillBindGroupLayout, {
  terrain: terrainTexture,
});

prepareDispatch(root, (x, y, z) => {
  'kernel';
  randf.seed(x * SIZE * SIZE + y * SIZE + z);
  const level = randf.sample();
  // const level = perlin3d.sample(d.vec3f(x, y, z).div(SIZE));
  std.textureStore(
    fillBindGroupLayout.$.terrain,
    d.vec3u(x, y, z),
    d.vec4f(level, 0, 0, 0),
  );
})
  .with(fillBindGroupLayout, fillBindGroup)
  .dispatch(SIZE, SIZE, SIZE);

// generate triangles

const Point = d.vec3u;
const Triangle = d.arrayOf(Point, 3);
const Triangles = d.struct({ count: d.u32, triangles: d.arrayOf(Triangle, 4) });

const indexMutable = root.createMutable(d.atomic(d.u32), 0);
const trianglesMutable = root.createMutable(
  d.arrayOf(Triangle, 4 * ((SIZE - 1) ** 3)),
);

const generateBindGroupLayout = tgpu.bindGroupLayout({
  terrain: { storageTexture: d.textureStorage3d('rgba16float', 'read-only') },
});

const generateBindGroup = root.createBindGroup(generateBindGroupLayout, {
  terrain: terrainTexture,
});

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
    'kernel';
    let cubeIndex = d.u32(0);
    for (let i = d.u32(0); i < 8; i++) {
      if (cell.value[i] < isoValue) {
        cubeIndex |= d.u32(d.i32(1 << i));
      }
    }
    return cubeIndex;
  },
);

// Find the point between `v1` and `v2` where the functional value = `isovalue`
const interpolate = tgpu.fn([Point, d.f32, Point, d.f32, d.f32], Point)(
  (v1, val1, v2, val2, isoValue) => {
    'kernel';
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
  'kernel';
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
  Triangles,
)((intersections, cubeIndex) => {
  'kernel';
  const triangles = d.arrayOf(Triangle, 4)();
  let count = 0;
  for (let i = 0; triangleTable.$[cubeIndex][i] != -1; i += 3) {
    const triangle = Triangle();
    for (let j = 0; j < 3; j++) {
      triangle[j] = intersections[triangleTable.$[cubeIndex][i + j]];
    }
    triangles[d.u32(i / 3)] = triangle;
    count += 1;
  }

  return { count, triangles };
});

// Get triangles of a single cell
const triangulateCell = tgpu.fn([GridCell, d.f32], Triangles)(
  (cell, isoValue) => {
    'kernel';
    const cubeIndex = calculateCubeIndex(cell, isoValue);
    const intersections = getIntersectionCoordinates(cell, isoValue);
    const triangles = getTriangles(intersections, cubeIndex);

    return triangles;
  },
);

// Triangulate a scalar field represented by `scalarFunction`. `isovalue` should be used for isovalue computation
const triangulateField = prepareDispatch(root, (x, y, z) => {
  'kernel';
  const cell = GridCell(
    {
      vertex: [
        d.vec3u(x, y, z),
        d.vec3u(x + 1, y, z),
        d.vec3u(x + 1, y, z + 1),
        d.vec3u(x, y, z + 1),
        d.vec3u(x, y + 1, z),
        d.vec3u(x + 1, y + 1, z),
        d.vec3u(x + 1, y + 1, z + 1),
        d.vec3u(x, y + 1, z + 1),
      ],
      value: [
        loadValue(x, y, z),
        loadValue(x + 1, y, z),
        loadValue(x + 1, y, z + 1),
        loadValue(x, y, z + 1),
        loadValue(x, y + 1, z),
        loadValue(x + 1, y + 1, z),
        loadValue(x + 1, y + 1, z + 1),
        loadValue(x, y + 1, z + 1),
      ],
    },
  );
  const triangles = triangulateCell(cell, 0.5);

  for (let i = 0; i < triangles.count; i++) {
    const triangleIndex = std.atomicAdd(indexMutable.$, 1);
    trianglesMutable.$[triangleIndex] = triangles.triangles[i];
  }
});

const loadValue = tgpu.fn([d.u32, d.u32, d.u32], d.f32)((x, y, z) => {
  'kernel';
  const textureValue = std.textureLoad(
    generateBindGroupLayout.$.terrain,
    d.vec3u(x, y, z),
  );
  return textureValue.x;
});

triangulateField
  .with(generateBindGroupLayout, generateBindGroup)
  .dispatch(SIZE - 1, SIZE - 1, SIZE - 1);

console.log(await indexMutable.read());
console.log(await trianglesMutable.read());

// #region Example controls and cleanup

export function onCleanup() {
  root.destroy();
}
