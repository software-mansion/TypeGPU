// Minimal ONNX schema subset we parse (proto3 numbers in comments)

export enum TensorDataType {
  UNDEFINED = 0,
  FLOAT = 1,
  UINT8 = 2,
  INT8 = 3,
  UINT16 = 4,
  INT16 = 5,
  INT32 = 6,
  INT64 = 7,
  STRING = 8,
  BOOL = 9,
  FLOAT16 = 10,
  DOUBLE = 11,
  UINT32 = 12,
  UINT64 = 13,
  COMPLEX64 = 14,
  COMPLEX128 = 15,
  BFLOAT16 = 16,
  // newer types omitted for brevity
}

export enum WireType {
  Varint = 0,
  Bit64 = 1,
  LengthDelimited = 2,
  // 3,4 (start/end group) unused in ONNX proto3
  Bit32 = 5,
}

export type TypedArray =
  | Float32Array
  | Float64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | BigInt64Array
  | BigUint64Array;

export interface Tensor {
  name: string;
  dims: (number | string)[]; // symbolic dims become strings
  dataType: TensorDataType;
  rawData: Uint8Array | null; // raw_data field if present
  data?: TypedArray | bigint[] | string[] | number[]; // decoded
  doc?: string;
  elementCount: number;
}

export interface ValueInfo {
  name: string; // (1)
  elemType?: TensorDataType;
  shape?: (number | string)[];
  doc?: string;
}

export interface NodeAttribute {
  name: string;
  type: string; // simplified
  // value kept raw (number | string | Tensor | number[] ... ) depending on attr type
  value: unknown;
}

export interface Node {
  opType: string; // (4)
  name?: string; // (3)
  domain?: string; // (5)
  inputs: string[]; // (1)
  outputs: string[]; // (2)
  attributes: NodeAttribute[]; // (6)
  doc?: string; // (7)
}

export interface OnnxModel {
  irVersion?: bigint;
  opsetImports: { domain: string; version: bigint }[];
  producerName?: string;
  producerVersion?: string;
  domain?: string;
  modelVersion?: bigint;
  docString?: string;
  graph: Graph;
  tensorMap: Map<string, Tensor>; // convenient map of initializers
}

export interface Graph {
  name?: string; // (2)
  doc?: string; // (4)
  nodes: Node[]; // (1)
  initializers: Tensor[]; // (5)
  inputs: ValueInfo[]; // (9)
  outputs: ValueInfo[]; // (10)
  valueInfo: ValueInfo[]; // (11)
}

export interface DecodedModel {
  model: OnnxModel;
  buffer: Uint8Array; // original buffer
}

export interface OnnxLoadOptions {
  decodeData?: boolean; // default true – decode numeric buffers into typed arrays
  keepRawData?: boolean; // default true
}

export const defaultLoadOptions: Required<OnnxLoadOptions> = {
  decodeData: true,
  keepRawData: true,
};
