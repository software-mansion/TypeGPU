import type * as d from 'typegpu/data';

import type * as s from './structures.ts';

export interface IPlotter {
  init: (context: GPUCanvasContext) => Promise<void>;
  updateCamera: (cameraConfig: CameraConfig) => void;
  addPlots: (surfaces: ISurface[], options: PlotConfig) => void;
  resetPlots: () => void;
  startRenderLoop: () => void;
  stopRenderLoop: () => void;
}

export interface PlotConfig {
  basePlanesTranslation: d.v3f;
  basePlanesScale: d.v3f;
  basePlotsTranslation: d.v3f;
  basePlotsScale: d.v3f;
  xScaler: IScaler;
  yScaler: IScaler;
  zScaler: IScaler;
  xZeroPlane: boolean;
  yZeroPlane: boolean;
  zZeroPlane: boolean;
}

export interface ScaleTransform {
  offset: d.v3f;
  scale: d.v3f;
}

export interface ISurface {
  getVertexBufferData: () => d.Infer<typeof s.Vertex>[];
  getIndexBufferData: () => number[];
}

export type IScaler =
  | {
    type: 'affine';
    fit: (data: number[]) => { scale: number; offset: number };
  }
  | {
    type: 'non-affine';
    transform: (value: number) => number;
  };

export interface CameraConfig {
  zoomable: boolean;
  draggable: boolean;
  position: d.v4f;
  target: d.v3f;
  up: d.v3f;
  fov: number;
  near: number;
  far: number;
  orbitSensitivity: number;
  zoomSensitivity: number;
  maxZoom: number;
}

export interface GridConfig {
  nx: number;
  nz: number;
  xRange: Range;
  zRange: Range;
  yCallback: (x: number, z: number) => number;
  /**
   * be aware that colorCallback is applied after scaling
   */
  colorCallback: (y: number) => d.v4f;
}

export interface Range {
  min: number;
  max: number;
}
