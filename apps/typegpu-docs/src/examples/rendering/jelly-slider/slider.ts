import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export class Slider {
  #root: TgpuRoot;
  #pos: Float32Array;
  #normals: Float32Array;
  #prev: Float32Array;
  #invMass: Float32Array;
  #targetX: number;
  #angles: Float32Array;

  pointsBuffer: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
  normalsBuffer: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
  anglesBuffer: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;

  readonly n: number;
  readonly totalLength: number;
  readonly restLen: number;
  readonly baseY: number;
  readonly anchor: d.v2f;

  // Physics parameters
  iterations = 12;
  substeps = 3;
  damping = 0.02;
  bendingStrength = 0.8;
  archStrength = 30;
  endFlatCount = 4;
  endFlatStiffness = 0.6;
  bendingExponent = 0.2;
  archEdgeDeadzone = 0.4;

  constructor(root: TgpuRoot, start: d.v2f, end: d.v2f, numPoints: number) {
    this.#root = root;
    this.n = Math.max(2, numPoints | 0);
    this.anchor = start;
    this.baseY = start.y;
    this.#targetX = end.x;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    this.totalLength = Math.hypot(dx, dy);
    this.restLen = this.totalLength / (this.n - 1);

    this.#pos = new Float32Array(this.n * 2);
    this.#normals = new Float32Array(this.n * 2);
    this.#prev = new Float32Array(this.n * 2);
    this.#invMass = new Float32Array(this.n);
    this.#angles = new Float32Array(this.n * 2);

    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      const x = start[0] * (1 - t) + end[0] * t;
      const y = start[1] * (1 - t) + end[1] * t;
      this.#pos[2 * i] = x;
      this.#pos[2 * i + 1] = y;
      this.#prev[2 * i] = x;
      this.#prev[2 * i + 1] = y;
      this.#invMass[i] = i === 0 || i === this.n - 1 ? 0 : 1;
    }

    this.pointsBuffer = this.#root
      .createBuffer(
        d.arrayOf(d.vec2f, this.n),
        Array.from(
          { length: this.n },
          (_, i) => d.vec2f(this.#pos[2 * i], this.#pos[2 * i + 1]),
        ),
      )
      .$usage('storage');

    this.normalsBuffer = this.#root
      .createBuffer(
        d.arrayOf(d.vec2f, this.n),
        Array.from({ length: this.n }, () => d.vec2f(0, 1)),
      )
      .$usage('storage');

    this.anglesBuffer = this.#root
      .createBuffer(
        d.arrayOf(d.vec2f, this.n),
        Array.from({ length: this.n }, () => d.vec2f(0, 0)),
      )
      .$usage('storage');
  }

  setDragX(x: number) {
    const minX = this.anchor[0] - this.totalLength;
    const maxX = this.anchor[0] + this.totalLength;
    this.#targetX = std.clamp(x, minX, maxX);
  }

  update(dt: number) {
    if (dt <= 0) return;

    const h = dt / this.substeps;
    const damp = std.clamp(this.damping, 0, 0.999);
    const compression = Math.max(
      0,
      1 - Math.abs(this.#targetX - this.anchor[0]) / this.totalLength,
    );

    for (let s = 0; s < this.substeps; s++) {
      this.#integrate(h, damp, compression);
      this.#projectConstraints();
    }

    this.#computeNormals();
    this.#computeAngles();
    this.#updateGPUBuffer();
  }

  #integrate(h: number, damp: number, compression: number) {
    for (let i = 0; i < this.n; i++) {
      const px = this.#pos[2 * i];
      const py = this.#pos[2 * i + 1];

      // Pin endpoints
      if (i === 0) {
        this.#pos[0] = this.anchor[0];
        this.#pos[1] = this.anchor[1];
        this.#prev[0] = this.anchor[0];
        this.#prev[1] = this.anchor[1];
        continue;
      }
      if (i === this.n - 1) {
        this.#pos[2 * i] = this.#targetX;
        this.#pos[2 * i + 1] = this.baseY;
        this.#prev[2 * i] = this.#targetX;
        this.#prev[2 * i + 1] = this.baseY;
        continue;
      }

      // Verlet integration with damping
      const vx = (px - this.#prev[2 * i]) * (1 - damp);
      const vy = (py - this.#prev[2 * i + 1]) * (1 - damp);

      // Arch bias in middle section only
      let ay = 0;
      if (compression > 0) {
        const t = i / (this.n - 1);
        const edge = this.archEdgeDeadzone;
        const window = std.smoothstep(edge, 1 - edge, t) *
          std.smoothstep(edge, 1 - edge, 1 - t);
        const profile = Math.sin(Math.PI * t) * window;
        ay = this.archStrength * profile * compression;
      }

      this.#prev[2 * i] = px;
      this.#prev[2 * i + 1] = py;
      this.#pos[2 * i] = px + vx;
      this.#pos[2 * i + 1] = py + vy + ay * h * h;

      // Keep above baseline
      if (this.#pos[2 * i + 1] < this.baseY) {
        this.#pos[2 * i + 1] = this.baseY;
      }
    }
  }

  #projectConstraints() {
    for (let it = 0; it < this.iterations; it++) {
      // Segment length constraints
      for (let i = 0; i < this.n - 1; i++) {
        this.#projectDistance(i, i + 1, this.restLen, 1.0);
      }

      // Bending resistance (stronger at ends)
      for (let i = 1; i < this.n - 1; i++) {
        const t = i / (this.n - 1);
        const distFromCenter = Math.abs(t - 0.5) * 2;
        const strength = distFromCenter ** this.bendingExponent;
        const k = this.bendingStrength * (0.05 + 0.95 * strength);
        this.#projectDistance(i - 1, i + 1, 2 * this.restLen, k);
      }

      // Flatten ends
      if (this.endFlatCount > 0) {
        const count = Math.min(this.endFlatCount, this.n - 2);
        for (let i = 1; i <= count; i++) {
          this.#projectLineY(i, this.baseY, this.endFlatStiffness);
        }
        for (let i = this.n - 1 - count / 2; i < this.n - 1; i++) {
          this.#projectLineY(i, this.baseY, this.endFlatStiffness);
        }
      }

      // Re-pin endpoints
      this.#pos[0] = this.anchor[0];
      this.#pos[1] = this.anchor[1];
      this.#pos[2 * (this.n - 1)] = this.#targetX;
      this.#pos[2 * (this.n - 1) + 1] = this.baseY;
    }
  }

  #projectDistance(i: number, j: number, rest: number, k: number) {
    const ix = 2 * i;
    const jx = 2 * j;
    const dx = this.#pos[jx] - this.#pos[ix];
    const dy = this.#pos[jx + 1] - this.#pos[ix + 1];
    const len = Math.hypot(dx, dy);

    if (len < 1e-8) return;

    const w1 = this.#invMass[i];
    const w2 = this.#invMass[j];
    const wsum = w1 + w2;
    if (wsum <= 0) return;

    const diff = (len - rest) / len;
    const c1 = (w1 / wsum) * k;
    const c2 = (w2 / wsum) * k;

    this.#pos[ix] += dx * diff * c1;
    this.#pos[ix + 1] += dy * diff * c1;
    this.#pos[jx] -= dx * diff * c2;
    this.#pos[jx + 1] -= dy * diff * c2;
  }

  #projectLineY(i: number, yTarget: number, k: number) {
    if (i <= 0 || i >= this.n - 1 || this.#invMass[i] <= 0) return;
    const iy = 2 * i + 1;
    this.#pos[iy] += (yTarget - this.#pos[iy]) * std.clamp(k, 0, 1);
  }

  #computeNormals() {
    for (let i = 0; i < this.n; i++) {
      let tangentX = 0;
      let tangentY = 0;

      if (i === 0 && this.n > 1) {
        // First point: use forward difference
        tangentX = this.#pos[2] - this.#pos[0];
        tangentY = this.#pos[3] - this.#pos[1];
      } else if (i === this.n - 1 && this.n > 1) {
        // Last point: use backward difference
        tangentX = this.#pos[2 * i] - this.#pos[2 * (i - 1)];
        tangentY = this.#pos[2 * i + 1] - this.#pos[2 * (i - 1) + 1];
      } else {
        // Middle points: use central difference
        tangentX = this.#pos[2 * (i + 1)] - this.#pos[2 * (i - 1)];
        tangentY = this.#pos[2 * (i + 1) + 1] - this.#pos[2 * (i - 1) + 1];
      }

      const tangentLen = Math.hypot(tangentX, tangentY);
      if (tangentLen > 1e-8) {
        tangentX /= tangentLen;
        tangentY /= tangentLen;
      }

      this.#normals[2 * i] = -tangentY;
      this.#normals[2 * i + 1] = tangentX;
    }
  }

  // fix the angle calculation (currently they always sum to 180 degrees which is wrong (there are situations (when we have high curvature))
  #computeAngles() {
    for (let i = 0; i < this.n; i++) {
      let angleAB = 0;
      let angleBC = 0;

      const normalX = this.#normals[2 * i];
      const normalY = this.#normals[2 * i + 1];

      // Angle between AB and normal
      if (i > 0) {
        const abX = this.#pos[2 * i] - this.#pos[2 * (i - 1)];
        const abY = this.#pos[2 * i + 1] - this.#pos[2 * (i - 1) + 1];

        const A = [this.#pos[2 * (i - 1)], this.#pos[2 * (i - 1) + 1]];
        const B = [this.#pos[2 * i], this.#pos[2 * i + 1]];
        const BA = [A[0] - B[0], A[1] - B[1]];

        const NORMAL = [normalX, normalY];

        const BA_len = Math.hypot(BA[0], BA[1]);
        const NORMAL_len = Math.hypot(NORMAL[0], NORMAL[1]);

        const dotProduct = BA[0] * NORMAL[0] + BA[1] * NORMAL[1];
        const temp = dotProduct / (BA_len * NORMAL_len);
        const angle = Math.acos(temp);

        const abLen = Math.hypot(abX, abY);
        if (abLen > 1e-8) {
          const abNormX = abX / abLen;
          const abNormY = abY / abLen;
          angleAB = Math.atan2(
            abNormX * normalY - abNormY * normalX,
            abNormX * normalX + abNormY * normalY,
          );
        }
        angleAB = angle;
      }

      // Angle between normal and BC
      if (i < this.n - 1) {
        const bcX = this.#pos[2 * (i + 1)] - this.#pos[2 * i];
        const bcY = this.#pos[2 * (i + 1) + 1] - this.#pos[2 * i + 1];

        const B = [this.#pos[2 * i], this.#pos[2 * i + 1]];
        const C = [this.#pos[2 * (i + 1)], this.#pos[2 * (i + 1) + 1]];
        const BC = [C[0] - B[0], C[1] - B[1]];

        const NORMAL = [normalX, normalY];

        const BC_len = Math.hypot(BC[0], BC[1]);
        const NORMAL_len = Math.hypot(NORMAL[0], NORMAL[1]);

        const dotProduct = BC[0] * NORMAL[0] + BC[1] * NORMAL[1];
        const temp = dotProduct / (BC_len * NORMAL_len);
        const angle = Math.acos(temp);
        const bcLen = Math.hypot(bcX, bcY);
        if (bcLen > 1e-8) {
          const bcNormX = bcX / bcLen;
          const bcNormY = bcY / bcLen;
          angleBC = Math.atan2(
            normalX * bcNormY - normalY * bcNormX,
            normalX * bcNormX + normalY * bcNormY,
          );
        }
        angleBC = angle;
      }

      this.#angles[2 * i] = angleAB;
      this.#angles[2 * i + 1] = angleBC;
    }
  }

  #updateGPUBuffer() {
    this.pointsBuffer.write(
      Array.from(
        { length: this.n },
        (_, i) => d.vec2f(this.#pos[2 * i], this.#pos[2 * i + 1]),
      ),
    );

    this.normalsBuffer.write(
      Array.from(
        { length: this.n },
        (_, i) => d.vec2f(this.#normals[2 * i], this.#normals[2 * i + 1]),
      ),
    );

    this.anglesBuffer.write(
      Array.from(
        { length: this.n },
        (_, i) => d.vec2f(this.#angles[2 * i], this.#angles[2 * i + 1]),
      ),
    );
  }
}
