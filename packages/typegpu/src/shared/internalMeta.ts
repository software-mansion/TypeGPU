export const $internal = Symbol('internal');
export type $internal = typeof $internal;

export const TypeCatalog = {
  AbstractInt: 0,
  AbstractFloat: 1,
  Bool: 2,
  F32: 3,
  F16: 4,
  I32: 5,
  U32: 6,
  Vec2f: 7,
  Vec2h: 8,
  Vec2i: 9,
  Vec2u: 10,
  Vec3f: 11,
  Vec3h: 12,
  Vec3i: 13,
  Vec3u: 14,
  Vec4f: 15,
  Vec4h: 16,
  Vec4i: 17,
  Vec4u: 18,
  Mat2x2f: 19,
  Mat3x3f: 20,
  Mat4x4f: 21,
  Array: 22,
  Struct: 23,
  Ptr: 24,
  Atomic: 25,
  Void: 26,
  Unknown: 27,
  Disarray: 28,
  Unstruct: 29,

  // Attribute schemas
  Align: 100,
  Size: 101,
  Location: 102,
  Interpolate: 103,
  Builtin: 104,
  Decorated: 105,
  LooseDecorated: 106,

  v2f: 200,
  v2h: 201,
  v2i: 202,
  v2u: 203,
  v3f: 204,
  v3h: 205,
  v3i: 206,
  v3u: 207,
  v4f: 208,
  v4h: 209,
  v4i: 210,
  v4u: 211,
  m2x2f: 300,
  m3x3f: 301,
  m4x4f: 302,
  atomicU32: 400,
  atomicI32: 401,

  // TypeGPU resources
  Buffer: 1000,
  BufferUsage: 1000,
} as const;

export type TypeCatalog = typeof TypeCatalog;
export type TypeID = (typeof TypeCatalog)[keyof typeof TypeCatalog];
