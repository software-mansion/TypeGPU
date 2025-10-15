import { useContext } from "react";
import { PipelineContext } from "../context/pipeline-context.tsx";

export const useRenderPipeline = () => useContext(PipelineContext);
