import { d } from 'typegpu';

export interface VideoFrameCrop {
  sourceSize: [number, number];
  cropOrigin: [number, number];
  cropSize: [number, number];
}

export const FrameCropParams = d.struct({
  sourceSize: d.vec2u,
  cropOrigin: d.vec2f,
  cropSize: d.vec2f,
});

export const initialFrameCropParams: VideoFrameCrop = {
  sourceSize: [1, 1],
  cropOrigin: [0, 0],
  cropSize: [1, 1],
};

export function squareCrop(sourceWidth: number, sourceHeight: number): VideoFrameCrop {
  const size = Math.min(sourceWidth, sourceHeight);
  return {
    sourceSize: [sourceWidth, sourceHeight],
    cropOrigin: [Math.floor((sourceWidth - size) / 2), Math.floor((sourceHeight - size) / 2)],
    cropSize: [size, size],
  };
}
