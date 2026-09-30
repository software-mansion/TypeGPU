import * as v8 from 'node:v8';
import * as vm from 'node:vm';
import { describe, expect } from 'vitest';
import { d, tgpu, type TgpuRoot } from 'typegpu';
import { it } from 'typegpu-testing-utility';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;

/**
 * Forces garbage collection until every referenced object is collected, or gives up.
 * Returns the labels of the objects that are still alive.
 */
async function collect(refs: Record<string, WeakRef<object>>): Promise<string[]> {
  let alive = Object.keys(refs);
  for (let i = 0; i < 20 && alive.length > 0; i++) {
    // Letting pending promise callbacks and timers drop their references
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc();
    alive = alive.filter((key) => refs[key]?.deref() !== undefined);
  }
  return alive;
}

// Shared between roots on purpose, so that any per-root state cached on them would be caught
const layout = tgpu.bindGroupLayout({
  values: { storage: d.arrayOf(d.f32, 4), access: 'mutable' },
  factor: { uniform: d.f32 },
});

const computeMain = tgpu.computeFn({ workgroupSize: [1] })(() => {
  'use gpu';
  layout.$.values[0] = layout.$.factor * 2;
});

const vertexMain = tgpu.vertexFn({
  in: { idx: d.builtin.vertexIndex },
  out: { pos: d.builtin.position },
})(({ idx }) => {
  'use gpu';
  return { pos: d.vec4f(d.f32(idx), 0, 0, 1) };
});

const fragmentMain = tgpu.fragmentFn({ out: d.vec4f })(() => {
  'use gpu';
  return d.vec4f(1, 0, 0, 1);
});

/**
 * Allocates and uses a variety of resources. Everything created here should only be reachable
 * through the returned weak references once this function returns.
 */
function useRoot(root: TgpuRoot): Record<string, WeakRef<object>> {
  const values = root.createBuffer(d.arrayOf(d.f32, 4), [1, 2, 3, 4]).$usage('storage');
  const factor = root.createBuffer(d.f32, 2).$usage('uniform');
  values.write([5, 6, 7, 8]);

  const uniform = root.createUniform(d.vec4f, d.vec4f(1, 2, 3, 4));
  uniform.write(d.vec4f(4, 3, 2, 1));

  const texture = root
    .createTexture({ size: [16, 16], format: 'rgba8unorm' })
    .$usage('sampled', 'render');
  const sampledView = texture.createView(d.texture2d(d.f32));

  const bindGroup = root.createBindGroup(layout, { values, factor });

  const computePipeline = root.createComputePipeline({ compute: computeMain });
  computePipeline.with(bindGroup).dispatchWorkgroups(1);

  const guardedPipeline = root.createGuardedComputePipeline((x) => {
    'use gpu';
    layout.$.values[x] = layout.$.factor;
  });
  guardedPipeline.with(bindGroup).dispatchThreads(4);

  const renderPipeline = root.createRenderPipeline({
    vertex: vertexMain,
    fragment: fragmentMain,
    targets: { format: 'rgba8unorm' },
  });
  renderPipeline.withColorAttachment({ view: texture, loadOp: 'clear', storeOp: 'store' }).draw(3);

  return {
    root: new WeakRef(root),
    values: new WeakRef(values),
    factor: new WeakRef(factor),
    uniform: new WeakRef(uniform),
    texture: new WeakRef(texture),
    sampledView: new WeakRef(sampledView),
    bindGroup: new WeakRef(bindGroup),
    computePipeline: new WeakRef(computePipeline),
    guardedPipeline: new WeakRef(guardedPipeline),
    renderPipeline: new WeakRef(renderPipeline),
  };
}

describe('garbage collection', () => {
  it('collects a root created from an existing device, along with its resources', async ({
    device,
  }) => {
    // The device outlives the root (it's held by the test fixture), so this also checks that
    // the device doesn't keep the root or its resources alive
    const refs = useRoot(tgpu.initFromDevice({ device }));

    expect(await collect(refs)).toStrictEqual([]);
    expect(device.destroy).not.toHaveBeenCalled();
  });

  it('collects a root that owns its device, along with its resources, without destroying it', async ({
    device,
  }) => {
    const refs = useRoot(await tgpu.init());

    expect(await collect(refs)).toStrictEqual([]);
    expect(device.destroy).not.toHaveBeenCalled();
  });

  it('collects roots independently from each other', async ({ device }) => {
    const kept = tgpu.initFromDevice({ device });
    const keptRefs = useRoot(kept);
    const droppedRefs = useRoot(tgpu.initFromDevice({ device }));

    expect(await collect(droppedRefs)).toStrictEqual([]);
    // Only the root itself is still referenced, its resources can go
    expect(await collect(keptRefs)).toStrictEqual(['root']);
    expect(keptRefs.root?.deref()).toBe(kept);
  });
});
