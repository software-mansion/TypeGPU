import type { TgpuBaseArray } from '../../data/array';
import { isDecorated, isLooseDecorated } from '../../data/attributes';
import { getCustomAlignment } from '../../data/attributes';
import { isLooseStructSchema, isStructSchema } from '../../data/struct';
import { roundUp } from '../../mathUtils';
import {
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

export interface TgpuVertexLayout<TData extends TgpuBaseArray> {
  readonly stride: number;
  readonly attrib: ArrayToContainedAttribs<TData>;
}

export function vertexLayout<TData extends TgpuBaseArray>(
  schemaForCount: (count: number) => TData,
): TgpuVertexLayout<TData> {
  return new TgpuVertexLayoutImpl(schemaForCount);
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
      return { format: data.kind, offset } as DataToContainedAttribs<TData>;
    }

    const format = (kindToDefaultFormatMap as Record<string, VertexFormat>)[
      data.kind
    ];

    if (format) {
      return {
        layout, // hidden property, used to determine which buffers to apply when executing the pipeline
        format,
        offset,
      } as unknown as DataToContainedAttribs<TData>;
    }
  }

  throw new Error(`Unsupported data used in vertex layout: ${String(data)}`);
}

class TgpuVertexLayoutImpl<TData extends TgpuBaseArray>
  implements TgpuVertexLayout<TData>
{
  public readonly stride: number;
  public readonly attrib: ArrayToContainedAttribs<TData>;

  constructor(public readonly schemaForCount: (count: number) => TData) {
    // `0` signals that the data-type is runtime-sized, and should not be used to create buffers.
    const arraySchema = schemaForCount(0);

    this.stride = arraySchema.stride;
    this.attrib = dataToContainedAttribs(this, arraySchema.elementType, 0);
  }
}
