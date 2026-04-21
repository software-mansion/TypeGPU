import type { Snippet } from './snippet';

export function isAbstract(value: unknown): value is 'abstractFloat' | 'abstractInt' {
  return value === 'abstractFloat' || value === 'abstractInt';
}

export function isConcrete(value: unknown): boolean {
  return !isAbstract(value);
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

export function isSnippetNumeric(snippet: Snippet) {
  return isNumericType(snippet.dataType);
}
