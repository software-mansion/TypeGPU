import { BufferReader, BufferWriter } from 'typed-binary';
import { describe, expect, it } from 'vitest';
import { mat4f, u32 } from 'wigsill';

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

describe('mat4f', () => {
  it('writes identity matrix properly', () => {
    const buffer = new ArrayBuffer(mat4f.size);

    const output = new BufferWriter(buffer);
    mat4f.write(
      output,
      [
        // column 0
        1, 0, 0, 0,
        // column 1
        0, 1, 0, 0,
        // column 2
        0, 0, 1, 0,
        // column 3
        0, 0, 0, 1,
      ],
    );

    const input = new BufferReader(buffer);

    expect(mat4f.read(input)).toEqual([
      // column 0
      1, 0, 0, 0,
      // column 1
      0, 1, 0, 0,
      // column 2
      0, 0, 1, 0,
      // column 3
      0, 0, 0, 1,
    ]);
  });
});
