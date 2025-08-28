import { decodeRawData, readDoubleFromFixed64 } from "./onnxModelLoader";
import { PbReader, WireType } from "./protobuf";
import { DecodedModel, Graph, OnnxLoadOptions, OnnxModel, Tensor, TensorDataType, ValueInfo, type Node } from "./types";
import { bfloat16ToFloat32, elementSize, float16ToFloat32, readFloatFromVarint } from "./utils";


export function decodeModel(buffer: Uint8Array, options: Required<OnnxLoadOptions>): DecodedModel {
  const r = new PbReader(buffer);
  const model: OnnxModel = {
    opsetImports: [],
    graph: { nodes: [], initializers: [], inputs: [], outputs: [], valueInfo: [] },
    tensorMap: new Map<string, Tensor>(),
  };

  while (!r.eof()) {
    const tag = r.tag(); if (!tag) break;
    switch (tag.fieldNumber) {
      case 1: model.irVersion = r.varintBig(); break; // ir_version
      case 2: model.producerName = r.string(); break;
      case 3: model.producerVersion = r.string(); break;
      case 4: model.domain = r.string(); break;
      case 5: model.modelVersion = r.varintBig(); break;
      case 6: model.docString = r.string(); break;
      case 7: { // graph (GraphProto)
        const bytes = r.bytes();
        model.graph = decodeGraph(bytes, options, model.tensorMap);
        break;
      }
      case 8: { // opset_import repeated OperatorSetIdProto (domain=1 version=2)
        const b = r.bytes(); const rr = new PbReader(b);
        let domain = ''; let version = 0n;
        while (!rr.eof()) {
          const t = rr.tag(); if (!t) break;
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

export function decodeGraph(bytes: Uint8Array, options: Required<OnnxLoadOptions>, tensorMap: Map<string, Tensor>): Graph {
  const r = new PbReader(bytes);
  const g: Graph = { nodes: [], initializers: [], inputs: [], outputs: [], valueInfo: [] };
  while (!r.eof()) {
    const tag = r.tag(); if (!tag) break;
    switch (tag.fieldNumber) {
      case 1: g.nodes.push(decodeNode(r.bytes(), options)); break;
      case 2: g.name = r.string(); break;
  // ONNX GraphProto field numbers (as of opset 19+):
  // 5: initializer, 10: doc_string, 11: input, 12: output, 13: value_info
  case 5: { const t = decodeTensor(r.bytes(), options); g.initializers.push(t); tensorMap.set(t.name, t); break; }
  case 10: g.doc = r.string(); break;
  case 11: g.inputs.push(decodeValueInfo(r.bytes(), options)); break;
  case 12: g.outputs.push(decodeValueInfo(r.bytes(), options)); break;
  case 13: g.valueInfo.push(decodeValueInfo(r.bytes(), options)); break;
      default: r.skip(tag.wireType as WireType);
    }
  }
  return g;
}

export function decodeNode(bytes: Uint8Array, _options: Required<OnnxLoadOptions>): Node {
  const r = new PbReader(bytes);
  const node: Node = { opType: '', inputs: [], outputs: [], attributes: [] } as Node;
  while (!r.eof()) {
    const tag = r.tag(); if (!tag) break;
    switch (tag.fieldNumber) {
      case 1: node.inputs.push(r.string()); break;
      case 2: node.outputs.push(r.string()); break;
      case 3: node.name = r.string(); break;
      case 4: node.opType = r.string(); break;
      case 5: node.domain = r.string(); break;
      case 6: node.attributes.push(decodeAttribute(r.bytes())); break;
      case 7: node.doc = r.string(); break;
      default: r.skip(tag.wireType as WireType);
    }
  }
  return node;
}



export function decodeAttribute(bytes: Uint8Array): any { // simplified; full coverage omitted
  const r = new PbReader(bytes);
  let name = ''; let type = ''; let value: unknown = undefined;
  while (!r.eof()) {
    const tag = r.tag(); if (!tag) break;
    switch (tag.fieldNumber) {
      case 1: name = r.string(); break; // name
      case 2: type = r.string(); break; // ref_attr_name (rare)
      case 3: value = r.varint(); break; // t (TensorProto) not handled
      case 4: value = r.varint(); break; // graph (GraphProto) unsupported
      case 5: value = r.varint(); break; // floats? (float) -> actually f (float, wire type 5) but simplified
      case 6: value = r.varint(); break; // ints? simplified
      case 7: value = r.string(); break; // string
      case 8: value = r.varint(); break; // tensors? (TensorProto)
      default: r.skip(tag.wireType as WireType);
    }
  }
  return { name, type, value };
}

export function decodeValueInfo(bytes: Uint8Array, _options: Required<OnnxLoadOptions>): ValueInfo {
  const r = new PbReader(bytes);
  const v: ValueInfo = { name: '' };
  while (!r.eof()) {
    const tag = r.tag(); if (!tag) break;
    switch (tag.fieldNumber) {
      case 1: v.name = r.string(); break;
      case 2: { // type (TypeProto)
        const b = r.bytes(); const rt = new PbReader(b);
        while (!rt.eof()) {
          const t = rt.tag(); if (!t) break;
          if (t.fieldNumber === 1) { // tensor_type
            const bt = rt.bytes(); const rtt = new PbReader(bt);
            let elemType: TensorDataType | undefined; const shape: (number | string)[] = [];
            while (!rtt.eof()) {
              const tt = rtt.tag(); if (!tt) break;
              if (tt.fieldNumber === 1) elemType = rtt.varint();
              else if (tt.fieldNumber === 2) { // shape (TensorShapeProto)
                const bsh = rtt.bytes(); const rsh = new PbReader(bsh);
                while (!rsh.eof()) {
                  const dtag = rsh.tag(); if (!dtag) break;
                  if (dtag.fieldNumber === 1) { // dim repeated
                    const bdim = rsh.bytes(); const rd = new PbReader(bdim);
                    let dim: number | string | undefined;
                    while (!rd.eof()) {
                      const dt = rd.tag(); if (!dt) break;
                      if (dt.fieldNumber === 1) dim = Number(rd.varintBig()); // dim_value
                      else if (dt.fieldNumber === 2) dim = rd.string(); // dim_param
                      else rd.skip(dt.wireType as WireType);
                    }
                    if (dim !== undefined) shape.push(dim);
                  } else rsh.skip(dtag.wireType as WireType);
                }
              } else rtt.skip(tt.wireType as WireType);
            }
            if (elemType !== undefined) v.elemType = elemType; v.shape = shape;
          } else rt.skip(t.wireType as WireType);
        }
        break;
      }
      case 3: v.doc = r.string(); break;
      default: r.skip(tag.wireType as WireType);
    }
  }
  return v;
}

export function decodeTensor(bytes: Uint8Array, options: Required<OnnxLoadOptions>): Tensor {
  const r = new PbReader(bytes);
  const t: Tensor = { name: '', dims: [], dataType: TensorDataType.UNDEFINED, rawData: null, elementCount: 0 };
  let floatData: number[] | undefined; let int32Data: number[] | undefined; let int64Data: bigint[] | undefined; let doubleData: number[] | undefined; let uint64Data: bigint[] | undefined; let float16Data: Uint16Array | undefined; let bfloat16Data: Uint16Array | undefined;
  while (!r.eof()) {
    const tag = r.tag(); if (!tag) break;
    switch (tag.fieldNumber) {
      case 1: t.dims.push(Number(r.varintBig())); break;
      case 2: t.dataType = r.varint() as TensorDataType; break;
      case 4: { // float_data repeated
        (floatData ??= []).push(readFloatFromVarint(r)); break;
      }
      case 5: { (int32Data ??= []).push(r.varint()); break; }
      case 7: { (int64Data ??= []).push(r.varintBig()); break; }
      case 8: t.name = r.string(); break;
      case 9: t.rawData = r.bytes(); break;
      case 11: t.doc = r.string(); break;
      case 13: { (doubleData ??= []).push(readDoubleFromFixed64(r)); break; }
      case 14: { (uint64Data ??= []).push(r.varintBig()); break; }
      default: r.skip(tag.wireType as WireType);
    }
  }
  t.elementCount = t.dims.reduce<number>((a, b) => (typeof b === 'number' ? a * (b || 1) : a), 1);

  if (options.decodeData) {
    if (t.rawData && elementSize(t.dataType)) {
      t.data = decodeRawData(t.rawData, t.dataType, t.elementCount);
    } else {
      // fallback to typed fields
      switch (t.dataType) {
        case TensorDataType.FLOAT: t.data = Float32Array.from(floatData ?? []); break;
        case TensorDataType.INT32: t.data = Int32Array.from(int32Data ?? []); break;
        case TensorDataType.INT64: t.data = (int64Data ?? []).map(x => x); break;
        case TensorDataType.DOUBLE: t.data = Float64Array.from(doubleData ?? []); break;
        case TensorDataType.UINT64: t.data = (uint64Data ?? []).map(x => x); break;
        case TensorDataType.FLOAT16: if (float16Data) t.data = float16ToFloat32(float16Data); break;
        case TensorDataType.BFLOAT16: if (bfloat16Data) t.data = bfloat16ToFloat32(bfloat16Data); break;
        default: break;
      }
    }
  }
  if (!options.keepRawData) t.rawData = null;
  return t;
}