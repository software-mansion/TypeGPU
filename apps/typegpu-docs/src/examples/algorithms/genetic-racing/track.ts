export type TrackResult = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  spawn: { position: [number, number]; angle: number };
  trackLength: number;
};

export type Pt = { x: number; y: number };

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

function findBestSpawnIndex(pts: Pt[], window: number): number {
  const n = pts.length;
  const curv = pts.map((c, i) => {
    const p = pts[(i - 1 + n) % n],
      nx = pts[(i + 1) % n];
    const ax = c.x - p.x,
      ay = c.y - p.y,
      la = Math.hypot(ax, ay) || 1;
    const bx = nx.x - c.x,
      by = nx.y - c.y,
      lb = Math.hypot(bx, by) || 1;
    return Math.abs(((ax / la) * by) / lb - ((ay / la) * bx) / lb);
  });
  let sum = curv.slice(0, window).reduce((a, b) => a + b, 0);
  let best = sum,
    start = 0;
  for (let i = 1; i < n; i++) {
    sum += curv[(i + window - 1) % n] - curv[i - 1];
    if (sum < best) {
      best = sum;
      start = i;
    }
  }
  return (start + Math.floor(window / 2)) % n;
}

function catmullRomResample(points: Pt[], numSamples: number): Pt[] {
  const n = points.length;
  const result: Pt[] = [];

  for (let s = 0; s < numSamples; s++) {
    const tTotal = s / numSamples;
    const seg = Math.floor(tTotal * n);
    const t = tTotal * n - seg;

    const p0 = points[(seg - 1 + n) % n];
    const p1 = points[seg];
    const p2 = points[(seg + 1) % n];
    const p3 = points[(seg + 2) % n];

    const t2 = t * t,
      t3 = t2 * t;
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

/** Chaikin corner-cutting — smooths a closed polygon over N iterations. */
function chaikinSmooth(pts: Pt[], iterations = 2): Pt[] {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    const next: Pt[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i],
        b = cur[(i + 1) % cur.length];
      next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    cur = next;
  }
  return cur;
}

function makeTrackResult(
  data: Uint8ClampedArray,
  size: number,
  path: Pt[],
  totalLen: number,
): TrackResult {
  const idx = findBestSpawnIndex(path, 25);
  const s = path[idx],
    n = path[(idx + 1) % path.length];
  return {
    width: size,
    height: size,
    data,
    spawn: { position: [s.x, s.y], angle: Math.atan2(n.y - s.y, n.x - s.x) },
    trackLength: totalLen,
  };
}

/**
 * Rasterizes a splined path into a 512×512 track texture.
 * Coordinate system: tx ∈ [-aspect, +aspect], ty ∈ [-1, +1].
 * Uses per-segment bounding boxes for efficiency.
 */
function buildTrackTexture(
  path: Pt[],
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

  for (let i = 0; i < path.length; i++) {
    const a = path[i],
      b = path[(i + 1) % path.length];
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    totalLen += len;
    const ux = dx / len,
      uy = dy / len,
      len2 = dx * dx + dy * dy;

    const minPx = Math.max(0, Math.floor((((Math.min(a.x, b.x) - extents) / aspect + 1) / 2) * sz));
    const maxPx = Math.min(sz, Math.ceil((((Math.max(a.x, b.x) + extents) / aspect + 1) / 2) * sz));
    const minPy = Math.max(0, Math.floor(((1 - (Math.max(a.y, b.y) + extents)) / 2) * sz));
    const maxPy = Math.min(sz, Math.ceil(((1 - (Math.min(a.y, b.y) - extents)) / 2) * sz));

    for (let py = minPy; py <= maxPy; py++) {
      const ty = 1 - (py / sz) * 2;
      for (let px = minPx; px <= maxPx; px++) {
        const tx = ((px / sz) * 2 - 1) * aspect;
        const t = Math.max(0, Math.min(1, ((tx - a.x) * dx + (ty - a.y) * dy) / len2));
        const dist = Math.hypot(tx - (a.x + dx * t), ty - (a.y + dy * t));
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

  return makeTrackResult(data, textureSize, path, totalLen);
}

function generateLoopPath(W: number, H: number, rand: () => number): number[] {
  const minLength = Math.max(8, Math.floor(W * H * 0.4));
  const path: number[] = [0];
  const inPath = new Map<number, number>([[0, 0]]);

  for (let attempts = 0; attempts < 2_000_000; attempts++) {
    const current = path[path.length - 1];
    const x = current % W;
    const y = Math.floor(current / W);

    const neighbors: number[] = [];
    if (x > 0) neighbors.push(current - 1);
    if (x < W - 1) neighbors.push(current + 1);
    if (y > 0) neighbors.push(current - W);
    if (y < H - 1) neighbors.push(current + W);

    const next = neighbors[Math.floor(rand() * neighbors.length)];

    if (next === 0 && path.length >= minLength) {
      return path;
    }

    const existingIdx = inPath.get(next);
    if (existingIdx !== undefined) {
      for (let i = existingIdx + 1; i < path.length; i++) inPath.delete(path[i]);
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

export function generateGridTrack(
  seed: number,
  W = 5,
  H = 4,
  aspect = 1,
  textureSize = 512,
): TrackResult {
  const rand = mulberry32(seed);
  const cellPath = generateLoopPath(W, H, rand);

  const controlPoints = cellPath.map((cell) => {
    const col = cell % W,
      row = Math.floor(cell / W);
    const cx = (-0.8 + ((col + 0.5) * 1.6) / W) * aspect;
    const cy = 0.8 - ((row + 0.5) * 1.6) / H;
    return {
      x: cx + (rand() * 2 - 1) * 0.06 * (1.6 / W) * aspect,
      y: cy + (rand() * 2 - 1) * 0.06 * (1.6 / H),
    };
  });

  const trackHalfWidth = 0.172 * (1.6 / Math.max(W, H));
  const numSamples = Math.max(120, cellPath.length * 6);
  return buildTrackTexture(
    catmullRomResample(controlPoints, numSamples),
    textureSize,
    trackHalfWidth,
    aspect,
  );
}

export function generateDrawnTrack(
  pts: Pt[],
  halfWidth: number,
  aspect: number,
  textureSize = 512,
): TrackResult {
  const numSamples = Math.max(120, pts.length * 6);
  return buildTrackTexture(
    catmullRomResample(chaikinSmooth(pts), numSamples),
    textureSize,
    halfWidth,
    aspect,
  );
}
