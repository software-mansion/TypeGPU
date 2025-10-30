import { ProtobuffReader } from '../../protobuf.ts';
import {
  type Graph,
  type OnnxLoadOptions,
  type Tensor,
  WireType
} from '../../types.ts';
import { decodeNode } from './node.ts';
import { decodeTensor } from './tensor.ts';
import { decodeValueInfo } from './valueInfo.ts';



export function decodeGraph(
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
