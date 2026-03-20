import { std } from 'typegpu';

export type TrackResult = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  spawn: { position: [number, number]; angle: number };
  trackLength: number;
};

type Pt = { x: number; y: number };

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

function findBestSpawnIndex(pts: Pt[], windowSize: number): number {
  const n = pts.length;
  const curv = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    const t1x = curr.x - prev.x;
    const t1y = curr.y - prev.y;
    const t1len = Math.hypot(t1x, t1y) || 1;

    const t2x = next.x - curr.x;
    const t2y = next.y - curr.y;
    const t2len = Math.hypot(t2x, t2y) || 1;

    curv[i] = Math.abs((t1x / t1len) * (t2y / t2len) - (t1y / t1len) * (t2x / t2len));
  }

  let windowSum = 0;
  for (let i = 0; i < windowSize; i++) windowSum += curv[i];

  let minSum = windowSum;
  let bestStart = 0;

  for (let i = 1; i < n; i++) {
    windowSum += curv[(i + windowSize - 1) % n] - curv[i - 1];
    if (windowSum < minSum) {
      minSum = windowSum;
      bestStart = i;
    }
  }

  return (bestStart + Math.floor(windowSize / 2)) % n;
}

function catmullRomResample(points: Pt[], numSamples: number): Pt[] {
  const n = points.length;
  const result: Pt[] = [];

  for (let s = 0; s < numSamples; s++) {
    const tTotal = s / numSamples;
    const seg = Math.floor(tTotal * n);
    const t = tTotal * n - seg;

    const i0 = (seg - 1 + n) % n;
    const i1 = seg;
    const i2 = (seg + 1) % n;
    const i3 = (seg + 2) % n;

    const p0 = points[i0];
    const p1 = points[i1];
    const p2 = points[i2];
    const p3 = points[i3];

    const t2 = t * t;
    const t3 = t2 * t;

    result.push({
      x:
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y:
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    });
  }

  return result;
}

function buildTrackTexture(
  splinedPath: Pt[],
  textureSize: number,
  trackHalfWidth: number,
  spawnIdx?: number,
): TrackResult {
  const feather = trackHalfWidth * 0.4;

  const segments = splinedPath.map((cell, idx) => {
    const next = splinedPath[(idx + 1) % splinedPath.length];
    const dx = next.x - cell.x;
    const dy = next.y - cell.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      ax: cell.x,
      ay: cell.y,
      ux: dx,
      uy: dy,
      dx: dx / len,
      dy: dy / len,
      len,
      len2: dx * dx + dy * dy,
    };
  });

  let totalLen = 0;
  for (const segment of segments) {
    totalLen += segment.len;
  }

  const data = new Uint8ClampedArray(textureSize * textureSize * 4);

  for (let y = 0; y < textureSize; y++) {
    const ty = 1 - (y / (textureSize - 1)) * 2;
    for (let x = 0; x < textureSize; x++) {
      const tx = (x / (textureSize - 1)) * 2 - 1;

      let minSegDist = Infinity;
      let dir = { x: 1, y: 0 };
      for (const segment of segments) {
        const px = tx - segment.ax;
        const py = ty - segment.ay;
        const t = Math.max(0, Math.min(1, (px * segment.ux + py * segment.uy) / segment.len2));
        const cx = segment.ax + segment.ux * t;
        const cy = segment.ay + segment.uy * t;
        const dx = tx - cx;
        const dy = ty - cy;
        const dist = dx * dx + dy * dy;
        if (dist < minSegDist) {
          minSegDist = dist;
          dir = { x: segment.dx, y: segment.dy };
        }
      }

      const dist = Math.sqrt(minSegDist);
      const mask = 1 - std.smoothstep(trackHalfWidth, trackHalfWidth + feather, dist);

      const idx = (y * textureSize + x) * 4;
      data[idx] = Math.round((dir.x * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((dir.y * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round(mask * 255);
      data[idx + 3] = 255;
    }
  }

  const resolvedSpawnIdx = spawnIdx ?? findBestSpawnIndex(splinedPath, 25);
  const spawnStart = splinedPath[resolvedSpawnIdx];
  const spawnNext = splinedPath[(resolvedSpawnIdx + 1) % splinedPath.length];
  const spawnAngle = Math.atan2(spawnNext.y - spawnStart.y, spawnNext.x - spawnStart.x);

  return {
    width: textureSize,
    height: textureSize,
    data,
    spawn: {
      position: [spawnStart.x, spawnStart.y],
      angle: spawnAngle,
    },
    trackLength: totalLen,
  };
}

function generateLoopPath(W: number, H: number, rand: () => number): number[] {
  const minLength = Math.max(8, Math.floor(W * H * 0.4));
  const path: number[] = [0];
  const inPath = new Map<number, number>([[0, 0]]);

  for (let attempts = 0; attempts < 2_000_000; attempts++) {
    const current = path[path.length - 1];
    const x = current % W,
      y = Math.floor(current / W);

    const neighbors: number[] = [];
    if (x > 0) neighbors.push(current - 1);
    if (x < W - 1) neighbors.push(current + 1);
    if (y > 0) neighbors.push(current - W);
    if (y < H - 1) neighbors.push(current + W);

    const next = neighbors[Math.floor(rand() * neighbors.length)];

    if (next === 0 && path.length >= minLength) {
      return path; // closed loop found
    }

    const existingIdx = inPath.get(next);
    if (existingIdx !== undefined) {
      // Erase the loop back to where 'next' was first visited
      for (let i = existingIdx + 1; i < path.length; i++) {
        inPath.delete(path[i]);
      }
      path.length = existingIdx + 1;
    } else {
      inPath.set(next, path.length);
      path.push(next);
    }
  }

  const perimeter: number[] = [];
  for (let x = 0; x < W; x++) perimeter.push(x);
  for (let y = 1; y < H; y++) perimeter.push(y * W + W - 1);
  for (let x = W - 2; x >= 0; x--) perimeter.push((H - 1) * W + x);
  for (let y = H - 2; y > 0; y--) perimeter.push(y * W);
  return perimeter;
}

export function generateGridTrack(seed: number, W = 5, H = 4, textureSize = 512): TrackResult {
  const rand = mulberry32(seed);
  const cellPath = generateLoopPath(W, H, rand);

  const controlPoints = cellPath.map((cell) => {
    const col = cell % W,
      row = Math.floor(cell / W);
    const cx = -0.8 + ((col + 0.5) * 1.6) / W;
    const cy = 0.8 - ((row + 0.5) * 1.6) / H;
    const jx = (rand() * 2 - 1) * 0.06 * (1.6 / W);
    const jy = (rand() * 2 - 1) * 0.06 * (1.6 / H);
    return { x: cx + jx, y: cy + jy };
  });

  const trackHalfWidth = 0.172 * (1.6 / Math.max(W, H));
  const numSamples = Math.max(120, cellPath.length * 6);
  const splinedPath = catmullRomResample(controlPoints, numSamples);
  return buildTrackTexture(splinedPath, textureSize, trackHalfWidth);
}
