import { quat } from 'wgpu-matrix';

/**
 * Converts a 4x4 rigid transformation matrix to a dual quaternion (8 floats).
 * Layout: [real.x, real.y, real.z, real.w, dual.x, dual.y, dual.z, dual.w]
 *
 * @param m - 4x4 column-major matrix (Float32Array of length 16)
 * @param rotDst - scratch Float32Array(4) for quaternion extraction (avoids allocation)
 * @param dst - destination buffer, written at `offset`
 * @param offset - byte offset into `dst` (in float indices)
 */
export const mat4ToDualQuat = (
  m: Float32Array,
  rotDst: Float32Array,
  dst: Float32Array,
  offset: number,
): void => {
  // Extract rotation quaternion q0 = (x, y, z, w)
  quat.fromMat(m, rotDst);
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
