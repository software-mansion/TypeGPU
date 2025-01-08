import { alignmentOf, customAlignmentOf } from '../../data/alignmentOf';
import { isLooseDecorated, isUnstruct } from '../../data/dataTypes';
import type { Disarray } from '../../data/dataTypes';
import { sizeOf } from '../../data/sizeOf';
import { isDecorated, isWgslStruct } from '../../data/wgslTypes';
import type { BaseWgslData, WgslArray } from '../../data/wgslTypes';
import { roundUp } from '../../mathUtils';
import type { TgpuNamable } from '../../namable';
import {
  type TgpuVertexAttrib,
  type VertexFormat,
  kindToDefaultFormatMap,
  vertexFormats,
} from '../../shared/vertexFormat';
import type { ExoticIO } from '../function/fnTypes';
import type {
  ArrayToContainedAttribs,
  DataToContainedAttribs,
} from './vertexAttribute';

// ----------
// Public API
// ----------

export interface TgpuVertexLayout<
  TData extends WgslArray | Disarray = WgslArray | Disarray,
> extends TgpuNamable {
  readonly resourceType: 'vertex-layout';
  readonly label?: string | undefined;
  readonly stride: number;
  readonly stepMode: 'vertex' | 'instance';
  readonly attrib: ArrayToContainedAttribs<TData>;
  schemaForCount(n: number): TData;
}

export interface INTERNAL_TgpuVertexAttrib {
  readonly _layout: TgpuVertexLayout;
}

export function vertexLayout<TData extends WgslArray | Disarray>(
  schemaForCount: (count: number) => TData,
  stepMode: 'vertex' | 'instance' = 'vertex',
): TgpuVertexLayout<ExoticIO<TData>> {
  return new TgpuVertexLayoutImpl(
    schemaForCount as (count: number) => ExoticIO<TData>,
    stepMode,
  );
}

export function isVertexLayout<T extends TgpuVertexLayout>(
  value: unknown | T,
): value is T {
  return (value as T)?.resourceType === 'vertex-layout';
}

// --------------
// Implementation
// --------------

function dataToContainedAttribs<
  TLayoutData extends WgslArray | Disarray,
  TData extends BaseWgslData,
>(
  layout: TgpuVertexLayout<TLayoutData>,
  data: TData,
  offset: number,
): DataToContainedAttribs<TData> {
  if (isDecorated(data) || isLooseDecorated(data)) {
    return dataToContainedAttribs(
      layout,
      data.inner,
      roundUp(offset, customAlignmentOf(data)),
    );
  }

  if (isWgslStruct(data)) {
    let memberOffset = offset;

    return Object.fromEntries(
      Object.entries(data.propTypes).map(([key, value]) => {
        memberOffset = roundUp(memberOffset, alignmentOf(value));
        const attrib = [
          key,
          dataToContainedAttribs(layout, value, memberOffset),
        ];
        memberOffset += sizeOf(value);
        return attrib;
      }),
    ) as DataToContainedAttribs<TData>;
  }

  if (isUnstruct(data)) {
    let memberOffset = offset;

    return Object.fromEntries(
      Object.entries(data.propTypes).map(([key, value]) => {
        memberOffset = roundUp(memberOffset, customAlignmentOf(value));
        const attrib = [
          key,
          dataToContainedAttribs(layout, value, memberOffset),
        ];
        memberOffset += sizeOf(value);
        return attrib;
      }),
    ) as DataToContainedAttribs<TData>;
  }

  if ('type' in data && typeof data.type === 'string') {
    if (vertexFormats.includes(data.type as VertexFormat)) {
      return {
        _layout: layout, // hidden property, used to determine which buffers to apply when executing the pipeline
        format: data.type as VertexFormat,
        offset,
        // biome-ignore lint/suspicious/noExplicitAny: <too many type shenanigans>
      } satisfies TgpuVertexAttrib & INTERNAL_TgpuVertexAttrib as any;
    }

    const format = (kindToDefaultFormatMap as Record<string, VertexFormat>)[
      data.type
    ];

    if (format) {
      return {
        _layout: layout, // hidden property, used to determine which buffers to apply when executing the pipeline
        format,
        offset,
        // biome-ignore lint/suspicious/noExplicitAny: <too many type shenanigans>
      } satisfies TgpuVertexAttrib & INTERNAL_TgpuVertexAttrib as any;
    }
  }

  throw new Error(`Unsupported data used in vertex layout: ${String(data)}`);
}

class TgpuVertexLayoutImpl<TData extends WgslArray | Disarray>
  implements TgpuVertexLayout<TData>
{
  public readonly resourceType = 'vertex-layout';
  public readonly stride: number;
  public readonly attrib: ArrayToContainedAttribs<TData>;

  private _label: string | undefined;

  constructor(
    public readonly schemaForCount: (count: number) => TData,
    public readonly stepMode: 'vertex' | 'instance',
  ) {
    // `0` signals that the data-type is runtime-sized, and should not be used to create buffers.
    const arraySchema = schemaForCount(0);

    this.stride = roundUp(
      sizeOf(arraySchema.elementType),
      alignmentOf(arraySchema),
    );
    this.attrib = dataToContainedAttribs(this, arraySchema.elementType, 0);
  }

  get label(): string | undefined {
    return this._label;
  }

  $name(label?: string | undefined): this {
    this._label = label;
    return this;
  }
}
