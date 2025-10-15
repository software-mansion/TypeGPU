import { createContext } from "react";
import type { TgpuRenderPipeline } from "typegpu";

export const PipelineContext = createContext<TgpuRenderPipeline | null>(null);
