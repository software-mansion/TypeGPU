// @ts-check

/**
 * @typedef {object} ProgressTracker
 * @prop {string} value
 * @prop {() => void} end
 */

/**
 * @template T
 * @param {string} initial
 * @param {(update: (val: string) => void) => Promise<T>} task
 * @returns {Promise<T>}
 */
export async function progress(initial, task) {
  process.stdout.write(initial);

  try {
    return await task((val) => {
      if (
        process.stdout.clearLine &&
        typeof process.stdout.clearLine === 'function'
      ) {
        process.stdout.clearLine(0);
      }
      process.stdout.cursorTo(0);
      process.stdout.write(val);
    });
  } finally {
    process.stdout.write('\n');
  }
}
