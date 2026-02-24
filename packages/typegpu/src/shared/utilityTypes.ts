export type Default<T, TDefault> = unknown extends T ? TDefault
  : T extends undefined ? TDefault
  : T;

export type SwapNever<T, Replacement> = [T] extends [never] ? Replacement : T;

export type UnionToIntersection<U> =
  // oxlint-disable-next-line typescript/no-explicit-any <had to be done>
  (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I
    : never;

export type Prettify<T> =
  & {
    [K in keyof T]: T[K];
  }
  & {};

/**
 * Utility type that merges a partial type with defaults, where defaults are used
 * for properties not present in the partial type.
 */
export type WithDefaults<TPartial, TDefaults> =
  & Omit<TDefaults, keyof TPartial>
  & TPartial;

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
 * Removes properties from record type that equal `Prop`
 */
export type OmitPropsExact<T extends Record<string, unknown>, Prop> = Pick<
  T,
  {
    [Key in keyof T]: [T[Key], Prop] extends [Prop, T[Key]] ? never : Key;
  }[keyof T]
>;

export type NullableToOptional<T> =
  & {
    // Props where the value extends `null` -> make them optional and remove null from the type
    [K in keyof T as T[K] extends null ? K : never]?: T[K];
  }
  & {
    // All other props remain unchanged
    [K in keyof T as T[K] extends null ? never : K]: T[K];
  };

/**
 * The opposite of Readonly<T>
 */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Source: https://code.lol/post/programming/higher-kinded-types/
 */
export type Assume<T, U> = T extends U ? T : U;

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
