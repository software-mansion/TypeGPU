import { alignmentOf, customAlignmentOf } from '../../data/alignmentOf';
import type { Disarray } from '../../data/dataTypes';
import {
  getCustomLocation,
  isLooseDecorated,
  isUnstruct,
} from '../../data/dataTypes';
import { sizeOf } from '../../data/sizeOf';
import type { BaseData, WgslArray } from '../../data/wgslTypes';
import { isDecorated, isWgslStruct } from '../../data/wgslTypes';
import { roundUp } from '../../mathUtils';
import type { TgpuNamable } from '../../namable';
import {
  type TgpuVertexAttrib,
  type VertexFormat,
  kindToDefaultFormatMap,
  vertexFormats,
} from '../../shared/vertexFormat';
import type { Labelled } from '../../types';
import type {
  ArrayToContainedAttribs,
  DataToContainedAttribs,
} from './vertexAttribute';

// ----------
// Public API
// ----------

export interface TgpuVertexLayout<
  TData extends WgslArray | Disarray = WgslArray | Disarray,
> extends TgpuNamable,
    Labelled {
  readonly resourceType: 'vertex-layout';
  readonly stride: number;
  readonly stepMode: 'vertex' | 'instance';
  readonly attrib: ArrayToContainedAttribs<TData>;
  readonly vertexLayout: GPUVertexBufferLayout;
  schemaForCount(n: number): TData;
}

export interface INTERNAL_TgpuVertexAttrib {
  readonly _layout: TgpuVertexLayout;
}

export function vertexLayout<TData extends WgslArray | Disarray>(
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

const defaultAttribEntry = Symbol('defaultAttribEntry');

function dataToContainedAttribs<
  TLayoutData extends WgslArray | Disarray,
  TData extends BaseData,
>(
  layout: TgpuVertexLayout<TLayoutData>,
  data: TData,
  offset: number,
  customLocationMap: Record<string | symbol, number>,
  key?: string,
): DataToContainedAttribs<TData> {
  if (isDecorated(data) || isLooseDecorated(data)) {
    const customLocation = getCustomLocation(data);
    if (customLocation !== undefined) {
      customLocationMap[key ?? defaultAttribEntry] = customLocation;
    }

    return dataToContainedAttribs(
      layout,
      data.inner,
      roundUp(offset, customAlignmentOf(data)),
      customLocationMap,
    );
  }

  if (isWgslStruct(data)) {
    let memberOffset = offset;

    return Object.fromEntries(
      Object.entries(data.propTypes).map(([key, value]) => {
        memberOffset = roundUp(memberOffset, alignmentOf(value));
        const attrib = [
          key,
          dataToContainedAttribs(
            layout,
            value,
            memberOffset,
            customLocationMap,
            key,
          ),
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
          dataToContainedAttribs(
            layout,
            value,
            memberOffset,
            customLocationMap,
            key,
          ),
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
  private readonly _customLocationMap = {} as Record<string | symbol, number>;

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
    this.attrib = dataToContainedAttribs(
      this,
      arraySchema.elementType,
      0,
      this._customLocationMap,
    );
  }

  get label(): string | undefined {
    return this._label;
  }

  get vertexLayout(): GPUVertexBufferLayout {
    // If defaultAttribEntry is in the custom location map,
    // it means that the vertex layout is based on a single attribute
    if (this._customLocationMap[defaultAttribEntry] !== undefined) {
      if (
        typeof this.attrib.format !== 'string' ||
        typeof this.attrib.offset !== 'number'
      ) {
        throw new Error(
          'Single attribute vertex layouts must have a format and offset.',
        );
      }

      return {
        arrayStride: this.stride,
        stepMode: this.stepMode,
        attributes: [
          {
            format: this.attrib.format,
            offset: this.attrib.offset,
            shaderLocation: this._customLocationMap[defaultAttribEntry],
          },
        ],
      };
    }

    // check if all attributes have custom locations
    const allAttributesHaveCustomLocations = Object.keys(this.attrib).every(
      (key) => this._customLocationMap[key] !== undefined,
    );

    if (!allAttributesHaveCustomLocations) {
      throw new Error(
        'All attributes must have custom locations in order to unwrap a vertex layout.',
      );
    }

    return {
      arrayStride: this.stride,
      stepMode: this.stepMode,
      attributes: [
        ...Object.entries(this.attrib).map(([key, attrib]) => ({
          format: attrib.format,
          offset: attrib.offset,
          shaderLocation: this._customLocationMap[key],
        })),
      ] as GPUVertexAttribute[],
    };
  }

  $name(label?: string | undefined): this {
    this._label = label;
    return this;
  }
}
