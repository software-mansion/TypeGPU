import type { TgpuBaseArray } from '../../data/array';
import { isDecorated, isLooseDecorated } from '../../data/attributes';
import { getCustomAlignment } from '../../data/attributes';
import { isLooseStructSchema, isStructSchema } from '../../data/struct';
import { roundUp } from '../../mathUtils';
import type { TgpuNamable } from '../../namable';
import {
  type TgpuVertexAttrib,
  type VertexFormat,
  kindToDefaultFormatMap,
  vertexFormats,
} from '../../shared/vertexFormat';
import type { AnyTgpuData, AnyTgpuLooseData } from '../../types';
import type {
  ArrayToContainedAttribs,
  DataToContainedAttribs,
} from './vertexAttribute';

// ----------
// Public API
// ----------

export interface TgpuVertexLayout<TData extends TgpuBaseArray = TgpuBaseArray>
  extends TgpuNamable {
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

export function vertexLayout<TData extends TgpuBaseArray>(
  schemaForCount: (count: number) => TData,
  stepMode: 'vertex' | 'instance' = 'vertex',
): TgpuVertexLayout<TData> {
  return new TgpuVertexLayoutImpl(schemaForCount, stepMode);
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
  TLayoutData extends TgpuBaseArray,
  TData extends AnyTgpuData | AnyTgpuLooseData,
>(
  layout: TgpuVertexLayout<TLayoutData>,
  data: TData,
  offset: number,
): DataToContainedAttribs<TData> {
  if (isDecorated(data) || isLooseDecorated(data)) {
    return dataToContainedAttribs(
      layout,
      data.inner,
      roundUp(offset, getCustomAlignment(data) ?? 1),
    );
  }

  if (isStructSchema(data)) {
    let memberOffset = offset;

    return Object.fromEntries(
      Object.entries(data.properties).map(([key, value]) => {
        memberOffset = roundUp(memberOffset, value.byteAlignment);
        const attrib = [
          key,
          dataToContainedAttribs(layout, value, memberOffset),
        ];
        memberOffset += value.size;
        return attrib;
      }),
    ) as DataToContainedAttribs<TData>;
  }

  if (isLooseStructSchema(data)) {
    let memberOffset = offset;

    return Object.fromEntries(
      Object.entries(data.properties).map(([key, value]) => {
        memberOffset = roundUp(memberOffset, getCustomAlignment(value) ?? 1);
        const attrib = [
          key,
          dataToContainedAttribs(layout, value, memberOffset),
        ];
        memberOffset += value.size;
        return attrib;
      }),
    ) as DataToContainedAttribs<TData>;
  }

  if ('kind' in data && typeof data.kind === 'string') {
    if (vertexFormats.includes(data.kind as VertexFormat)) {
      return {
        _layout: layout, // hidden property, used to determine which buffers to apply when executing the pipeline
        format: data.kind as VertexFormat,
        offset,
        // biome-ignore lint/suspicious/noExplicitAny: <too many type shenanigans>
      } satisfies TgpuVertexAttrib & INTERNAL_TgpuVertexAttrib as any;
    }

    const format = (kindToDefaultFormatMap as Record<string, VertexFormat>)[
      data.kind
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

class TgpuVertexLayoutImpl<TData extends TgpuBaseArray>
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

    this.stride = arraySchema.stride;
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
