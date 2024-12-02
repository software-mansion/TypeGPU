import type { LooseArray } from '../../data/dataTypes';
import type { WgslArray, WgslStruct } from '../../data/wgslTypes';
import type {
  KindToAcceptedAttribMap,
  KindToDefaultFormatMap,
  TgpuVertexAttrib,
  VertexFormat,
} from '../../shared/vertexFormat';

/**
 * The array can hold T, where T is a single/multi-component numeric, or a struct with members of type T.
 * Examples of valid array members:
 * - Vec3f,
 * - unorm8x2
 * - TgpuStruct<{ a: Vec3f, b: unorm8x2 }>
 * - TgpuStruct<{ nested: TgpuStruct<{ a: Vec3f }> }>
 */
export type DataToContainedAttribs<T> = T extends WgslStruct<infer Props>
  ? { [Key in keyof Props]: DataToContainedAttribs<Props[Key]> }
  : T extends { kind: VertexFormat }
    ? TgpuVertexAttrib<T['kind']>
    : T extends { kind: keyof KindToDefaultFormatMap }
      ? TgpuVertexAttrib<KindToDefaultFormatMap[T['kind']]>
      : never;

/**
 * Interprets an array as a set of vertex attributes.
 */
export type ArrayToContainedAttribs<T extends WgslArray | LooseArray> =
  DataToContainedAttribs<T['elementType']>;

export type LayoutToAllowedAttribs<T> = T extends {
  kind: keyof KindToAcceptedAttribMap;
}
  ? KindToAcceptedAttribMap[T['kind']]
  : T extends Record<string, unknown>
    ? { [Key in keyof T]: LayoutToAllowedAttribs<T[Key]> }
    : never;
