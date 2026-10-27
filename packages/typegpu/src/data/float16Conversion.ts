import { type ByteCursor, u16 } from 'typed-binary';
import { fromHalfBits, toHalfBits } from './numeric.ts';

export function writeFloat16(output: ByteCursor, value: number): void {
  u16.write(output, toHalfBits(value));
}

export function readFloat16(input: ByteCursor): number {
  return fromHalfBits(u16.read(input));
}
