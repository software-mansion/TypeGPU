const MAX_WORKGROUPS_PER_DIMENSION = 65535;

export function decomposeWorkgroups(total: number): [number, number, number] {
  if (total <= 0) {
    return [1, 1, 1];
  }

  const x = Math.min(total, MAX_WORKGROUPS_PER_DIMENSION);
  const remainingAfterX = Math.ceil(total / x);

  const y = Math.min(remainingAfterX, MAX_WORKGROUPS_PER_DIMENSION);
  const remainingAfterY = Math.ceil(remainingAfterX / y);

  const z = Math.min(remainingAfterY, MAX_WORKGROUPS_PER_DIMENSION);

  if (Math.ceil(total / (x * y * z)) > 1) {
    throw new Error(
      `Required workgroups (${total}) exceed device dispatch limits (${MAX_WORKGROUPS_PER_DIMENSION} per dimension)`,
    );
  }

  return [x, y, z];
}
