import { getCustomLocation } from '../../data/attributes';
import type { TgpuVertexAttrib } from '../../shared/vertexFormat';
import { isBaseData } from '../../types';
import type { IOData, IOLayout } from '../function/fnTypes';
import type {
  INTERNAL_TgpuVertexAttrib,
  TgpuVertexLayout,
} from './vertexLayout';

interface ConnectAttributesToShaderResult {
  layoutToIdxMap: Map<TgpuVertexLayout, number>;
  bufferDefinitions: GPUVertexBufferLayout[];
}

function isAttribute<T extends TgpuVertexAttrib & INTERNAL_TgpuVertexAttrib>(
  value: unknown | T,
): value is T {
  return typeof (value as T)?.format === 'string';
}

export function connectAttributesToShader(
  shaderInputLayout: IOLayout,
  attributes: Record<string, TgpuVertexAttrib> | TgpuVertexAttrib,
): ConnectAttributesToShaderResult {
  const layoutToIdxMap = new Map<TgpuVertexLayout, number>();

  if (isBaseData(shaderInputLayout)) {
    // Expecting a single attribute, no record.
    if (!isAttribute(attributes)) {
      throw new Error(
        'Shader expected a single attribute, not a record of attributes to be passed in.',
      );
    }

    layoutToIdxMap.set(attributes._layout, 0);

    return {
      layoutToIdxMap,
      bufferDefinitions: [
        {
          arrayStride: attributes._layout.stride,
          stepMode: attributes._layout.stepMode,
          attributes: [
            {
              format: attributes.format,
              offset: attributes.offset,
              shaderLocation: getCustomLocation(shaderInputLayout) ?? 0,
            },
          ],
        },
      ],
    };
  }

  const bufferDefinitions: GPUVertexBufferLayout[] = [];
  const layoutToAttribListMap = new WeakMap<
    TgpuVertexLayout,
    GPUVertexAttribute[]
  >();
  let nextShaderLocation = 0;
  let nextLayoutIdx = 0;

  for (const [key, member] of Object.entries(
    shaderInputLayout as Record<string, IOData>,
  )) {
    const matchingAttribute = (attributes as Record<string, TgpuVertexAttrib>)[
      key
    ] as (TgpuVertexAttrib & INTERNAL_TgpuVertexAttrib) | undefined;

    if (!matchingAttribute) {
      throw new Error(`An attribute by the name of '${key}' was not provided.`);
    }

    const layout = matchingAttribute._layout;
    let attribList = layoutToAttribListMap.get(layout);
    if (!attribList) {
      // First time seeing this layout
      layoutToIdxMap.set(layout, nextLayoutIdx++);

      attribList = [];
      bufferDefinitions.push({
        arrayStride: layout.stride,
        stepMode: layout.stepMode,
        attributes: attribList,
      });
      layoutToAttribListMap.set(layout, attribList);
    }

    nextShaderLocation = getCustomLocation(member) ?? nextShaderLocation;

    attribList.push({
      format: matchingAttribute.format,
      offset: matchingAttribute.offset,
      shaderLocation: nextShaderLocation++,
    });
  }

  return { layoutToIdxMap, bufferDefinitions };
}
