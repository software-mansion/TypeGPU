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

export const lerp = (a: number[], b: number[], t: number): number[] =>
  a.map((v, i) => v + (b[i] - v) * t);
