import { ProtobuffReader } from '../../protobuf.ts';
import {
  type OnnxLoadOptions,
  type Tensor,
  TensorDataType,
  WireType,
} from '../../types.ts';
import {
  bfloat16ToFloat32,
  elementSize,
  float16ToFloat32,
} from '../convert.ts';
import { readDoubleFromFixed64, readFloatFromVarint } from '../io.ts';
import { decodeRawData } from './rawData.ts';

export function decodeTensor(
  bytes: Uint8Array,
  options: Required<OnnxLoadOptions>,
): Tensor {
  const r = new ProtobuffReader(bytes);
  const t: Tensor = {
    name: '',
    dims: [],
    dataType: TensorDataType.UNDEFINED,
    rawData: null,
    elementCount: 0,
  };
  let floatData: number[] | undefined;
  let int32Data: number[] | undefined;
  let int64Data: bigint[] | undefined;
  let doubleData: number[] | undefined;
  let uint64Data: bigint[] | undefined;
  let float16Data: Uint16Array | undefined;
  let bfloat16Data: Uint16Array | undefined;
  while (!r.eof()) {
    const tag = r.tag();
    if (!tag) break;
    switch (tag.fieldNumber) {
      case 1:
        t.dims.push(Number(r.varintBig()));
        break;
      case 2:
        t.dataType = r.varint() as TensorDataType;
        break;
      case 4: { // float_data repeated
        (floatData ??= []).push(readFloatFromVarint(r));
        break;
      }
      case 5: {
        (int32Data ??= []).push(r.varint());
        break;
      }
      case 7: {
        (int64Data ??= []).push(r.varintBig());
        break;
      }
      case 8:
        t.name = r.string();
        break;
      case 9:
        t.rawData = r.bytes();
        break;
      case 11:
        t.doc = r.string();
        break;
      case 13: {
        (doubleData ??= []).push(readDoubleFromFixed64(r));
        break;
      }
      case 14: {
        (uint64Data ??= []).push(r.varintBig());
        break;
      }
      default:
        r.skip(tag.wireType as WireType);
    }
  }
  t.elementCount = t.dims.reduce<number>(
    (a, b) => (typeof b === 'number' ? a * (b || 1) : a),
    1,
  );

  if (options.decodeData) {
    if (t.rawData && elementSize(t.dataType)) {
      t.data = decodeRawData(t.rawData, t.dataType, t.elementCount);
    } else {
      // fallback to typed fields
      switch (t.dataType) {
        case TensorDataType.FLOAT:
          t.data = Float32Array.from(floatData ?? []);
          break;
        case TensorDataType.INT32:
          t.data = Int32Array.from(int32Data ?? []);
          break;
        case TensorDataType.INT64:
          t.data = (int64Data ?? []).map((x) => x);
          break;
        case TensorDataType.DOUBLE:
          t.data = Float64Array.from(doubleData ?? []);
          break;
        case TensorDataType.UINT64:
          t.data = (uint64Data ?? []).map((x) => x);
          break;
        case TensorDataType.FLOAT16:
          if (float16Data) t.data = float16ToFloat32(float16Data);
          break;
        case TensorDataType.BFLOAT16:
          if (bfloat16Data) t.data = bfloat16ToFloat32(bfloat16Data);
          break;
        default:
          break;
      }
    }
  }
  if (!options.keepRawData) t.rawData = null;
  return t;
}
