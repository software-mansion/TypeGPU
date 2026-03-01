/**
 * Yields values in the sequence 0,1,2..∞ except for the ones in the `excluded` set.
 */
export function* naturalsExcept(excluded: Set<number>): Generator<number, number, unknown> {
  let next = 0;

  while (true) {
    if (!excluded.has(next)) {
      yield next;
    }

    next++;
  }
}
