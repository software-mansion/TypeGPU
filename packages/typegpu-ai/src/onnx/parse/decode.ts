import { ProtobuffReader } from '../protobuf.ts';
import {
  type DecodedModel,
  type Graph,
  type Node,
  type NodeAttribute,
  type OnnxLoadOptions,
  type OnnxModel,
  type Tensor,
  TensorDataType,
  type ValueInfo,
  WireType,
} from '../types.ts';
import { bfloat16ToFloat32, elementSize, float16ToFloat32 } from './convert.ts';
import { readDoubleFromFixed64, readFloatFromVarint } from './io.ts';

export function decodeModel(
  buffer: Uint8Array,
  options: Required<OnnxLoadOptions>,
): DecodedModel {
  const r = new ProtobuffReader(buffer);
  const model: OnnxModel = {
    opsetImports: [],
    graph: {
      nodes: [],
      initializers: [],
      inputs: [],
      outputs: [],
      valueInfo: [],
    },
    tensorMap: new Map<string, Tensor>(),
  };

  while (!r.eof()) {
    const tag = r.tag();
    if (!tag) break;
    switch (tag.fieldNumber) {
      case 1:
        model.irVersion = r.varintBig();
        break; // ir_version
      case 2:
        model.producerName = r.string();
        break;
      case 3:
        model.producerVersion = r.string();
        break;
      case 4:
        model.domain = r.string();
        break;
      case 5:
        model.modelVersion = r.varintBig();
        break;
      case 6:
        model.docString = r.string();
        break;
      case 7: { // graph (GraphProto)
        const bytes = r.bytes();
        model.graph = decodeGraph(bytes, options, model.tensorMap);
        break;
      }
      case 8: { // opset_import repeated OperatorSetIdProto (domain=1 version=2)
        const b = r.bytes();
        const rr = new ProtobuffReader(b);
        let domain = '';
        let version = 0n;
        while (!rr.eof()) {
          const t = rr.tag();
          if (!t) break;
          if (t.fieldNumber === 1) domain = rr.string();
          else if (t.fieldNumber === 2) version = rr.varintBig();
          else rr.skip(t.wireType as WireType);
        }
        model.opsetImports.push({ domain, version });
        break;
      }
      default:
        r.skip(tag.wireType as WireType);
    }
  }

  return { model, buffer };
}

function decodeGraph(
  bytes: Uint8Array,
  options: Required<OnnxLoadOptions>,
  tensorMap: Map<string, Tensor>,
): Graph {
  const r = new ProtobuffReader(bytes);
  const g: Graph = {
    nodes: [],
    initializers: [],
    inputs: [],
    outputs: [],
    valueInfo: [],
  };
  while (!r.eof()) {
    const tag = r.tag();
    if (!tag) break;
    switch (tag.fieldNumber) {
      case 1:
        g.nodes.push(decodeNode(r.bytes(), options));
        break;
      case 2:
        g.name = r.string();
        break;
      // ONNX GraphProto field numbers (as of opset 19+):
      // 5: initializer, 10: doc_string, 11: input, 12: output, 13: value_info
      case 5: {
        const t = decodeTensor(r.bytes(), options);
        g.initializers.push(t);
        tensorMap.set(t.name, t);
        break;
      }
      case 10:
        g.doc = r.string();
        break;
      case 11:
        g.inputs.push(decodeValueInfo(r.bytes(), options));
        break;
      case 12:
        g.outputs.push(decodeValueInfo(r.bytes(), options));
        break;
      case 13:
        g.valueInfo.push(decodeValueInfo(r.bytes(), options));
        break;
      default:
        r.skip(tag.wireType as WireType);
    }
  }
  return g;
}

function decodeNode(
  bytes: Uint8Array,
  options: Required<OnnxLoadOptions>,
): Node {
  const r = new ProtobuffReader(bytes);
  const node: Node = {
    opType: '',
    inputs: [],
    outputs: [],
    attributes: [],
  } as Node;
  while (!r.eof()) {
    const tag = r.tag();
    if (!tag) break;
    switch (tag.fieldNumber) {
      case 1:
        node.inputs.push(r.string());
        break;
      case 2:
        node.outputs.push(r.string());
        break;
      case 3:
        node.name = r.string();
        break;
      case 4:
        node.opType = r.string();
        break;
      case 5:
        node.attributes.push(decodeAttribute(r.bytes(), options));
        break;
      case 6:
        node.doc = r.string();
        break;
      case 7:
        node.domain = r.string();
        break;
      default:
        r.skip(tag.wireType as WireType);
    }
  }
  return node;
}

const ATTRIBUTE_TYPE_NAMES: Record<number, string> = {
  0: 'UNDEFINED',
  1: 'FLOAT',
  2: 'INT',
  3: 'STRING',
  4: 'TENSOR',
  5: 'GRAPH',
  6: 'FLOATS',
  7: 'INTS',
  8: 'STRINGS',
  9: 'TENSORS',
  10: 'GRAPHS',
  11: 'SPARSE_TENSOR',
  12: 'SPARSE_TENSORS',
  13: 'TYPE_PROTO',
  14: 'TYPE_PROTOS',
};

const float32Scratch = new ArrayBuffer(4);
const float32View = new DataView(float32Scratch);

function bitsToFloat32(bits: number): number {
  float32View.setUint32(0, bits, true);
  return float32View.getFloat32(0, true);
}

function normalizeInt64(value: bigint): number | bigint {
  const asNumber = Number(value);
  return BigInt(asNumber) === value ? asNumber : value;
}

function readFloat32Values(
  r: ProtobuffReader,
  wireType: WireType,
): number[] {
  if (wireType === WireType.LengthDelimited) {
    const data = r.bytes();
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const result: number[] = [];
    for (let offset = 0; offset + 4 <= data.byteLength; offset += 4) {
      result.push(dv.getFloat32(offset, true));
    }
    return result;
  }
  if (wireType === WireType.Bit32) {
    return [bitsToFloat32(r.fixed32())];
  }
  return [];
}

function readInt64Values(
  r: ProtobuffReader,
  wireType: WireType,
): (number | bigint)[] {
  if (wireType === WireType.LengthDelimited) {
    const data = r.bytes();
    const rr = new ProtobuffReader(data);
    const values: (number | bigint)[] = [];
    while (!rr.eof()) {
      values.push(normalizeInt64(rr.varintBig()));
    }
    return values;
  }
  if (wireType === WireType.Varint) {
    return [normalizeInt64(r.varintBig())];
  }
  return [];
}

function decodeAttribute(
  bytes: Uint8Array,
  options: Required<OnnxLoadOptions>,
): NodeAttribute {
  const r = new ProtobuffReader(bytes);
  const attr: NodeAttribute = {
    name: '',
    type: 'UNDEFINED',
    value: undefined,
  };

  let doc: string | undefined;
  let refAttrName: string | undefined;
  let typeId: number | undefined;

  let floatScalar: number | undefined;
  let intScalar: number | bigint | undefined;
  let stringScalar: string | undefined;
  let tensorScalar: Tensor | undefined;
  let graphScalar: Graph | undefined;
  let sparseTensorScalar: Uint8Array | undefined;
  let typeProtoScalar: Uint8Array | undefined;

  const floatList: number[] = [];
  const intList: (number | bigint)[] = [];
  const stringList: string[] = [];
  const tensorList: Tensor[] = [];
  const graphList: Graph[] = [];
  const sparseTensorList: Uint8Array[] = [];
  const typeProtoList: Uint8Array[] = [];

  while (!r.eof()) {
    const tag = r.tag();
    if (!tag) break;
    switch (tag.fieldNumber) {
      case 1:
        attr.name = r.string();
        break;
      case 2:
        floatScalar = bitsToFloat32(r.fixed32());
        break;
      case 3:
        intScalar = normalizeInt64(r.varintBig());
        break;
      case 4:
        stringScalar = r.string();
        break;
      case 5:
        tensorScalar = decodeTensor(r.bytes(), options);
        break;
      case 6:
        graphScalar = decodeGraph(r.bytes(), options, new Map());
        break;
      case 7:
        floatList.push(...readFloat32Values(r, tag.wireType as WireType));
        break;
      case 8:
        intList.push(...readInt64Values(r, tag.wireType as WireType));
        break;
      case 9:
        stringList.push(r.string());
        break;
      case 10:
        tensorList.push(decodeTensor(r.bytes(), options));
        break;
      case 11:
        graphList.push(decodeGraph(r.bytes(), options, new Map()));
        break;
      case 13:
        doc = r.string();
        break;
      case 14:
        typeProtoScalar = r.bytes();
        break;
      case 15:
        typeProtoList.push(r.bytes());
        break;
      case 20:
        typeId = r.varint();
        break;
      case 21:
        refAttrName = r.string();
        break;
      case 22:
        sparseTensorScalar = r.bytes();
        break;
      case 23:
        sparseTensorList.push(r.bytes());
        break;
      default:
        r.skip(tag.wireType as WireType);
    }
  }

  if (typeId !== undefined) {
    attr.type = ATTRIBUTE_TYPE_NAMES[typeId] ?? attr.type;
  }

  if (floatList.length) {
    attr.type = attr.type === 'UNDEFINED' ? 'FLOATS' : attr.type;
    attr.value = floatList;
  } else if (intList.length) {
    attr.type = attr.type === 'UNDEFINED' ? 'INTS' : attr.type;
    attr.value = intList;
  } else if (stringList.length) {
    attr.type = attr.type === 'UNDEFINED' ? 'STRINGS' : attr.type;
    attr.value = stringList;
  } else if (tensorList.length) {
    attr.type = attr.type === 'UNDEFINED' ? 'TENSORS' : attr.type;
    attr.value = tensorList;
  } else if (graphList.length) {
    attr.type = attr.type === 'UNDEFINED' ? 'GRAPHS' : attr.type;
    attr.value = graphList;
  } else if (sparseTensorList.length) {
    attr.type = attr.type === 'UNDEFINED' ? 'SPARSE_TENSORS' : attr.type;
    attr.value = sparseTensorList;
  } else if (typeProtoList.length) {
    attr.type = attr.type === 'UNDEFINED' ? 'TYPE_PROTOS' : attr.type;
    attr.value = typeProtoList;
  } else if (floatScalar !== undefined) {
    attr.type = attr.type === 'UNDEFINED' ? 'FLOAT' : attr.type;
    attr.value = floatScalar;
  } else if (intScalar !== undefined) {
    attr.type = attr.type === 'UNDEFINED' ? 'INT' : attr.type;
    attr.value = intScalar;
  } else if (stringScalar !== undefined) {
    attr.type = attr.type === 'UNDEFINED' ? 'STRING' : attr.type;
    attr.value = stringScalar;
  } else if (tensorScalar) {
    attr.type = attr.type === 'UNDEFINED' ? 'TENSOR' : attr.type;
    attr.value = tensorScalar;
  } else if (graphScalar) {
    attr.type = attr.type === 'UNDEFINED' ? 'GRAPH' : attr.type;
    attr.value = graphScalar;
  } else if (sparseTensorScalar) {
    attr.type = attr.type === 'UNDEFINED' ? 'SPARSE_TENSOR' : attr.type;
    attr.value = sparseTensorScalar;
  } else if (typeProtoScalar) {
    attr.type = attr.type === 'UNDEFINED' ? 'TYPE_PROTO' : attr.type;
    attr.value = typeProtoScalar;
  }

  if (doc) attr.doc = doc;
  if (refAttrName) attr.refAttrName = refAttrName;

  return attr;
}

function decodeValueInfo(
  bytes: Uint8Array,
  _options: Required<OnnxLoadOptions>,
): ValueInfo {
  const r = new ProtobuffReader(bytes);
  const v: ValueInfo = { name: '' };
  while (!r.eof()) {
    const tag = r.tag();
    if (!tag) break;
    switch (tag.fieldNumber) {
      case 1:
        v.name = r.string();
        break;
      case 2: { // type (TypeProto)
        const b = r.bytes();
        const rt = new ProtobuffReader(b);
        while (!rt.eof()) {
          const t = rt.tag();
          if (!t) break;
          if (t.fieldNumber === 1) { // tensor_type
            const bt = rt.bytes();
            const rtt = new ProtobuffReader(bt);
            let elemType: TensorDataType | undefined;
            const shape: (number | string)[] = [];
            while (!rtt.eof()) {
              const tt = rtt.tag();
              if (!tt) break;
              if (tt.fieldNumber === 1) elemType = rtt.varint();
              else if (tt.fieldNumber === 2) { // shape (TensorShapeProto)
                const bsh = rtt.bytes();
                const rsh = new ProtobuffReader(bsh);
                while (!rsh.eof()) {
                  const dtag = rsh.tag();
                  if (!dtag) break;
                  if (dtag.fieldNumber === 1) { // dim repeated
                    const bdim = rsh.bytes();
                    const rd = new ProtobuffReader(bdim);
                    let dim: number | string | undefined;
                    while (!rd.eof()) {
                      const dt = rd.tag();
                      if (!dt) break;
                      if (dt.fieldNumber === 1) dim = Number(rd.varintBig()); // dim_value
                      else if (dt.fieldNumber === 2) dim = rd.string(); // dim_param
                      else rd.skip(dt.wireType as WireType);
                    }
                    if (dim !== undefined) shape.push(dim);
                  } else rsh.skip(dtag.wireType as WireType);
                }
              } else rtt.skip(tt.wireType as WireType);
            }
            if (elemType !== undefined) v.elemType = elemType;
            v.shape = shape;
          } else rt.skip(t.wireType as WireType);
        }
        break;
      }
      case 3:
        v.doc = r.string();
        break;
      default:
        r.skip(tag.wireType as WireType);
    }
  }
  return v;
}

function decodeTensor(
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

function decodeRawData(
  raw: Uint8Array,
  dt: TensorDataType,
  elementCount: number,
): any {
  const off = raw.byteOffset;
  const buf = raw.buffer;
  const len = raw.byteLength;
  type AnyTypedArray =
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
  const construct = <T extends AnyTypedArray>(
    Ctor: {
      new (buffer: ArrayBufferLike, byteOffset: number, length: number): T;
      BYTES_PER_ELEMENT: number;
    },
    count = elementCount,
  ): T => {
    const neededBytes = Ctor.BYTES_PER_ELEMENT * count;
    if (neededBytes > len) {
      // Clamp count to available bytes to avoid RangeError; model may be malformed.
      count = Math.floor(len / Ctor.BYTES_PER_ELEMENT);
    }
    if (off % Ctor.BYTES_PER_ELEMENT === 0) {
      try {
        return new Ctor(buf, off, count);
      } catch {
        // fallthrough to copy below
      }
    }
    // Unaligned or failed: copy to aligned buffer
    const copy = raw.slice(0, neededBytes);
    return new Ctor(
      copy.buffer,
      copy.byteOffset,
      Math.floor(copy.byteLength / Ctor.BYTES_PER_ELEMENT),
    );
  };

  switch (dt) {
    case TensorDataType.FLOAT:
      return construct(Float32Array);
    case TensorDataType.DOUBLE:
      return construct(Float64Array);
    case TensorDataType.INT32:
      return construct(Int32Array);
    case TensorDataType.INT64:
      return construct(BigInt64Array as any);
    case TensorDataType.UINT8:
      return raw; // already byte-aligned
    case TensorDataType.INT8:
      return construct(Int8Array);
    case TensorDataType.UINT16:
      return construct(Uint16Array);
    case TensorDataType.INT16:
      return construct(Int16Array);
    case TensorDataType.UINT32:
      return construct(Uint32Array);
    case TensorDataType.UINT64:
      return construct(BigUint64Array as any);
    case TensorDataType.FLOAT16:
      return float16ToFloat32(construct(Uint16Array));
    case TensorDataType.BFLOAT16:
      return bfloat16ToFloat32(construct(Uint16Array));
    default:
      return raw; // unsupported types remain raw
  }
}
