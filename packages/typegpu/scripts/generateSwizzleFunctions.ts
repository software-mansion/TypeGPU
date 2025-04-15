/**
 * Prints the swizzling getters to be manually added to the VecBase abstract class.
 */
printSwizzlingFor('xyzw');

/**
 * Yields combinations of letters from `components` of given `length`.
 *
 * @example
 * vectorComponentCombinations('xyz', 2)  // xx, xy, xz, yx, yy ...
 */
function* vectorComponentCombinations(
  components: string,
  length: number,
): Generator<string, undefined, undefined> {
  if (length > 1) {
    for (const str of vectorComponentCombinations(components, length - 1)) {
      for (const component of components) {
        yield str + component;
      }
    }
  } else {
    yield* components;
  }
}

function printSwizzlingFor(components: string) {
  const componentIndex: Record<string, number> = { x: 0, y: 1, z: 2, w: 3 };
  for (const count of [2, 3, 4] as const) {
    const vecClassName = `_Vec${count}`;
    for (const swizzle of vectorComponentCombinations(components, count)) {
      const implementation = `  get ${swizzle}() { return new this.${vecClassName}(${[
        ...swizzle,
      ]
        .map((s) => `this[${componentIndex[s]}]`)
        .join(', ')}); }`;
    }
  }
}
