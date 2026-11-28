export async function progress<T>(
  initial: string,
  task: (update: (val: string) => void) => Promise<T>,
): Promise<T> {
  const ciMode =
    typeof process.stdout.clearLine !== 'function' || typeof process.stdout.cursorTo !== 'function';

  if (ciMode) {
    console.log(initial);
    return await task((val) => {
      console.log(val);
    });
  }

  process.stdout.write(initial);

  try {
    return await task((val) => {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(val);
    });
  } finally {
    process.stdout.write('\n');
  }
}
