export type Quat = [number, number, number, number];
export type Vec3 = [number, number, number];

export const quatFromAxisAngle = (axis: Vec3, angle: number): Quat => {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
};

export const quatMul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

export const slerp = (q0: Quat, q1: Quat, t: number): Quat => {
  let dot = q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3];
  const q1a: Quat = dot < 0 ? [-q1[0], -q1[1], -q1[2], -q1[3]] : [...q1];
  dot = Math.abs(dot);

  if (dot > 0.9995) {
    {
      const r: Quat = [
        q0[0] + t * (q1a[0] - q0[0]),
        q0[1] + t * (q1a[1] - q0[1]),
        q0[2] + t * (q1a[2] - q0[2]),
        q0[3] + t * (q1a[3] - q0[3]),
      ];
      const len = Math.hypot(...r);
      return [r[0] / len, r[1] / len, r[2] / len, r[3] / len];
    }
  }

  const theta0 = Math.acos(dot);
  const sinTheta0 = Math.sin(theta0);
  const theta = theta0 * t;
  const s0 = Math.cos(theta) - (dot * Math.sin(theta)) / sinTheta0;
  const s1 = Math.sin(theta) / sinTheta0;

  return [
    s0 * q0[0] + s1 * q1a[0],
    s0 * q0[1] + s1 * q1a[1],
    s0 * q0[2] + s1 * q1a[2],
    s0 * q0[3] + s1 * q1a[3],
  ];
};

export const lerp = <T extends number[]>(a: T, b: T, t: number): T =>
  a.map((v, i) => v + (b[i] - v) * t) as T;

/**
 * Converts a 4x4 rigid transformation matrix to a dual quaternion (8 floats).
 * Layout: [real.x, real.y, real.z, real.w, dual.x, dual.y, dual.z, dual.w]
 *
 * @param m - 4x4 column-major matrix (Float32Array of length 16)
 * @param quatFromMat - function to extract rotation quaternion (e.g. wgpu-matrix quat.fromMat)
 * @param rotDst - scratch Float32Array(4) for quaternion extraction (avoids allocation)
 * @param dst - destination buffer, written at `offset`
 * @param offset - byte offset into `dst` (in float indices)
 */
export const mat4ToDualQuat = (
  m: Float32Array,
  quatFromMat: (m: Float32Array, dst?: Float32Array) => Float32Array,
  rotDst: Float32Array,
  dst: Float32Array,
  offset: number,
): void => {
  // Extract rotation quaternion q0 = (x, y, z, w)
  quatFromMat(m, rotDst);
  const q0x = rotDst[0];
  const q0y = rotDst[1];
  const q0z = rotDst[2];
  const q0w = rotDst[3];

  // Extract translation
  const tx = m[12];
  const ty = m[13];
  const tz = m[14];

  // Dual part: qe = 0.5 * pure(t) * q0
  // Hamilton product of (tx, ty, tz, 0) * (q0x, q0y, q0z, q0w):
  dst[offset] = q0x;
  dst[offset + 1] = q0y;
  dst[offset + 2] = q0z;
  dst[offset + 3] = q0w;
  dst[offset + 4] = 0.5 * (tx * q0w + ty * q0z - tz * q0y);
  dst[offset + 5] = 0.5 * (-tx * q0z + ty * q0w + tz * q0x);
  dst[offset + 6] = 0.5 * (tx * q0y - ty * q0x + tz * q0w);
  dst[offset + 7] = 0.5 * (-tx * q0x - ty * q0y - tz * q0z);
};
