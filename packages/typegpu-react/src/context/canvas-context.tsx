import { createContext } from "react";
import type { TgpuRoot } from "typegpu";

export interface CanvasContextValue {
  root: TgpuRoot;
  context: GPUCanvasContext;
  addFrameCallback: (cb: (time: number) => void) => () => void;
}

export const CanvasContext = createContext<CanvasContextValue | null>(null);
