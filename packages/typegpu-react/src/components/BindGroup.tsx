import { useEffect, useMemo } from 'react';
import type { TgpuBindGroupLayout } from 'typegpu';
import type { AnyData } from 'typegpu/data';
import { useCanvas } from '../hooks/use-canvas.ts';
import { usePass } from '../hooks/use-pass.ts';

type Entries<T extends Record<string, AnyData>> = {
  [K in keyof T]: any; // Using 'any' to match the expected value types for buffers, textures, etc.
};

interface BindGroupProps<T extends Record<string, AnyData>> {
  /**
   * The layout for the bind group.
   */
  layout: TgpuBindGroupLayout<T>;
  /**
   * An object containing the resources to be bound.
   * The keys must match the keys in the layout definition.
   */
  entries: Entries<T>;
}

export function BindGroup<T extends Record<string, AnyData>>({
  layout,
  entries,
}: BindGroupProps<T>) {
  const { root } = useCanvas();
  const { addDrawCall } = usePass();

  const bindGroup = useMemo(() => {
    // It's important that the values in `entries` are stable (e.g., memoized)
    // to avoid recreating the bind group on every render.
    return root.createBindGroup(layout, entries);
  }, [root, layout, entries]);

  useEffect(() => {
    const removeDrawCall = addDrawCall((pass) => {
      // The group index is derived from the layout object itself.
      pass.setBindGroup(layout.groupIndex, bindGroup);
    });

    return removeDrawCall;
  }, [addDrawCall, layout.groupIndex, bindGroup]);

  // This component does not render anything to the DOM.
  return null;
}