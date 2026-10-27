import type { ByteCursor } from 'typed-binary';

/**
 * @param cursor the cursor to align
 * @param baseAlignment must be power of 2
 */
function alignIO(cursor: ByteCursor, baseAlignment: number) {
  const bitMask = baseAlignment - 1;
  cursor.offset += (baseAlignment - (cursor.offset & bitMask)) & bitMask;
}

export default alignIO;
