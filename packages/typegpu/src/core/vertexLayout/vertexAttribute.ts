import type { Disarray, Unstruct } from '../../data/dataTypes';
import type { AnyWgslStruct } from '../../data/struct';
import type { WgslArray } from '../../data/wgslTypes';
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
 * - WgslStruct<{ a: Vec3f, b: unorm8x2 }>
 * - WgslStruct<{ nested: WgslStruct<{ a: Vec3f }> }>
 */
export type DataToContainedAttribs<T> = T extends AnyWgslStruct | Unstruct
  ? {
      [Key in keyof T['propTypes']]: DataToContainedAttribs<
        T['propTypes'][Key]
      >;
    }
  : T extends { type: VertexFormat }
    ? TgpuVertexAttrib<T['type']>
    : T extends { type: keyof KindToDefaultFormatMap }
      ? TgpuVertexAttrib<KindToDefaultFormatMap[T['type']]>
      : never;

/**
 * Interprets an array as a set of vertex attributes.
 */
export type ArrayToContainedAttribs<T extends WgslArray | Disarray> =
  DataToContainedAttribs<T['elementType']>;

export type LayoutToAllowedAttribs<T> = T extends {
  type: keyof KindToAcceptedAttribMap;
}
  ? KindToAcceptedAttribMap[T['type']]
  : T extends Record<string, unknown>
    ? { [Key in keyof T]: LayoutToAllowedAttribs<T[Key]> }
    : never;
