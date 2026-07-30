import type { ISerialInput } from 'typed-binary';
import type { ISerialOutput } from 'typed-binary';

export function writeFloat16(output: ISerialOutput, value: number): void {
  output.writeUint16(encodeFloat16AsUint16(value));
}

export function readFloat16(input: ISerialInput): number {
  return decodeUint16AsFloat16(input.readUint16());
}

export function encodeFloat16AsUint16(value: number): number {
  // conversion according to IEEE 754 binary16 format
  if (value === 0) return 0;
  if (Number.isNaN(value)) return 0x7e00;
  if (!Number.isFinite(value)) return value > 0 ? 0x7c00 : 0xfc00;

  const sign = value < 0 ? 1 : 0;
  const absValue = Math.abs(value);
  const exponent = Math.floor(Math.log2(absValue));
  const mantissa = absValue / 2 ** exponent - 1;
  const biasedExponent = exponent + 15;
  const mantissaBits = Math.floor(mantissa * 1024);
  return (sign << 15) | (biasedExponent << 10) | mantissaBits;
}

export function decodeUint16AsFloat16(uint16Encoding: number): number {
  const sign = (uint16Encoding & 0x8000) >> 15;
  const exponent = (uint16Encoding & 0x7c00) >> 10;
  const mantissa = uint16Encoding & 0x3ff;
  if (exponent === 0) {
    return sign === 0 ? mantissa / 1024 : -mantissa / 1024;
  }
  if (exponent === 31) {
    return mantissa === 0
      ? sign === 0
        ? Number.POSITIVE_INFINITY
        : Number.NEGATIVE_INFINITY
      : Number.NaN;
  }
  return (sign === 0 ? 1 : -1) * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}
