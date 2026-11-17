import { BindGroup, type WebGPURenderer } from 'pixi.js';
import type { TgpuBindGroup, TgpuBindGroupLayout, TgpuRoot } from 'typegpu';

// PixiJS builds a bind group out of its own kinds of resources, and has no kind that
// could hold a buffer, a texture view or a sampler somebody else created. So TypeGPU
// builds the bind group, and PixiJS is handed the finished one.
const foreignBindGroups = new WeakMap<BindGroup, GPUBindGroup>();
const hookedSystems = new WeakSet<object>();

/**
 * Makes `renderer` use the bind groups registered by `foreignBindGroup` as they are.
 * Every other bind group is built by PixiJS, as before.
 */
function hookBindGroups(renderer: WebGPURenderer) {
  const system = renderer.bindGroup;
  if (hookedSystems.has(system)) {
    return;
  }
  hookedSystems.add(system);

  const getBindGroup = system.getBindGroup;
  system.getBindGroup = function (bindGroup, program, groupIndex) {
    return (
      foreignBindGroups.get(bindGroup) ?? getBindGroup.call(this, bindGroup, program, groupIndex)
    );
  };
}

/**
 * A PixiJS bind group that stands for `gpuBindGroup`, to put in a shader's `groups`.
 * It holds no resources of its own, so PixiJS has nothing to update or upload for it.
 */
export function foreignBindGroup(renderer: WebGPURenderer, gpuBindGroup: GPUBindGroup): BindGroup {
  hookBindGroups(renderer);
  const bindGroup = new BindGroup();
  foreignBindGroups.set(bindGroup, gpuBindGroup);
  return bindGroup;
}

type Unwrapper = Parameters<TgpuBindGroupLayout['unwrap']>[0];

/**
 * The entries TypeGPU creates a bind group layout with. A pipeline whose layout
 * has the same entries accepts bind groups made with TypeGPU's layout.
 */
export function layoutEntriesOf(layout: TgpuBindGroupLayout): GPUBindGroupLayoutEntry[] {
  let entries: GPUBindGroupLayoutEntry[] | undefined;
  const recorder = {
    device: {
      createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor) {
        entries = [...descriptor.entries];
        return {} as GPUBindGroupLayout;
      },
    },
  };
  layout.unwrap(recorder as unknown as Unwrapper);
  return entries ?? [];
}

/** The resources a shader reads without having been given them through a bind group layout */
export interface FixedResources {
  /** The index of their bind group in the shader */
  readonly index: number;
  readonly layoutEntries: GPUBindGroupLayoutEntry[];
  readonly bindGroup: GPUBindGroup;
}

export function fixedResourcesOf(
  root: TgpuRoot,
  index: number,
  bindGroup: TgpuBindGroup,
): FixedResources {
  return {
    index,
    layoutEntries: layoutEntriesOf(bindGroup.layout),
    bindGroup: bindGroup.unwrap(root),
  };
}
