import * as d from 'typegpu/data';

export const writeonlyF16Texture = d.storageTexture({
  viewDimension: '2d',
  format: 'rgba16float',
  access: 'write-only',
});
export const floatSampledTexture = d.sampledTexture({
  sampleType: 'float',
});

export type DisplayMode = 'ink' | 'velocity' | 'image';

export type SimulationParams = {
  dt: number;
  viscosity: number;
  jacobiIter: number;
  displayMode: DisplayMode;
  paused: boolean;
};

export type BrushState = {
  pos: [number, number];
  delta: [number, number];
  isDown: boolean;
};
