import { isDecorated, isLocationAttrib } from 'typegpu/data';
import { isBuiltin } from '../../data/attributes.ts';
import { type BaseData, isVoid, isWgslStruct } from '../../data/wgslTypes.ts';
import type { AnyFragmentTargets, TgpuColorTargetState } from './renderPipeline.ts';
import { invariant } from '../../errors.ts';

function extractLocation(value: BaseData): number | undefined {
  if (isDecorated(value)) {
    return value.attribs.filter((attrib) => isLocationAttrib(attrib)).at(0)?.params[0];
  }
  return undefined;
}

export function connectTargetsToShader(
  fragmentOut: BaseData,
  targets: AnyFragmentTargets,
): (GPUColorTargetState | null)[] {
  let presentationFormat: GPUTextureFormat | undefined;

  if (isVoid(fragmentOut) || isBuiltin(fragmentOut)) {
    return [];
  }

  if (isWgslStruct(fragmentOut)) {
    const varyings = Object.fromEntries(
      Object.entries(fragmentOut.propTypes).filter(([, value]) => !isBuiltin(value)),
    );

    const result: (GPUColorTargetState | null)[] = [];

    function resize(size: number) {
      while (size > result.length) {
        result.push(null);
      }
    }

    for (const [key, outputValue] of Object.entries(varyings)) {
      const matchingTarget = (targets as Record<string, TgpuColorTargetState>)[key];
      const location = extractLocation(outputValue);
      invariant(location !== undefined, `'withLocations' failed or was not called.`);

      resize(location);
      result[location] = {
        ...matchingTarget,
        format:
          matchingTarget?.format ??
          (presentationFormat ??= navigator.gpu.getPreferredCanvasFormat()),
      };
    }
    return result;
  }

  const singleTarget = targets as TgpuColorTargetState;
  return [
    {
      ...singleTarget,
      format:
        singleTarget?.format ?? (presentationFormat ??= navigator.gpu.getPreferredCanvasFormat()),
    },
  ];
}
