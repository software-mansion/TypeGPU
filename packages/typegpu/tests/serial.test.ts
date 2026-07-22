import { describe, expect, vi } from 'vitest';
import { tgpu, d, type TgpuRoot } from 'typegpu';
import { deepEqual } from 'typegpu/data';
import { isNonTransferableResource, restoreResource, snapshotResource } from 'typegpu/~internal';
import { it } from 'typegpu-testing-utility';

function roundTrip<T>(value: T, root: TgpuRoot): T {
  const snapshot = snapshotResource(value);
  if (!snapshot) {
    throw new Error('Expected the value to be snapshotable.');
  }
  return restoreResource(snapshot, {
    getRoot: (device) => {
      expect(device).toBe(root.device);
      return root;
    },
  }) as T;
}

describe('resource snapshot protocol', () => {
  it('round-trips buffers and buffer bindings', ({ root }) => {
    const buffer = root.createBuffer(d.arrayOf(d.u32, 3)).$usage('storage', 'indirect');
    const rawBuffer = root.unwrap(buffer);

    const restored = roundTrip(buffer, root);
    expect(restored.usableAsUniform).toBe(false);
    expect(restored.usableAsStorage).toBe(true);
    expect(restored.usableAsVertex).toBe(false);
    expect(restored.usableAsIndex).toBe(false);
    expect(restored.usableAsIndirect).toBe(true);
    expect(restored.root.device).toBe(root.device);
    expect(root.unwrap(restored)).toBe(rawBuffer);

    const uniform = root.createUniform(d.vec2f, d.vec2f(1, 2));
    const restoredUniform = roundTrip(uniform, root);
    expect(restoredUniform.resourceType).toBe('uniform');
    expect(root.unwrap(restoredUniform.buffer)).toBe(root.unwrap(uniform.buffer));
  });

  it('round-trips bind group layouts, bind groups and textures', ({ root }) => {
    const layout = tgpu
      .bindGroupLayout({
        video: { externalTexture: d.textureExternal(), visibility: ['fragment'] },
        color: {
          texture: d.texture2d(d.f32),
          sampleType: 'unfilterable-float',
          visibility: ['fragment'],
        },
        target: {
          storageTexture: d.textureStorage3d('rgba8unorm', 'read-write'),
          visibility: ['compute'],
        },
        cells: { storage: d.arrayOf(d.vec4f), access: 'mutable', visibility: ['compute'] },
      })
      .$idx(2);

    const restoredLayout = roundTrip(layout, root);
    expect(restoredLayout.index).toBe(2);
    const { cells, ...staticEntries } = restoredLayout.entries;
    const { cells: _, ...originalStaticEntries } = layout.entries;
    expect(staticEntries).toEqual(originalStaticEntries);
    if (cells?.storage && 'type' in cells.storage && d.isWgslArray(cells.storage)) {
      expect(cells.storage.elementCount).toBe(0);
      expect(cells.storage.elementType).toBe(d.vec4f);
    } else {
      throw new Error('Expected a runtime-sized array storage layout entry.');
    }

    const groupLayout = tgpu.bindGroupLayout({
      values: { storage: d.arrayOf(d.u32, 4), access: 'mutable' },
    });
    const buffer = root.createBuffer(d.arrayOf(d.u32, 4)).$usage('storage');
    const bindGroup = root.createBindGroup(groupLayout, { values: buffer });
    const restoredGroup = roundTrip(bindGroup, root);
    expect(restoredGroup.resourceType).toBe('bind-group');
    expect(restoredGroup.unwrap(root)).toBe(root.unwrap(bindGroup));

    const texture = root
      .createTexture({ size: [2, 2], format: 'rgba8unorm' })
      .$usage('sampled', 'render');
    const rawTexture = root.unwrap(texture);
    const restoredTexture = roundTrip(texture, root);
    expect(restoredTexture.props).toEqual(texture.props);
    expect(restoredTexture.usableAsSampled).toBe(true);
    expect(restoredTexture.usableAsStorage).toBe(false);
    expect(restoredTexture.usableAsRender).toBe(true);
    expect(root.unwrap(restoredTexture)).toBe(rawTexture);
  });

  it('round-trips compute, render and guarded compute pipelines', ({ root }) => {
    const querySet = root.createQuerySet('timestamp', 2);
    const callback = vi.fn();
    const computePipeline = root
      .createComputePipeline({
        compute: tgpu.computeFn({ workgroupSize: [1] })(() => {
          'use gpu';
        }),
      })
      .withTimestampWrites({
        querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      })
      .withPerformanceCallback(callback);

    const computeSnapshot = snapshotResource(roundTrip(computePipeline, root));
    if (computeSnapshot?.type !== 'compute-pipeline') {
      throw new Error('Expected a compute pipeline snapshot');
    }
    expect(computeSnapshot.performanceCallback).toBe(callback);
    expect(computeSnapshot.timestampWrites?.beginningOfPassWriteIndex).toBe(0);
    expect(computeSnapshot.timestampWrites?.endOfPassWriteIndex).toBe(1);

    const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec2f));
    const vertexBuffer = root.createBuffer(vertexLayout.schemaForCount(3)).$usage('vertex');
    const shelledFragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
      'use gpu';
      return d.vec4f(1, 0, 0, 1);
    });
    const renderPipeline = root
      .createRenderPipeline({
        attribs: { position: vertexLayout.attrib },
        vertex: ({ position }) => {
          'use gpu';
          return { $position: d.vec4f(position, 0, 1) };
        },
        fragment: shelledFragment,
        targets: { format: 'rgba8unorm' },
      })
      .with(vertexLayout, vertexBuffer);

    const renderSnapshot = snapshotResource(roundTrip(renderPipeline, root));
    if (renderSnapshot?.type !== 'render-pipeline') {
      throw new Error('Expected a render pipeline snapshot');
    }
    // Shelled fragments carry their output on the descriptor, not the memo
    expect(renderSnapshot.fragmentOut).toMatchInlineSnapshot(`
      {
        "attribs": [
          {
            "type": "location",
            "value": 0,
          },
        ],
        "inner": {
          "key": "vec4f",
          "type": "d",
        },
        "type": "decorated",
      }
    `);
    expect(renderSnapshot.usedVertexLayouts).toEqual([vertexLayout]);
    expect(renderSnapshot.vertexBuffers).toEqual([[vertexLayout, vertexBuffer]]);

    const groupLayout = tgpu.bindGroupLayout({
      values: { storage: d.arrayOf(d.u32, 4), access: 'mutable' },
    });
    const buffer = root.createBuffer(d.arrayOf(d.u32, 4)).$usage('storage');
    const bindGroup = root.createBindGroup(groupLayout, { values: buffer });
    const guarded = root
      .createGuardedComputePipeline((x: number, y: number) => {
        'use gpu';
        groupLayout.$.values[x + y] = x;
      })
      .with(bindGroup);

    const guardedSnapshot = snapshotResource(roundTrip(guarded, root));
    if (guardedSnapshot?.type !== 'guarded-compute-pipeline') {
      throw new Error('Expected a guarded compute pipeline snapshot');
    }
    expect(guardedSnapshot.workgroupSize).toEqual([16, 16, 1]);
    expect(guardedSnapshot.sizeUniform.resourceType).toBe('uniform');
    const innerSnapshot = snapshotResource(guardedSnapshot.pipeline);
    if (innerSnapshot?.type !== 'compute-pipeline') {
      throw new Error('Expected a compute pipeline snapshot');
    }
    expect(innerSnapshot.bindGroups.some(([, group]) => group === bindGroup)).toBe(true);
  });

  it('round-trips slots, accessors, consts, samplers, query sets and vertex layouts', ({
    root,
  }) => {
    const slot = tgpu.slot(42);
    const restoredSlot = roundTrip(slot, root);
    expect(restoredSlot.resourceType).toBe('slot');
    expect(restoredSlot.defaultValue).toBe(42);

    const accessor = tgpu.accessor(d.vec3f, d.vec3f(1, 2, 3));
    const restoredAccessor = roundTrip(accessor, root);
    expect(restoredAccessor.resourceType).toBe('accessor');
    expect(restoredAccessor.schema).toBe(d.vec3f);
    expect(restoredAccessor.defaultValue).toEqual(d.vec3f(1, 2, 3));

    const constant = tgpu['~unstable'].const(d.arrayOf(d.f32, 3), [1, 2, 3]);
    const restoredConst = roundTrip(constant, root);
    expect(restoredConst.resourceType).toBe('const');
    expect(restoredConst.$).toEqual([1, 2, 3]);

    const sampler = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    expect(roundTrip(sampler, root).resourceType).toBe('sampler');
    const comparison = root.createComparisonSampler({ compare: 'less' });
    expect(roundTrip(comparison, root).resourceType).toBe('sampler-comparison');

    const querySet = root.createQuerySet('timestamp', 2);
    const restoredQuerySet = roundTrip(querySet, root);
    expect(restoredQuerySet.resourceType).toBe('query-set');
    expect(restoredQuerySet.type).toBe('timestamp');
    expect(restoredQuerySet.count).toBe(2);
    expect(restoredQuerySet.querySet).toBe(querySet.querySet);

    const vertexLayout = tgpu.vertexLayout(
      (count) => d.arrayOf(d.struct({ position: d.location(0, d.vec2f) }), count),
      'instance',
    );
    const restoredVertexLayout = roundTrip(vertexLayout, root);
    expect(restoredVertexLayout.resourceType).toBe('vertex-layout');
    expect(restoredVertexLayout.stepMode).toBe(vertexLayout.stepMode);
    expect(restoredVertexLayout.stride).toBe(vertexLayout.stride);
    expect(deepEqual(restoredVertexLayout.schemaForCount(4), vertexLayout.schemaForCount(4))).toBe(
      true,
    );
  });

  it('round-trips vector and matrix instances, rejects non-transferable resources', ({ root }) => {
    const vec = d.vec3f(1.5, -2, 3.25);
    const restoredVec = roundTrip(vec, root);
    expect(restoredVec).not.toBe(vec);
    expect(restoredVec).toEqual(vec);

    const mat = d.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9);
    expect(roundTrip(mat, root)).toEqual(mat);

    const view = root
      .createTexture({ size: [2, 2], format: 'rgba8unorm' })
      .$usage('sampled')
      .createView();
    expect(snapshotResource(view)).toBeUndefined();
    expect(isNonTransferableResource(view)).toBe(true);
  });
});
