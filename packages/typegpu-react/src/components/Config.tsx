import type React from 'react';
import { useMemo } from 'react';
import type { Configurable, TgpuRenderPipeline, TgpuSlot } from 'typegpu';
import { PipelineContext } from '../context/pipeline-context.ts';
import { useRenderPipeline } from '../hooks/use-render-pipeline.ts';

type Binding =
  | [slot: TgpuSlot<any>, value: any]
  | ((cfg: Configurable) => Configurable);

interface ConfigProps {
  bindings: Binding[];
  children: React.ReactNode;
}

export function Config({ bindings, children }: ConfigProps) {
  const pipeline = useRenderPipeline();

  const configuredPipeline = useMemo(() => {
    if (!pipeline) return null;
    return bindings.reduce((p, binding) => {
      if (Array.isArray(binding)) {
        return p.with(binding[0], binding[1]);
      }
      return p.pipe(binding);
    }, pipeline as Configurable) as TgpuRenderPipeline;
  }, [pipeline, bindings]);

  if (!pipeline) {
    return <>{children}</>;
  }

  // This re-provides the configured pipeline to children
  return (
    <PipelineContext.Provider value={configuredPipeline}>
      {children}
    </PipelineContext.Provider>
  );
}
