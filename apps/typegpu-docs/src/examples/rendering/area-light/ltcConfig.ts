let canFilter = false;

export function ltcFiltering(enabled?: boolean) {
  if (enabled !== undefined) {
    canFilter = enabled;
  }
  return canFilter;
}
