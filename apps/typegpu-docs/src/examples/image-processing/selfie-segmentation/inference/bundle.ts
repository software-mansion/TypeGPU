import bin, { BufferReader, type Parsed } from 'typed-binary';

const SSG1_MAGIC = 'SSG1';

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
export type Vec4Offset = number;

const vec2u = bin.tupleOf([bin.u32, bin.u32]);
const vec3i = bin.tupleOf([bin.i32, bin.i32, bin.i32]);
const vec3u = bin.tupleOf([bin.u32, bin.u32, bin.u32]);

const HeaderSchema = bin.object({
  magic: bin.chars(4),
  version: bin.u32,
  inputSize: vec2u,
  outputSize: vec2u,
  slotCount: bin.u32,
  dispatchCount: bin.u32,
  weightsOffset: bin.u32,
  weightsLength: bin.u32,
  bytesPerVec4: bin.u32,
});

const DispatchRecordSchema = bin.object({
  opKind: bin.i32,
  slots: vec3i,
  input: vec3u,
  output: vec3u,
  kernel: vec2u,
  stride: vec2u,
  pad: vec2u,
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
  weights: Vec4Offset;
  bias: Vec4Offset;
  activation: Activation;
  flags: number;
}

export interface SegmenterPlan {
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
  const reader = new BufferReader(buffer, { endianness: 'little' });
  const header = HeaderSchema.read(reader);
  const { magic, slotCount, dispatchCount, weightsOffset, weightsLength, bytesPerVec4 } = header;
  if (magic !== SSG1_MAGIC) {
    throw new Error(`Unsupported bundle magic=${magic}`);
  }
  const slotSizesVec4 = Array.from(bin.u32Array(slotCount).read(reader));
  const dispatches = bin
    .arrayOf(DispatchRecordSchema, dispatchCount)
    .read(reader)
    .map((record) => toDispatchRecord(record, bytesPerVec4));
  return {
    slotSizesVec4,
    weights: buffer.slice(weightsOffset, weightsOffset + weightsLength),
    dispatches,
  };
}

function toDispatchRecord(record: ParsedDispatchRecord, bytesPerVec4: number): DispatchRecord {
  return {
    ...record,
    opKind: record.opKind as OpKind,
    weights: toVec4Offset(record.weights, bytesPerVec4),
    bias: toVec4Offset(record.bias, bytesPerVec4),
    activation: record.activation as Activation,
  };
}

function toVec4Offset(
  range: readonly [offset: number, length: number],
  bytesPerVec4: number,
): Vec4Offset {
  const [offset] = range;
  return offset < 0 ? offset : offset / bytesPerVec4;
}
