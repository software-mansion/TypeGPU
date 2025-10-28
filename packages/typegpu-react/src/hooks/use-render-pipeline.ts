import { useContext } from 'react';
import { PipelineContext } from '../context/pipeline-context.ts';

export const useRenderPipeline = () => useContext(PipelineContext);
