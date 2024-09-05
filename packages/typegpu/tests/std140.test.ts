import { BufferWriter } from 'typed-binary';
import { describe, expect, it } from 'vitest';
import { u32 } from '../src/data';

describe('u32', () => {
  it('does not realign when writing offset is correct', () => {
    const buffer = new ArrayBuffer(16);
    const output = new BufferWriter(buffer);
    u32.write(output, 123);

    expect(output.currentByteOffset).toEqual(4); // 4 bytes
  });

  it('realigns when writing offset is incorrect by 1', () => {
    const buffer = new ArrayBuffer(16);
    const output = new BufferWriter(buffer);
    output.writeByte(0); // adding 1 byte padding
    u32.write(output, 123); // should realign to the next 4 bytes

    expect(output.currentByteOffset).toEqual(8); // 8 bytes
  });

  it('realigns when writing offset is incorrect by 3', () => {
    const buffer = new ArrayBuffer(16);
    const output = new BufferWriter(buffer);
    output.writeByte(0); // adding 1 byte padding
    output.writeByte(0); // adding 1 byte padding
    output.writeByte(0); // adding 1 byte padding
    u32.write(output, 123); // should realign to the next 4 bytes

    expect(output.currentByteOffset).toEqual(8); // 8 bytes
  });

  it('realigns when writing offset is incorrect by 1', () => {
    const buffer = new ArrayBuffer(16);
    const output = new BufferWriter(buffer);
    output.writeByte(0); // adding 1 byte padding
    u32.write(output, 123); // should realign to the next 4 bytes

    expect(output.currentByteOffset).toEqual(8); // 8 bytes
  });
});
