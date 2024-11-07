export type Default<T, TDefault> = T extends undefined ? TDefault : T;

export type UnionToIntersection<U> =
  // biome-ignore lint/suspicious/noExplicitAny: <had to be done>
  (U extends any ? (x: U) => void : never) extends (x: infer I) => void
    ? I
    : never;
