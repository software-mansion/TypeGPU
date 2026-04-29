const ENVIRONMENT_SIZE = 256;

export const ENVIRONMENT_MIP_LEVELS = Math.floor(Math.log2(ENVIRONMENT_SIZE)) + 1;

type Vec3 = [number, number, number];

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t];
}

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 1, 0];
}

function mul(v: Vec3, scale: number): Vec3 {
  return [v[0] * scale, v[1] * scale, v[2] * scale];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

const FACE_BASES = [
  { forward: [1, 0, 0] as Vec3, right: [0, 0, -1] as Vec3, up: [0, -1, 0] as Vec3 },
  { forward: [-1, 0, 0] as Vec3, right: [0, 0, 1] as Vec3, up: [0, -1, 0] as Vec3 },
  { forward: [0, 1, 0] as Vec3, right: [1, 0, 0] as Vec3, up: [0, 0, 1] as Vec3 },
  { forward: [0, -1, 0] as Vec3, right: [1, 0, 0] as Vec3, up: [0, 0, -1] as Vec3 },
  { forward: [0, 0, 1] as Vec3, right: [1, 0, 0] as Vec3, up: [0, -1, 0] as Vec3 },
  { forward: [0, 0, -1] as Vec3, right: [-1, 0, 0] as Vec3, up: [0, -1, 0] as Vec3 },
] as const;

function environmentColor(direction: Vec3): Vec3 {
  const up = clamp(direction[1] * 0.5 + 0.5);
  const horizon = [0.025, 0.045, 0.08] as Vec3;
  const zenith = [0.004, 0.01, 0.035] as Vec3;
  const groundNear = [0.014, 0.015, 0.018] as Vec3;
  const groundFar = [0.004, 0.005, 0.008] as Vec3;

  const sky = mix(horizon, zenith, up ** 1.6);
  const ground = mix(groundNear, groundFar, clamp(-direction[1] * 1.2));
  let color = direction[1] > 0 ? sky : ground;

  const pinkSignDir = normalize([-0.68, 0.05, 0.73]);
  const cyanSignDir = normalize([0.72, -0.02, 0.48]);
  const greenSignDir = normalize([0.18, 0.18, -0.97]);
  const pinkGlow = Math.max(dot(direction, pinkSignDir), 0) ** 36;
  const cyanGlow = Math.max(dot(direction, cyanSignDir), 0) ** 32;
  const greenGlow = Math.max(dot(direction, greenSignDir), 0) ** 48;
  const hazeBand = Math.max(1 - Math.abs(direction[1] + 0.04) * 10, 0);

  color = add(color, mul([1.0, 0.06, 0.72], pinkGlow * 0.75));
  color = add(color, mul([0.0, 0.76, 1.0], cyanGlow * 0.7));
  color = add(color, mul([0.32, 1.0, 0.45], greenGlow * 0.45));
  color = add(color, mul([0.12, 0.04, 0.22], hazeBand * 0.16));

  return color.map((channel) => clamp(channel)) as Vec3;
}

export function createEnvironmentFaces() {
  return FACE_BASES.map(({ forward, right, up }) => {
    const data = new Uint8ClampedArray(ENVIRONMENT_SIZE * ENVIRONMENT_SIZE * 4);

    for (let y = 0; y < ENVIRONMENT_SIZE; y++) {
      for (let x = 0; x < ENVIRONMENT_SIZE; x++) {
        const u = ((x + 0.5) / ENVIRONMENT_SIZE) * 2 - 1;
        const v = ((y + 0.5) / ENVIRONMENT_SIZE) * 2 - 1;
        const direction = normalize(add(add(forward, mul(right, u)), mul(up, v)));
        const color = environmentColor(direction);
        const idx = (y * ENVIRONMENT_SIZE + x) * 4;

        data[idx] = Math.round(color[0] * 255);
        data[idx + 1] = Math.round(color[1] * 255);
        data[idx + 2] = Math.round(color[2] * 255);
        data[idx + 3] = 255;
      }
    }

    return new ImageData(data, ENVIRONMENT_SIZE, ENVIRONMENT_SIZE);
  });
}
