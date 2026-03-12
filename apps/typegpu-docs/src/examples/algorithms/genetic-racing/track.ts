export type TrackResult = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  spawn: { position: [number, number]; angle: number };
  trackLength: number;
};

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Catmull-Rom spline resampling.
 * @param points Interleaved Float32Array [x0,y0,x1,y1,…] of control points (closed loop).
 * @returns Interleaved Float32Array of numSamples evenly-spaced points.
 */
function catmullRomResample(points: Float32Array, numSamples: number): Float32Array {
  const n = points.length >> 1;
  const result = new Float32Array(numSamples * 2);

  for (let s = 0; s < numSamples; s++) {
    const tTotal = s / numSamples;
    const seg = Math.floor(tTotal * n);
    const t = tTotal * n - seg;

    const p0 = ((seg - 1 + n) % n) * 2;
    const p1 = seg * 2;
    const p2 = ((seg + 1) % n) * 2;
    const p3 = ((seg + 2) % n) * 2;

    const t2 = t * t,
      t3 = t2 * t;

    result[s * 2] =
      0.5 *
      (2 * points[p1] +
        (-points[p0] + points[p2]) * t +
        (2 * points[p0] - 5 * points[p1] + 4 * points[p2] - points[p3]) * t2 +
        (-points[p0] + 3 * points[p1] - 3 * points[p2] + points[p3]) * t3);

    result[s * 2 + 1] =
      0.5 *
      (2 * points[p1 + 1] +
        (-points[p0 + 1] + points[p2 + 1]) * t +
        (2 * points[p0 + 1] - 5 * points[p1 + 1] + 4 * points[p2 + 1] - points[p3 + 1]) * t2 +
        (-points[p0 + 1] + 3 * points[p1 + 1] - 3 * points[p2 + 1] + points[p3 + 1]) * t3);
  }

  return result;
}

/**
 * Chaikin corner-cutting — smooths a closed polygon over N iterations.
 * @param pts Interleaved Float32Array [x0,y0,x1,y1,…].
 * @returns   Interleaved Float32Array with 2^iterations × as many points.
 */
function chaikinSmooth(pts: Float32Array, iterations = 2): Float32Array {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    const n = cur.length >> 1;
    const next = new Float32Array(n * 4); // each point becomes 2 → length doubles
    for (let i = 0; i < n; i++) {
      const ai = i * 2;
      const bi = ((i + 1) % n) * 2;
      next[i * 4] = 0.75 * cur[ai] + 0.25 * cur[bi];
      next[i * 4 + 1] = 0.75 * cur[ai + 1] + 0.25 * cur[bi + 1];
      next[i * 4 + 2] = 0.25 * cur[ai] + 0.75 * cur[bi];
      next[i * 4 + 3] = 0.25 * cur[ai + 1] + 0.75 * cur[bi + 1];
    }
    cur = next;
  }
  return cur;
}

/**
 * Rasterizes a splined path into a track texture.
 * Coordinate system: tx ∈ [-aspect, +aspect], ty ∈ [-1, +1].
 * Uses per-segment bounding boxes for efficiency.
 * @param path Interleaved Float32Array [x0,y0,x1,y1,…].
 */
function buildTrackTexture(
  path: Float32Array,
  textureSize: number,
  halfWidth: number,
  aspect: number,
): TrackResult {
  const feather = halfWidth * 0.4;
  const extents = halfWidth + feather;
  const sz = textureSize - 1;
  let totalLen = 0;
  const data = new Uint8ClampedArray(textureSize * textureSize * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;

  const numPts = path.length >> 1;
  for (let i = 0; i < numPts; i++) {
    const ai = i * 2;
    const bi = ((i + 1) % numPts) * 2;

    const ax = path[ai],
      ay = path[ai + 1];
    const bx = path[bi],
      by = path[bi + 1];
    const dx = bx - ax,
      dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    totalLen += len;
    const ux = dx / len,
      uy = dy / len,
      len2 = dx * dx + dy * dy;

    const minPx = Math.max(0, Math.floor((((Math.min(ax, bx) - extents) / aspect + 1) / 2) * sz));
    const maxPx = Math.min(sz, Math.ceil((((Math.max(ax, bx) + extents) / aspect + 1) / 2) * sz));
    const minPy = Math.max(0, Math.floor(((1 - (Math.max(ay, by) + extents)) / 2) * sz));
    const maxPy = Math.min(sz, Math.ceil(((1 - (Math.min(ay, by) - extents)) / 2) * sz));

    for (let py = minPy; py <= maxPy; py++) {
      const ty = 1 - (py / sz) * 2;
      for (let px = minPx; px <= maxPx; px++) {
        const tx = ((px / sz) * 2 - 1) * aspect;
        const t = Math.max(0, Math.min(1, ((tx - ax) * dx + (ty - ay) * dy) / len2));
        const dist = Math.hypot(tx - (ax + dx * t), ty - (ay + dy * t));
        if (dist > extents) continue;
        const st = Math.max(0, Math.min(1, (dist - halfWidth) / feather));
        const mask = Math.round((1 - st * st * (3 - 2 * st)) * 255);
        const idx = (py * textureSize + px) * 4;
        if (mask > data[idx + 2]) {
          data[idx] = Math.round((ux * 0.5 + 0.5) * 255);
          data[idx + 1] = Math.round((uy * 0.5 + 0.5) * 255);
          data[idx + 2] = mask;
        }
      }
    }
  }

  return {
    width: textureSize,
    height: textureSize,
    data,
    spawn: {
      position: [path[0], path[1]],
      angle: Math.atan2(path[3] - path[1], path[2] - path[0]),
    },
    trackLength: totalLen,
  };
}

/**
 * Random-walk loop path over a W×H grid.
 * @returns A Uint16Array subarray view of the valid path.
 */
function generateLoopPath(W: number, H: number, rand: () => number): Uint16Array {
  const maxCells = W * H;
  const minLength = Math.max(8, Math.floor(maxCells * 0.4));

  // Pre-allocate worst-case path length (every cell visited once)
  const pathBuf = new Uint16Array(maxCells);
  let pathLen = 1;
  pathBuf[0] = 0;

  // Direct-address lookup: inPath[cell] = index in pathBuf, or -1 if absent
  const inPath = new Int32Array(maxCells).fill(-1);
  inPath[0] = 0;

  const neighbourBuf = new Uint16Array(4);

  for (let attempts = 0; attempts < 2_000_000; attempts++) {
    const current = pathBuf[pathLen - 1];
    const x = current % W;
    const y = (current / W) | 0;

    let nc = 0;
    if (x > 0) neighbourBuf[nc++] = current - 1;
    if (x < W - 1) neighbourBuf[nc++] = current + 1;
    if (y > 0) neighbourBuf[nc++] = current - W;
    if (y < H - 1) neighbourBuf[nc++] = current + W;

    const next = neighbourBuf[(rand() * nc) | 0];

    if (next === 0 && pathLen >= minLength) {
      return pathBuf.subarray(0, pathLen);
    }

    const existingIdx = inPath[next];
    if (existingIdx !== -1) {
      // Erase the loop: remove all cells after existingIdx from the index
      for (let i = existingIdx + 1; i < pathLen; i++) inPath[pathBuf[i]] = -1;
      pathLen = existingIdx + 1;
    } else {
      inPath[next] = pathLen;
      pathBuf[pathLen++] = next;
    }
  }

  // Fallback: clockwise perimeter
  const perim: number[] = [];
  for (let px = 0; px < W; px++) perim.push(px);
  for (let py = 1; py < H; py++) perim.push(py * W + W - 1);
  for (let px = W - 2; px >= 0; px--) perim.push((H - 1) * W + px);
  for (let py = H - 2; py > 0; py--) perim.push(py * W);
  return new Uint16Array(perim);
}

export function generateGridTrack(
  seed: number,
  W = 5,
  H = 4,
  aspect = 1,
  textureSize = 512,
): TrackResult {
  const rand = mulberry32(seed);
  const cellPath = generateLoopPath(W, H, rand);
  const n = cellPath.length;

  // Build interleaved Float32Array of control points directly
  const controlPoints = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const cell = cellPath[i];
    const col = cell % W,
      row = (cell / W) | 0;
    const cx = (-0.8 + ((col + 0.5) * 1.6) / W) * aspect;
    const cy = 0.8 - ((row + 0.5) * 1.6) / H;
    controlPoints[i * 2] = cx + (rand() * 2 - 1) * 0.06 * (1.6 / W) * aspect;
    controlPoints[i * 2 + 1] = cy + (rand() * 2 - 1) * 0.06 * (1.6 / H);
  }

  const trackHalfWidth = 0.172 * (1.6 / Math.max(W, H));
  const numSamples = Math.max(120, n * 6);
  return buildTrackTexture(
    catmullRomResample(controlPoints, numSamples),
    textureSize,
    trackHalfWidth,
    aspect,
  );
}

export function generateDrawnTrack(
  pts: Float32Array,
  halfWidth: number,
  aspect: number,
  textureSize = 512,
): TrackResult {
  const n = pts.length >> 1;
  const numSamples = Math.max(120, n * 6);
  return buildTrackTexture(
    catmullRomResample(chaikinSmooth(pts), numSamples),
    textureSize,
    halfWidth,
    aspect,
  );
}
