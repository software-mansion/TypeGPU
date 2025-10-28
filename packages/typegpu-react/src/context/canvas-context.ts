import { createContext } from 'react';

export interface CanvasContextValue {
  readonly context: GPUCanvasContext | null;
  addFrameCallback: (cb: (time: number) => void) => () => void;
}

export const CanvasContext = createContext<CanvasContextValue | null>(null);
