interface KnownTeardownRejection {
  /** The key of the example whose `onCleanup` causes the rejection (as in `exampleContent.ts`). */
  example: string;
  /** What the rejection says. */
  message: RegExp;
  /**
   * What the stack of the rejection has to look like: a `destroy()` call made from the `onCleanup`
   * of that very example. This keeps a rejection with the same message, but caused by anything
   * else, fatal.
   */
  createdBy: RegExp;
}

/**
 * TEMPORARY exception: unhandled rejections that the browser benchmark tolerates because they are
 * a known side effect of cleaning up one specific example, and cannot be avoided in the example.
 *
 * `game-of-life` reports GPU timings through `withPerformanceCallback`. The library reads the
 * timestamps with a fire-and-forget `querySet.read()` (`void readTimestamps(...)` in
 * `core/pipeline/timeable.ts`), and nothing handles the rejection of its `mapAsync`. The example's
 * `onCleanup` calls `root.destroy()`, which destroys the device the root owns. The browser then
 * rejects the pending `mapAsync`, with either of the two messages below (both are the same
 * teardown; "Device was lost" has been observed from another example's teardown, but has not been
 * observed from `game-of-life` itself).
 *
 * The exception should go away once the library ignores reads that were cancelled by the
 * destruction of the device. Other examples with teardown races are fixed in the examples
 * themselves (see their `disposed` flags), so the same message coming from them is a failure.
 */
const knownTeardownRejections: KnownTeardownRejection[] = [
  {
    example: 'simulation--game-of-life',
    message:
      /Buffer was unmapped before mapping was resolved|The Device was lost before mapping was resolved/,
    createdBy: /\.destroy\b[\s\S]*?\bonCleanup\b[^\n]*\/simulation\/game-of-life\//,
  },
];

/**
 * @param reason the reason of the unhandled rejection
 * @param cleanedExample the key of the example that was cleaned up most recently
 */
export function isKnownTeardownRejection(
  reason: unknown,
  cleanedExample: string | undefined,
): boolean {
  const { message, stack } = (reason ?? {}) as { message?: unknown; stack?: unknown };
  const text = String(message ?? reason);
  const trace = typeof stack === 'string' ? stack : '';

  return knownTeardownRejections.some(
    (known) =>
      known.example === cleanedExample && known.message.test(text) && known.createdBy.test(trace),
  );
}
