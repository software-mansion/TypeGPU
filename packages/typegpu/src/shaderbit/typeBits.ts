// Decorated types don't exist on the level of type bits, they're a property of struct fields and function arguments instead,
// which simplifies their handling a lot in the type system.

export type TypeBit = 'abstractInt' | 'abstractFloat' | 'bool' | 'f32' | 'f16' | 'i32' | 'u32';

export function areTypesEqual(a: TypeBit, b: TypeBit): boolean {
  return a === b;
}

export function isNumericType(
  type: unknown,
): type is 'abstractInt' | 'abstractFloat' | 'f32' | 'f16' | 'i32' | 'u32' {
  return (
    type === 'abstractInt' ||
    type === 'abstractFloat' ||
    type === 'f32' ||
    type === 'f16' ||
    type === 'i32' ||
    type === 'u32'
  );
}
