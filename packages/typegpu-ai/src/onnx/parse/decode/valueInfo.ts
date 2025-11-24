import { ProtobuffReader } from '../../protobuf.ts';
import {
  type OnnxLoadOptions,
  TensorDataType,
  type ValueInfo,
  WireType,
} from '../../types.ts';

export function decodeValueInfo(
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
