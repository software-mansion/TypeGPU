export type Default<T, TDefault> = unknown extends T
  ? TDefault
  : T extends undefined
    ? TDefault
    : T;

export type UnionToIntersection<U> =
  // biome-ignore lint/suspicious/noExplicitAny: <had to be done>
  (U extends any ? (x: U) => void : never) extends (x: infer I) => void
    ? I
    : never;

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/**
 * Removes properties from record type that extend `Prop`
 */
export type OmitProps<T extends Record<string, unknown>, Prop> = Pick<
  T,
  {
    [Key in keyof T]: T[Key] extends Prop ? never : Key;
  }[keyof T]
>;

/**
 * The opposite of Readonly<T>
 */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Any typed array
 */
export type TypedArray =
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array;

export function assertExhaustive(x: never, location: string): never {
  throw new Error(`Failed to handle ${x} at ${location}`);
}
