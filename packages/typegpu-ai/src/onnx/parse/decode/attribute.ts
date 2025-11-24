import { ProtobuffReader } from '../../protobuf.ts';
import {
  type Graph,
  type NodeAttribute,
  type OnnxLoadOptions,
  type Tensor,
  WireType,
} from '../../types.ts';
import { bitsToFloat32, normalizeInt64 } from '../convert.ts';
import { readFloat32Values, readInt64Values } from '../io.ts';
import { decodeGraph } from './graph.ts';
import { decodeTensor } from './tensor.ts';

export const ATTRIBUTE_TYPE_NAMES: Record<number, string> = {
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

export function decodeAttribute(
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
