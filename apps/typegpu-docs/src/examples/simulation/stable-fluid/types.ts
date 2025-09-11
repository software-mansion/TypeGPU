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
