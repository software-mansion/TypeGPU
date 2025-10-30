import { ProtobuffReader } from '../../protobuf.ts';
import {
  type DecodedModel,
  type OnnxLoadOptions,
  type OnnxModel,
  type Tensor,
  WireType
} from '../../types.ts';
import { decodeGraph } from './graph.ts';


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
