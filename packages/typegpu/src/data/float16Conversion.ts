import type { ISerialInput } from 'typed-binary';
import type { ISerialOutput } from 'typed-binary';
import { fromHalfBits, toHalfBits } from './numeric.ts';

export function writeFloat16(output: ISerialOutput, value: number): void {
  output.writeUint16(toHalfBits(value));
}

export function readFloat16(input: ISerialInput): number {
  return fromHalfBits(input.readUint16());
}
