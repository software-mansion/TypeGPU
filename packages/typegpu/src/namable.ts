/**
 * Can be assigned a name. Not to be confused with
 * being able to HAVE a name.
 */
export interface TgpuNamable {
  $name(label?: string | undefined): this;
}

export function isNamable(value: unknown): value is TgpuNamable {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    '$name' in value
  );
}
