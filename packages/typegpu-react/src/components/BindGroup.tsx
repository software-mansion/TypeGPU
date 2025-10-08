import { useMemo } from 'react';
import { useRoot } from '../context/root-context';
import type { TgpuBindGroupLayout, BindGroupEntries } from 'typegpu';

export function BindGroup({
  layout,
  entries,
}: {
  layout: BindGroupLayout<any>;
  entries: BindGroupEntries;
}) {
  const root = useRoot();

  const bindGroup = useMemo(() => {
    return root.device.createBindGroup({
      layout: layout.gpuLayout,
      entries: layout.createEntries(entries),
    });
  }, [root, layout, entries]);

  // This component doesn't render anything itself. It will be used by other
  // components to access the created bind group.
  return null;
}
