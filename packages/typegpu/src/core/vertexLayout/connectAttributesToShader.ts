import { isBuiltin } from '../../data/attributes.ts';
import { getCustomLocation } from '../../data/dataTypes.ts';
import { isData } from '../../data/dataTypes.ts';
import type {
  AnyVertexAttribs,
  TgpuVertexAttrib,
} from '../../shared/vertexFormat.ts';
import type { IOData } from '../function/fnTypes.ts';
import type { TgpuVertexFn } from '../function/tgpuVertexFn.ts';
import type {
  INTERNAL_TgpuVertexAttrib,
  TgpuVertexLayout,
} from './vertexLayout.ts';

export interface ConnectAttributesToShaderResult {
  usedVertexLayouts: TgpuVertexLayout[];
  bufferDefinitions: GPUVertexBufferLayout[];
}

export function isAttribute(
  value: unknown,
): value is TgpuVertexAttrib & INTERNAL_TgpuVertexAttrib {
  return typeof (value as TgpuVertexAttrib & INTERNAL_TgpuVertexAttrib)
    ?.format === 'string';
}

export function connectAttributesToShader(
  shaderInputLayout: TgpuVertexFn.In,
  attributes: AnyVertexAttribs,
): ConnectAttributesToShaderResult {
  const usedVertexLayouts: TgpuVertexLayout[] = [];

  if (isData(shaderInputLayout)) {
    // Expecting a single attribute, no record.
    if (!isAttribute(attributes)) {
      throw new Error(
        'Shader expected a single attribute, not a record of attributes to be passed in.',
      );
    }

    usedVertexLayouts.push(attributes._layout);

    return {
      usedVertexLayouts,
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

  for (
    const [key, member] of Object.entries(
      shaderInputLayout as Record<string, IOData>,
    )
  ) {
    if (isBuiltin(member)) {
      continue;
    }

    const matchingAttribute = (attributes as Record<string, TgpuVertexAttrib>)[
      key
    ] as (TgpuVertexAttrib & INTERNAL_TgpuVertexAttrib) | undefined;

    if (!matchingAttribute) {
      throw new Error(
        `An attribute by the name of '${key}' was not provided to the shader.`,
      );
    }

    const layout = matchingAttribute._layout;
    let attribList = layoutToAttribListMap.get(layout);
    if (!attribList) {
      // First time seeing this layout
      usedVertexLayouts.push(layout);

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

  return { usedVertexLayouts, bufferDefinitions };
}
