import type * as d from 'typegpu/data';

import type * as s from './structures.ts';

export interface IPlotter {
  init: (context: GPUCanvasContext) => Promise<void>;
  updateCamera: (cameraConfig: CameraConfig) => void;
  plot: (surfaces: ISurface[], options: PlotConfig) => void;
  startRenderLoop: () => void;
  stopRenderLoop: () => void;
  destroy: () => void;
}

export interface PlotConfig {
  colormap: (y: number) => d.v4f;
  xScaler?: IScaler;
  yScaler?: IScaler;
  zScaler?: IScaler;
  xZeroPlane: boolean;
  yZeroPlane: boolean;
  zZeroPlane: boolean;
}

export interface ISurface {
  getVertexBufferData: () => typeof s.Vertex[];
  getIndexBufferData: () => number[];
}

export interface IScaler {
  fit: (data: number[]) => void;
  scale: (value: number) => number;
}

export interface CameraConfig {
  zoomable: boolean;
  draggable: boolean;
  position: d.v4f;
  target: d.v3f;
  up: d.v3f;
  fov: number;
  near: number;
  far: number;
}

export interface GridConfig {
  nx: number;
  nz: number;
  xRange: Range;
  zRange: Range;
}

export interface Range {
  min: number;
  max: number;
}
