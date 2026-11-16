// Pure layout math, shared by `define` and `instantiate`. Must not import `typegpu` values.

export type MergeMode = 'hardware' | 'bilinear-fix';

export type BaseStoredRayDim = 1 | 2 | 4;

export type CascadeInfoOptions = {
  baseStoredRayDim?: BaseStoredRayDim;
  renderAspect?: number;
};

export type CascadeLayerInfo = {
  layer: number;
  probes: [number, number];
  probesU: [number, number];
  validDim: [number, number];
  raysDimStored: number;
  startT: number;
  endT: number;
};

export type CascadeInfo = {
  baseProbes: [number, number];
  cascadeDim: [number, number];
  cascadeCount: number;
  layers: CascadeLayerInfo[];
};

const MIN_BASE_PROBES = 16;
const DEFAULT_MIN_CASCADES = 5;

function shrByPow2(value: number, shift: number) {
  return Math.max(Math.floor(value / 2 ** shift), 1);
}

export function getCascadeInfo(
  width: number,
  height: number,
  options: CascadeInfoOptions = {},
): CascadeInfo {
  const baseStoredRayDim = options.baseStoredRayDim ?? 1;

  const aspect = width / height;
  const diagonal = Math.hypot(width, height);

  const closestPowerOfTwo = Math.max(MIN_BASE_PROBES, 2 ** Math.floor(Math.log2(diagonal)));

  const [baseProbesX, baseProbesY] =
    aspect >= 1
      ? [closestPowerOfTwo, Math.max(MIN_BASE_PROBES, Math.round(closestPowerOfTwo / aspect))]
      : [Math.max(MIN_BASE_PROBES, Math.round(closestPowerOfTwo * aspect)), closestPowerOfTwo];

  const baseProbesMin = Math.min(baseProbesX, baseProbesY);
  const interval0 = 1 / baseProbesMin;
  const renderAspect = options.renderAspect ?? aspect;
  if (!(renderAspect > 0)) {
    throw new Error('renderAspect must be positive.');
  }

  const maxRange = Math.hypot(renderAspect, 1) / Math.min(renderAspect, 1);

  const cascadeCount = Math.max(
    DEFAULT_MIN_CASCADES,
    Math.ceil(Math.log2((maxRange * 3) / interval0 + 1) / 2),
  );

  const maxStoredRayDim = baseStoredRayDim * 2 ** (cascadeCount - 1);
  const cascadeDimX = Math.max(baseProbesX * baseStoredRayDim, maxStoredRayDim);
  const cascadeDimY = Math.max(baseProbesY * baseStoredRayDim, maxStoredRayDim);

  const layers = Array.from({ length: cascadeCount }, (_, layer): CascadeLayerInfo => {
    const probesX = shrByPow2(baseProbesX, layer);
    const probesY = shrByPow2(baseProbesY, layer);
    const probesUX = shrByPow2(baseProbesX, layer + 1);
    const probesUY = shrByPow2(baseProbesY, layer + 1);

    const raysDimStored = baseStoredRayDim * 2 ** layer;

    const pow4 = 4 ** layer;
    const startT = (interval0 * (pow4 - 1)) / 3;
    const endT = startT + interval0 * pow4;

    return {
      layer,
      probes: [probesX, probesY],
      probesU: [probesUX, probesUY],
      validDim: [probesX * raysDimStored, probesY * raysDimStored],
      raysDimStored,
      startT,
      endT,
    };
  });

  return {
    baseProbes: [baseProbesX, baseProbesY],
    cascadeDim: [cascadeDimX, cascadeDimY],
    cascadeCount,
    layers,
  };
}
