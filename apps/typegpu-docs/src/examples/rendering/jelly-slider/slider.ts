import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';

type Vec2 = [number, number];

const clamp = (x: number, min: number, max: number) =>
  Math.max(min, Math.min(max, x));

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export class Slider {
  #root: TgpuRoot;
  pointsBuffer: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;

  readonly n: number;
  readonly totalLength: number;
  readonly restLen: number;
  readonly baseY: number;
  readonly anchor: Vec2;

  private pos: Float32Array;
  private prev: Float32Array;
  private invMass: Float32Array;
  private targetX: number;

  // Physics parameters
  iterations = 8;
  substeps = 2;
  damping = 0.04;
  bendingStrength = 0.8;
  archStrength = 40;
  clampAboveBase = true;
  endFlatCount = 3;
  endFlatStiffness = 0.9;
  bendingExponent = 3;
  archEdgeDeadzone = 0.2;

  constructor(root: TgpuRoot, start: Vec2, end: Vec2, numPoints: number) {
    this.#root = root;
    this.n = Math.max(2, numPoints | 0);
    this.anchor = [start[0], start[1]];
    this.baseY = start[1];
    this.targetX = end[0];

    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    this.totalLength = Math.hypot(dx, dy);
    this.restLen = this.totalLength / (this.n - 1);

    this.pos = new Float32Array(this.n * 2);
    this.prev = new Float32Array(this.n * 2);
    this.invMass = new Float32Array(this.n);

    // Initialize points along line
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      const x = start[0] * (1 - t) + end[0] * t;
      const y = start[1] * (1 - t) + end[1] * t;
      this.pos[2 * i] = x;
      this.pos[2 * i + 1] = y;
      this.prev[2 * i] = x;
      this.prev[2 * i + 1] = y;
      this.invMass[i] = i === 0 || i === this.n - 1 ? 0 : 1;
    }

    this.pointsBuffer = this.#root
      .createBuffer(
        d.arrayOf(d.vec2f, this.n),
        Array.from(
          { length: this.n },
          (_, i) => d.vec2f(this.pos[2 * i], this.pos[2 * i + 1]),
        ),
      )
      .$usage('storage');
  }

  setDragX(x: number) {
    const minX = this.anchor[0] - this.totalLength;
    const maxX = this.anchor[0] + this.totalLength;
    this.targetX = clamp(x, minX, maxX);
  }

  update(dt: number) {
    if (dt <= 0) return;

    const h = dt / this.substeps;
    const damp = clamp(this.damping, 0, 0.999);
    const compression = Math.max(
      0,
      1 - Math.abs(this.targetX - this.anchor[0]) / this.totalLength,
    );

    for (let s = 0; s < this.substeps; s++) {
      this.integrate(h, damp, compression);
      this.projectConstraints();
    }

    this.updateGPUBuffer();
  }

  private integrate(h: number, damp: number, compression: number) {
    for (let i = 0; i < this.n; i++) {
      const px = this.pos[2 * i];
      const py = this.pos[2 * i + 1];

      // Pin endpoints
      if (i === 0) {
        this.pos[0] = this.anchor[0];
        this.pos[1] = this.anchor[1];
        this.prev[0] = this.anchor[0];
        this.prev[1] = this.anchor[1];
        continue;
      }
      if (i === this.n - 1) {
        this.pos[2 * i] = this.targetX;
        this.pos[2 * i + 1] = this.baseY;
        this.prev[2 * i] = this.targetX;
        this.prev[2 * i + 1] = this.baseY;
        continue;
      }

      // Verlet integration with damping
      const vx = (px - this.prev[2 * i]) * (1 - damp);
      const vy = (py - this.prev[2 * i + 1]) * (1 - damp);

      // Arch bias in middle section only
      let ay = 0;
      if (compression > 0) {
        const t = i / (this.n - 1);
        const edge = this.archEdgeDeadzone;
        const window = smoothstep(edge, 1 - edge, t) *
          smoothstep(edge, 1 - edge, 1 - t);
        const profile = Math.sin(Math.PI * t) * window;
        ay = this.archStrength * profile * compression;
      }

      this.prev[2 * i] = px;
      this.prev[2 * i + 1] = py;
      this.pos[2 * i] = px + vx;
      this.pos[2 * i + 1] = py + vy + ay * h * h;

      // Keep above baseline
      if (this.clampAboveBase && this.pos[2 * i + 1] < this.baseY) {
        this.pos[2 * i + 1] = this.baseY;
      }
    }
  }

  private projectConstraints() {
    for (let it = 0; it < this.iterations; it++) {
      // Segment length constraints
      for (let i = 0; i < this.n - 1; i++) {
        this.projectDistance(i, i + 1, this.restLen, 1.0);
      }

      // Bending resistance (stronger at ends)
      for (let i = 1; i < this.n - 1; i++) {
        const t = i / (this.n - 1);
        const distFromCenter = Math.abs(t - 0.5) * 2;
        const strength = distFromCenter ** this.bendingExponent;
        const k = this.bendingStrength * (0.05 + 0.95 * strength);
        this.projectDistance(i - 1, i + 1, 2 * this.restLen, k);
      }

      // Flatten ends
      if (this.endFlatCount > 0) {
        const count = Math.min(this.endFlatCount, this.n - 2);
        for (let i = 1; i <= count; i++) {
          this.projectLineY(i, this.baseY, this.endFlatStiffness);
        }
        for (let i = this.n - 1 - count; i < this.n - 1; i++) {
          this.projectLineY(i, this.baseY, this.endFlatStiffness);
        }
      }

      // Re-pin endpoints
      this.pos[0] = this.anchor[0];
      this.pos[1] = this.anchor[1];
      this.pos[2 * (this.n - 1)] = this.targetX;
      this.pos[2 * (this.n - 1) + 1] = this.baseY;
    }
  }

  private projectDistance(i: number, j: number, rest: number, k: number) {
    const ix = 2 * i;
    const jx = 2 * j;
    const dx = this.pos[jx] - this.pos[ix];
    const dy = this.pos[jx + 1] - this.pos[ix + 1];
    const len = Math.hypot(dx, dy);

    if (len < 1e-8) return;

    const w1 = this.invMass[i];
    const w2 = this.invMass[j];
    const wsum = w1 + w2;
    if (wsum <= 0) return;

    const diff = (len - rest) / len;
    const c1 = (w1 / wsum) * k;
    const c2 = (w2 / wsum) * k;

    this.pos[ix] += dx * diff * c1;
    this.pos[ix + 1] += dy * diff * c1;
    this.pos[jx] -= dx * diff * c2;
    this.pos[jx + 1] -= dy * diff * c2;
  }

  private projectLineY(i: number, yTarget: number, k: number) {
    if (i <= 0 || i >= this.n - 1 || this.invMass[i] <= 0) return;
    const iy = 2 * i + 1;
    this.pos[iy] += (yTarget - this.pos[iy]) * clamp(k, 0, 1);
  }

  private updateGPUBuffer() {
    this.pointsBuffer.write(
      Array.from(
        { length: this.n },
        (_, i) => d.vec2f(this.pos[2 * i], this.pos[2 * i + 1]),
      ),
    );
  }

  // Utilities
  getEndPoint(): Vec2 {
    const i = this.n - 1;
    return [this.pos[2 * i], this.pos[2 * i + 1]];
  }

  getCompressionRatio(): number {
    const chord = Math.abs(this.targetX - this.anchor[0]);
    return Math.max(0, 1 - chord / this.totalLength);
  }

  // Tuning
  setDamping(d: number) {
    this.damping = clamp(d, 0, 0.5);
  }
  setBendingStrength(k: number) {
    this.bendingStrength = clamp(k, 0, 1);
  }
  setArchStrength(a: number) {
    this.archStrength = Math.max(0, a);
  }
}
