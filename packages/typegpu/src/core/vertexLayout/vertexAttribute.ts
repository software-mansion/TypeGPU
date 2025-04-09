import type { AnyUnstruct, Disarray } from '../../data/dataTypes.ts';
import type {
  AnyWgslStruct,
  Decorated,
  WgslArray,
} from '../../data/wgslTypes.ts';
import type {
  KindToAcceptedAttribMap,
  KindToDefaultFormatMap,
  TgpuVertexAttrib,
  VertexFormat,
} from '../../shared/vertexFormat.ts';

/**
 * The array can hold T, where T is a single/multi-component numeric, or a struct with members of type T.
 * Examples of valid array members:
 * - Vec3f,
 * - unorm8x2
 * - WgslStruct<{ a: Vec3f, b: unorm8x2 }>
 * - WgslStruct<{ nested: WgslStruct<{ a: Vec3f }> }>
 */
export type DataToContainedAttribs<T> = T extends AnyWgslStruct | AnyUnstruct
  ? {
      [Key in keyof T['propTypes']]: DataToContainedAttribs<
        T['propTypes'][Key]
      >;
    }
  : T extends { type: VertexFormat }
    ? TgpuVertexAttrib<T['type']>
    : T extends { type: keyof KindToDefaultFormatMap }
      ? TgpuVertexAttrib<KindToDefaultFormatMap[T['type']]>
      : T extends Decorated<infer TInner>
        ? DataToContainedAttribs<TInner>
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
