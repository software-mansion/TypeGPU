// biome-ignore lint/style/useEnumInitializers:
export enum PlotType {
  GEOMETRIC,
  HISTOGRAM,
  BAR,
}

export interface PlotData {
  count: number;
  ids: Uint32Array;
  positionsX: Float64Array;
  positionsY: Float64Array;
  positionsZ: Float64Array;
  sizes: Float64Array;
  dists: Float64Array;
}

export type Distributions = 'onUnitSphere' | 'inUnitSphere';
