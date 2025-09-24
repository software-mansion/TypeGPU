/**
 * Utility functions for 3D plotting operations
 */

import type { Color, DataPoint, PlotFunction2D, Range, Vec3 } from './types.js';

// ============================================================================
// Color Maps and Utilities
// ============================================================================

export const ColorMaps = {
  viridis: [
    { r: 0.267004, g: 0.004874, b: 0.329415 },
    { r: 0.282623, g: 0.140926, b: 0.457517 },
    { r: 0.253935, g: 0.265254, b: 0.529983 },
    { r: 0.206756, g: 0.371758, b: 0.553117 },
    { r: 0.163625, g: 0.471133, b: 0.558148 },
    { r: 0.127568, g: 0.566949, b: 0.550556 },
    { r: 0.134692, g: 0.658636, b: 0.517649 },
    { r: 0.266941, g: 0.748751, b: 0.440573 },
    { r: 0.477504, g: 0.821444, b: 0.318195 },
    { r: 0.741388, g: 0.873449, b: 0.149561 },
    { r: 0.993248, g: 0.906157, b: 0.143936 },
  ],

  plasma: [
    { r: 0.050383, g: 0.029803, b: 0.527975 },
    { r: 0.186213, g: 0.018803, b: 0.587228 },
    { r: 0.287076, g: 0.010855, b: 0.627295 },
    { r: 0.381047, g: 0.001814, b: 0.653068 },
    { r: 0.472873, g: 0.005678, b: 0.659897 },
    { r: 0.563734, g: 0.047331, b: 0.641509 },
    { r: 0.652325, g: 0.125271, b: 0.596422 },
    { r: 0.736526, g: 0.234892, b: 0.520398 },
    { r: 0.814161, g: 0.378463, b: 0.414303 },
    { r: 0.881443, g: 0.550469, b: 0.277418 },
    { r: 0.940015, g: 0.975158, b: 0.131326 },
  ],

  rainbow: [
    { r: 1.0, g: 0.0, b: 1.0 }, // Magenta
    { r: 0.0, g: 0.0, b: 1.0 }, // Blue
    { r: 0.0, g: 1.0, b: 1.0 }, // Cyan
    { r: 0.0, g: 1.0, b: 0.0 }, // Green
    { r: 1.0, g: 1.0, b: 0.0 }, // Yellow
    { r: 1.0, g: 0.5, b: 0.0 }, // Orange
    { r: 1.0, g: 0.0, b: 0.0 }, // Red
  ],

  grayscale: [
    { r: 0.0, g: 0.0, b: 0.0 },
    { r: 1.0, g: 1.0, b: 1.0 },
  ],
};

/**
 * Map a value to a color using a colormap
 */
export function valueToColor(
  value: number,
  minValue: number,
  maxValue: number,
  colormap: Color[] = ColorMaps.viridis,
): Color {
  if (colormap.length === 0) {
    return { r: 0.5, g: 0.5, b: 0.5 };
  }

  // Normalize value to [0, 1]
  const t = Math.max(
    0,
    Math.min(1, (value - minValue) / (maxValue - minValue)),
  );

  // Handle edge cases
  if (t === 0) return colormap[0];
  if (t === 1) return colormap[colormap.length - 1];

  // Find the two colors to interpolate between
  const scaledIndex = t * (colormap.length - 1);
  const index = Math.floor(scaledIndex);
  const fraction = scaledIndex - index;

  const color1 = colormap[index];
  const color2 = colormap[index + 1];

  return {
    r: color1.r + fraction * (color2.r - color1.r),
    g: color1.g + fraction * (color2.g - color1.g),
    b: color1.b + fraction * (color2.b - color1.b),
    a: 1.0,
  };
}

// ============================================================================
// Data Generation Utilities
// ============================================================================

/**
 * Generate a range of values
 */
export function generateRange(range: Range): number[] {
  const { min, max, step } = range;
  const actualStep = step || (max - min) / 100;
  const values: number[] = [];

  for (let value = min; value <= max; value += actualStep) {
    values.push(value);
  }

  // Ensure we include the max value
  if (values.length > 0 && values[values.length - 1] !== max) {
    values.push(max);
  }

  return values;
}

/**
 * Sample a 2D function over a grid
 */
export function sampleFunction2D(
  fn: PlotFunction2D,
  xRange: Range,
  yRange: Range,
  resolution: number = 50,
): DataPoint[] {
  const points: DataPoint[] = [];

  for (let j = 0; j <= resolution; j++) {
    const v = j / resolution;
    const y = yRange.min + v * (yRange.max - yRange.min);

    for (let i = 0; i <= resolution; i++) {
      const u = i / resolution;
      const x = xRange.min + u * (xRange.max - xRange.min);
      const z = fn(x, y);

      points.push({ x, y, z });
    }
  }

  return points;
}

/**
 * Generate mesh indices for a grid
 */
export function generateMeshIndices(
  width: number,
  height: number,
  wireframe: boolean = false,
): number[] {
  const indices: number[] = [];

  for (let j = 0; j < height - 1; j++) {
    for (let i = 0; i < width - 1; i++) {
      const a = j * width + i;
      const b = a + 1;
      const c = (j + 1) * width + i;
      const d = c + 1;

      if (wireframe) {
        // Lines for wireframe
        indices.push(a, b, b, d, d, c, c, a);
      } else {
        // Triangles for surface
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  return indices;
}

// ============================================================================
// Mathematical Utilities
// ============================================================================

/**
 * Calculate surface normals for a vertex array
 */
export function calculateNormals(
  vertices: Float32Array,
  indices: Uint32Array,
): Float32Array {
  const normals = new Float32Array(vertices.length);

  // Initialize normals to zero
  normals.fill(0);

  // Calculate face normals and accumulate
  for (let i = 0; i < indices.length; i += 3) {
    const i1 = indices[i] * 3;
    const i2 = indices[i + 1] * 3;
    const i3 = indices[i + 2] * 3;

    // Get triangle vertices
    const v1: Vec3 = {
      x: vertices[i1],
      y: vertices[i1 + 1],
      z: vertices[i1 + 2],
    };
    const v2: Vec3 = {
      x: vertices[i2],
      y: vertices[i2 + 1],
      z: vertices[i2 + 2],
    };
    const v3: Vec3 = {
      x: vertices[i3],
      y: vertices[i3 + 1],
      z: vertices[i3 + 2],
    };

    // Calculate face normal
    const edge1 = subtract(v2, v1);
    const edge2 = subtract(v3, v1);
    const normal = normalize(cross(edge1, edge2));

    // Add to vertex normals
    normals[i1] += normal.x;
    normals[i1 + 1] += normal.y;
    normals[i1 + 2] += normal.z;

    normals[i2] += normal.x;
    normals[i2 + 1] += normal.y;
    normals[i2 + 2] += normal.z;

    normals[i3] += normal.x;
    normals[i3 + 1] += normal.y;
    normals[i3 + 2] += normal.z;
  }

  // Normalize all normals
  for (let i = 0; i < normals.length; i += 3) {
    const normal: Vec3 = {
      x: normals[i],
      y: normals[i + 1],
      z: normals[i + 2],
    };
    const normalized = normalize(normal);
    normals[i] = normalized.x;
    normals[i + 1] = normalized.y;
    normals[i + 2] = normalized.z;
  }

  return normals;
}

/**
 * Calculate bounding box for an array of points
 */
export function calculateBounds(points: DataPoint[] | Float32Array): {
  min: Vec3;
  max: Vec3;
} {
  if (points.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }

  let minX: number, minY: number, minZ: number;
  let maxX: number, maxY: number, maxZ: number;

  if (points instanceof Float32Array) {
    minX = maxX = points[0];
    minY = maxY = points[1];
    minZ = maxZ = points[2];

    for (let i = 3; i < points.length; i += 3) {
      minX = Math.min(minX, points[i]);
      minY = Math.min(minY, points[i + 1]);
      minZ = Math.min(minZ, points[i + 2]);
      maxX = Math.max(maxX, points[i]);
      maxY = Math.max(maxY, points[i + 1]);
      maxZ = Math.max(maxZ, points[i + 2]);
    }
  } else {
    const firstPoint = points[0];
    minX = maxX = firstPoint.x;
    minY = maxY = firstPoint.y;
    minZ = maxZ = firstPoint.z;

    for (let i = 1; i < points.length; i++) {
      const point = points[i];
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      minZ = Math.min(minZ, point.z);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      maxZ = Math.max(maxZ, point.z);
    }
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

// ============================================================================
// Vector Math Utilities
// ============================================================================

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function multiply(v: Vec3, scalar: number): Vec3 {
  return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len === 0) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function distance(a: Vec3, b: Vec3): number {
  return length(subtract(a, b));
}

// ============================================================================
// Common Mathematical Functions
// ============================================================================

export const MathFunctions = {
  // Simple functions
  sine: (x: number, y: number) => Math.sin(x) * Math.cos(y),
  cosine: (x: number, y: number) => Math.cos(x) * Math.sin(y),

  // Wave patterns
  ripple: (x: number, y: number) => Math.sin(Math.sqrt(x * x + y * y)),
  waves: (x: number, y: number) => Math.sin(x) * Math.sin(y),

  // 3D shapes
  paraboloid: (x: number, y: number) => x * x + y * y,
  saddle: (x: number, y: number) => x * x - y * y,

  // Gaussian
  gaussian: (x: number, y: number) => Math.exp(-(x * x + y * y) / 2),

  // More complex patterns
  interference: (x: number, y: number) =>
    Math.sin(x * 2) + Math.sin(y * 2) + Math.sin((x + y) * 1.5),

  spiral: (x: number, y: number) => {
    const r = Math.sqrt(x * x + y * y);
    const theta = Math.atan2(y, x);
    return Math.sin(r * 3 - theta * 2) * Math.exp(-r / 5);
  },
};

// ============================================================================
// Data Processing Utilities
// ============================================================================

/**
 * Smooth data using moving average
 */
export function smoothData(data: number[], windowSize: number = 3): number[] {
  if (windowSize <= 1 || data.length < windowSize) return [...data];

  const smoothed: number[] = [];
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < data.length; i++) {
    let sum = 0;
    let count = 0;

    for (
      let j = Math.max(0, i - halfWindow);
      j <= Math.min(data.length - 1, i + halfWindow);
      j++
    ) {
      sum += data[j];
      count++;
    }

    smoothed[i] = sum / count;
  }

  return smoothed;
}

/**
 * Find min and max values in array
 */
export function findMinMax(data: number[]): { min: number; max: number } {
  if (data.length === 0) return { min: 0, max: 0 };

  let min = data[0];
  let max = data[0];

  for (let i = 1; i < data.length; i++) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }

  return { min, max };
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
