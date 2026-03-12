import { generateDrawnTrack, generateGridTrack, type TrackResult } from './track.ts';

export type BaseCarParams = {
  maxSpeed: number;
  accel: number;
  turnRate: number;
  drag: number;
  sensorDistance: number;
  carSize: number;
};

export const GRID_SIZES = {
  S: [5, 4],
  M: [8, 6],
  L: [10, 9],
  XL: [14, 12],
} as const;

export const GRID_SIZE_KEYS = Object.keys(GRID_SIZES) as GridSizeKey[];

export type GridSizeKey = keyof typeof GRID_SIZES;

type TrackStateOptions = {
  baseCar: BaseCarParams;
  applyTrack: (result: TrackResult) => void;
  applyCarParams: (params: BaseCarParams) => void;
  initialGridSizeKey?: GridSizeKey;
};

function scaleCarParams(baseCar: BaseCarParams, scale: number): BaseCarParams {
  return {
    maxSpeed: baseCar.maxSpeed * scale,
    accel: baseCar.accel * scale,
    turnRate: baseCar.turnRate * scale,
    drag: baseCar.drag * scale,
    sensorDistance: baseCar.sensorDistance * scale,
    carSize: baseCar.carSize * scale,
  };
}

export function createTrackState({
  baseCar,
  applyTrack,
  applyCarParams,
  initialGridSizeKey = 'S',
}: TrackStateOptions) {
  let trackSeed = (Math.random() * 100_000) | 0;
  let gridSizeKey = initialGridSizeKey;

  function applyGridSize(width: number, height: number) {
    const scale = 5 / Math.max(width, height);
    applyCarParams(scaleCarParams(baseCar, scale));
  }

  function getGridSize() {
    return GRID_SIZES[gridSizeKey];
  }

  function buildDrawnTrack(points: Float32Array, aspect: number): TrackResult {
    const [width, height] = getGridSize();
    return generateDrawnTrack(points, 0.172 * (1.6 / Math.max(width, height)), aspect);
  }

  function applyCurrentGridTrack(aspect = 1) {
    const [width, height] = getGridSize();
    applyGridSize(width, height);
    applyTrack(generateGridTrack(trackSeed, width, height, aspect));
  }

  function previewDrawnTrack(points: Float32Array, aspect: number) {
    applyTrack(buildDrawnTrack(points, aspect));
  }

  function confirmDrawnTrack(points: Float32Array, aspect: number) {
    const [width, height] = getGridSize();
    applyGridSize(width, height);
    applyTrack(buildDrawnTrack(points, aspect));
  }

  function newTrack(aspect = 1) {
    trackSeed = (Math.random() * 100_000) | 0;
    applyCurrentGridTrack(aspect);
  }

  return {
    get gridSizeKey() {
      return gridSizeKey;
    },

    setGridSize(nextGridSizeKey: GridSizeKey) {
      gridSizeKey = nextGridSizeKey;
    },

    applyCurrentGridTrack,
    previewDrawnTrack,
    confirmDrawnTrack,
    newTrack,
  };
}
