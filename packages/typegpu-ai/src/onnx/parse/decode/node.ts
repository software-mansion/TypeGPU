import { ProtobuffReader } from '../../protobuf.ts';
import { type Node, type OnnxLoadOptions, WireType } from '../../types.ts';
import { decodeAttribute } from './attribute.ts';

export function decodeNode(
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
