const N = 64;
const M = 64;

export const zs = Array.from({ length: N }, (_, i) => 2 ** i);
export const xs = Array.from({ length: M }, (_, i) => 2 ** i);
export const ys = zs.map((z) => xs.map((x) => x * z));
