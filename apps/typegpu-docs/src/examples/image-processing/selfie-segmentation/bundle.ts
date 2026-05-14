import bin, { BufferReader, type Parsed } from 'typed-binary';

const SSG1_MAGIC = 'SSG1';
const SSG1_VERSION = 1;
const HEADER_BYTES = 40;
const DISPATCH_RECORD_BYTES = 88;

export const OpKind = {
  Conv: 0,
  DwConv: 1,
  AvgPool: 2,
  Resize2x: 3,
  Add: 4,
  Mul: 5,
  Head: 6,
} as const;
export type OpKind = (typeof OpKind)[keyof typeof OpKind];

export const Activation = {
  None: 0,
  Relu: 1,
  HardSwish: 2,
  Sigmoid: 3,
} as const;
export type Activation = (typeof Activation)[keyof typeof Activation];

export const BroadcastFlag = { H: 1, W: 2, C: 4 } as const;

export type Size2 = readonly [width: number, height: number];
export type Shape3 = readonly [width: number, height: number, channels: number];
export type DispatchSlots = readonly [srcA: number, srcB: number, dst: number];
export type ByteRange = readonly [offset: number, length: number];

const HeaderSchema = bin.object({
  magic: bin.chars(4),
  version: bin.u32,
  inputSize: bin.tupleOf([bin.u32, bin.u32]),
  outputSize: bin.tupleOf([bin.u32, bin.u32]),
  slotCount: bin.u32,
  dispatchCount: bin.u32,
  weightsOffset: bin.u32,
  weightsLength: bin.u32,
});

const DispatchRecordSchema = bin.object({
  opKind: bin.i32,
  slots: bin.tupleOf([bin.i32, bin.i32, bin.i32]),
  input: bin.tupleOf([bin.u32, bin.u32, bin.u32]),
  output: bin.tupleOf([bin.u32, bin.u32, bin.u32]),
  kernel: bin.tupleOf([bin.u32, bin.u32]),
  stride: bin.tupleOf([bin.u32, bin.u32]),
  pad: bin.tupleOf([bin.u32, bin.u32]),
  weights: bin.tupleOf([bin.i32, bin.u32]),
  bias: bin.tupleOf([bin.i32, bin.u32]),
  activation: bin.u32,
  flags: bin.u32,
});

type ParsedDispatchRecord = Parsed<typeof DispatchRecordSchema>;

export interface DispatchRecord {
  opKind: OpKind;
  slots: DispatchSlots;
  input: Shape3;
  output: Shape3;
  kernel: Size2;
  stride: Size2;
  pad: Size2;
  weights: ByteRange;
  bias: ByteRange;
  activation: Activation;
  flags: number;
}

export interface SegmenterPlan {
  inputSize: Size2;
  outputSize: Size2;
  slotSizesVec4: number[];
  weights: ArrayBuffer;
  dispatches: DispatchRecord[];
}

export async function loadSegmenterPlan(url: string): Promise<SegmenterPlan> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return parseSegmenterPlan(await response.arrayBuffer());
}

export function parseSegmenterPlan(buffer: ArrayBuffer): SegmenterPlan {
  if (buffer.byteLength < HEADER_BYTES) {
    throw new Error('SSG1 bundle too short');
  }
  const reader = new BufferReader(buffer, { endianness: 'little' });
  const header = HeaderSchema.read(reader);
  const { magic, version, slotCount, dispatchCount, weightsOffset, weightsLength } = header;
  if (magic !== SSG1_MAGIC || version !== SSG1_VERSION) {
    throw new Error(`Unsupported bundle magic=${magic} version=${version}`);
  }
  const slotTableOffset = HEADER_BYTES;
  const dispatchTableOffset = slotTableOffset + slotCount * 4;
  if (weightsOffset !== dispatchTableOffset + dispatchCount * DISPATCH_RECORD_BYTES) {
    throw new Error('SSG1 weights offset mismatch');
  }
  const slotSizesVec4 = Array.from(bin.u32Array(slotCount).read(reader));
  const dispatches = bin
    .arrayOf(DispatchRecordSchema, dispatchCount)
    .read(reader)
    .map(toDispatchRecord);
  return {
    inputSize: header.inputSize,
    outputSize: header.outputSize,
    slotSizesVec4,
    weights: buffer.slice(weightsOffset, weightsOffset + weightsLength),
    dispatches,
  };
}

function toDispatchRecord(record: ParsedDispatchRecord): DispatchRecord {
  return {
    ...record,
    opKind: record.opKind as OpKind,
    activation: record.activation as Activation,
  };
}
