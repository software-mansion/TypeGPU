import { describe, expect, it } from 'vitest';
import type { SchemaArtifact } from '../src/artifact.ts';
import { captureFixture } from './utils/capture.ts';

describe('captured artifact', async () => {
  const { artifact, emit } = await captureFixture('artifact.ts', {
    stripLogs: false,
    minify: false,
    wgslLanguageFeatures: ['immediate_address_space'],
  });
  const schema = (id: number | undefined) => artifact.schemas[id ?? -1] as SchemaArtifact;
  const [step] = artifact.computePipelines;
  const [draw] = artifact.renderPipelines;

  it('is plain data', () => {
    expect(JSON.parse(JSON.stringify(artifact))).toStrictEqual(artifact);
  });

  it("keeps the arrow's result as a tree of references", () => {
    expect(artifact.surface).toStrictEqual({
      kind: 'object',
      entries: {
        World: { kind: 'schema', id: 0 },
        layout: { kind: 'layout', id: 0 },
        instances: { kind: 'vertexLayout', id: 0 },
        step: { kind: 'computePipeline', id: 0 },
        draw: { kind: 'renderPipeline', id: 0 },
        Packed: { kind: 'schema', id: expect.any(Number) },
        pinned: { kind: 'layout', id: expect.any(Number) },
      },
    });
  });

  it('lays unstructs out packed, with the size of every leaf', () => {
    const { entries } = artifact.surface as { entries: Record<string, { id: number }> };
    const packed = schema(entries.Packed?.id);
    expect(packed).toMatchObject({ type: 'unstruct', name: 'Packed', size: 16, offsets: [0, 4] });
    const props = (packed as unknown as { props: [string, SchemaArtifact][] }).props;
    expect(props.map(([, prop]) => prop)).toMatchObject([
      { type: 'd', key: 'unorm8x4', size: 4 },
      { type: 'd', key: 'float32x3', size: 12 },
    ]);
  });

  it('keeps the index a layout is pinned to', () => {
    const { entries } = artifact.surface as { entries: Record<string, { id: number }> };
    expect(artifact.layouts[entries.pinned?.id ?? -1]).toMatchObject({ name: 'pinned', index: 2 });
    expect(artifact.layouts[0]?.index).toBeUndefined();
  });

  it('describes schemas with their names and memory layout, nested ones too', () => {
    const world = schema(0);
    expect(world).toMatchObject({ type: 'struct', name: 'World', size: 80, align: 16 });
    expect(world.offsets).toStrictEqual([0, 64]);
    type Node = SchemaArtifact & { element: SchemaArtifact };
    const [[, particles]] = (world as unknown as { props: [string, Node][] }).props as [
      [string, Node],
    ];
    expect(particles).toMatchObject({ type: 'array', count: 4, size: 64, stride: 16 });
    expect(particles.element).toMatchObject({ name: 'Particle', offsets: [0, 12], size: 16 });
  });

  it('names layouts, with the schema of each buffer entry', () => {
    const layout = artifact.layouts[0]!;
    expect(layout.name).toBe('layout');
    expect(layout.keys).toStrictEqual(['world', 'particles']);
    expect(schema(layout.schemas?.[0] ?? undefined).name).toBe('World');
    // Runtime-sized
    expect(schema(layout.schemas?.[1] ?? undefined)).toMatchObject({
      type: 'array',
      count: 0,
      size: 0,
    });
  });

  it('names vertex layouts, with the schema of their elements', () => {
    const [instances] = artifact.vertexLayouts;
    expect(instances).toMatchObject({ name: 'instances', stepMode: 'instance', arrayStride: 16 });
    expect(schema(instances?.schema).name).toBe('Particle');
    expect(draw?.vertexSlots).toStrictEqual([0]);
  });

  it('records the immediate pipelines read', () => {
    expect(step?.immediate?.name).toBe('frame');
    expect(schema(step?.immediate?.schema).name).toBe('Frame');
    expect(draw?.immediate).toStrictEqual(step?.immediate);
  });

  it("describes kept logs, whose buffers are in the pipeline's fixed bind group", () => {
    const logs = step?.logs;
    expect(logs).toMatchObject({ capacity: 64, words: 63 });
    expect(logs?.calls).toStrictEqual([{ id: 1, op: 'log', args: ['mass', { schema: 6 }] }]);
    expect(schema(6)).toMatchObject({ type: 'd', key: 'f32' });
    const group = step?.groups[logs?.group ?? -1];
    const bindGroup = artifact.bindGroups[group?.bindGroup ?? -1];
    expect(bindGroup?.entries[logs?.counterBinding ?? -1]).toBeTruthy();
    expect(bindGroup?.entries[logs?.entriesBinding ?? -1]).toBeTruthy();
  });

  it('names color targets after the fragment outputs, leaving unset formats to the host', () => {
    expect(draw?.targetKeys).toStrictEqual(['color', 'glow']);
    expect(draw?.preferredFormatTargets).toStrictEqual([0]);
    expect(draw?.descriptor.fragment?.targets).toStrictEqual([{}, { format: 'rgba16float' }]);
  });

  it('refuses to emit immediates for the pruned runtime, naming where they are', () => {
    expect(() => emit(artifact, { async: false })).toThrow(
      /result\.step: immediates are not supported yet/,
    );
  });
});

describe('captured artifact with logs stripped', async () => {
  const { artifact } = await captureFixture('artifact.ts', {
    wgslLanguageFeatures: ['immediate_address_space'],
  });

  it('has no logs, and no fixed bind group for them', () => {
    const [step] = artifact.computePipelines;
    expect(step?.logs).toBeUndefined();
    expect(step?.groups.every((group) => group?.bindGroup === undefined)).toBe(true);
  });
});
