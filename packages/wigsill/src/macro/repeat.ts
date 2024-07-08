export function repeat(
  code: string | ((idx: number, ...args: any[]) => string),
  count: number,
): string {
  if (typeof code === 'string') {
    return Array.from({ length: count }, () => code).join('\n');
  }

  return Array.from({ length: count }, (_, idx) => code(idx)).join('\n');
}
