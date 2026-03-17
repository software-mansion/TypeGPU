import { d, LayoutEntryToInput, TgpuBindGroup, TgpuBindGroupLayout } from 'typegpu';
import { useRoot } from './root-context.tsx';
import { UniformValue } from './use-uniform-value.ts';
import { $buffer } from './symbols.ts';

type ExtractInputFromEntries<T extends TgpuBindGroupLayout['entries']> = {
  [Key in keyof T]: T[Key] extends { uniform: d.BaseData }
    ? LayoutEntryToInput<T[Key]> | UniformValue<T[Key]['uniform'], d.Infer<T[Key]['uniform']>>
    : LayoutEntryToInput<T[Key]>;
};

/**
 * Creates a group of resources that can be bound to a shader based on a specified layout.
 *
 * @remarks
 * Typed wrapper around a GPUBindGroup.
 *
 * @example
 * ```ts
 * const fooLayout = tgpu.bindGroupLayout({
 *  foo: { uniform: d.vec3f },
 *  bar: { texture: 'float' },
 * });
 *
 * function App() {
 *   const fooBuffer = useBuffer(...);
 *   const barTexture = useTexture(...);
 *
 *   const fooBindGroup = useBindGroup(fooLayout, {
 *    foo: fooBuffer,
 *    bar: barTexture,
 *   });
 *
 *   // ...
 * }
 * ```
 *
 * @param layout Layout describing the bind group to be created.
 * @param entries A record with values being the resources populating the bind group
 * and keys being their associated names, matching the layout keys.
 */
export function useBindGroup<TLayout extends TgpuBindGroupLayout>(
  layout: TLayout,
  entries: ExtractInputFromEntries<TLayout['entries']>,
): TgpuBindGroup<TLayout['entries']> {
  const root = useRoot();

  // TODO: Think about memoizing this, and measuring if it's more performant than just recreating
  // this bind group on every React render.
  return root.createBindGroup(
    layout,
    Object.fromEntries(
      Object.entries(entries).map(([key, value]) => {
        if (value[$buffer]) {
          return [key, value[$buffer]];
        }
        return [key, value];
      }),
    ),
  );
}
