import type { IMeasurer, ISerialInput, ISerialOutput } from 'typed-binary';

/**
 * @param io the IO to align
 * @param baseAlignment must be power of 2
 */
function alignIO(io: ISerialInput | ISerialOutput | IMeasurer, baseAlignment: number) {
  const currentPos = 'size' in io ? io.size : io.currentByteOffset;

  const bitMask = baseAlignment - 1;
  const offset = currentPos & bitMask;

  if ('skipBytes' in io) {
    io.skipBytes((baseAlignment - offset) & bitMask);
  } else {
    io.add((baseAlignment - offset) & bitMask);
  }
}

export default alignIO;
