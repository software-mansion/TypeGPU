/**
 * Prints the swizzling getters to be manually added to the VecBase abstract class.
 */
printSwizzlingFor({ x: 0, y: 1, z: 2, w: 3 });
printSwizzlingFor({ r: 0, g: 1, b: 2, a: 3 });

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

function printSwizzlingFor(components: Record<string, number>) {
  for (const count of [2, 3, 4] as const) {
    const vecClassName = `_Vec${count}`;
    for (
      const swizzle of vectorComponentCombinations(
        Object.keys(components).join(''),
        count,
      )
    ) {
      const implementation =
        `  get ${swizzle}() { return new this.${vecClassName}(${
          swizzle.split('')
            .map((s) => `this[${components[s]}]`)
            .join(', ')
        }); }`;
      console.log(implementation);
    }
  }
}
