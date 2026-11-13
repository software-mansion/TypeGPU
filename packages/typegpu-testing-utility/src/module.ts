import type { TgpuCommandEncoder, TgpuComputePass, TgpuRenderCommands, TgpuRoot } from 'typegpu';
import { expect, type Mock } from 'vitest';
import type {
  MockCommandEncoder,
  MockComputePassEncoder,
  MockDevice,
  MockRenderPassEncoder,
} from './extendedIt.ts';

/**
 * Lifecycle every module instance has, on top of at least one recording method.
 */
export interface ModuleInstanceLifecycle {
  initSync(): void;
  initAsync(): Promise<void>;
  destroy(): void;
  [Symbol.dispose](): void;
}

export interface Steppable {
  step(pass: TgpuComputePass | GPUComputePassEncoder): void;
}

export interface Drawable {
  draw(pass: TgpuRenderCommands | GPURenderPassEncoder | GPURenderBundleEncoder): void;
}

export interface Recordable {
  record(encoder: TgpuCommandEncoder | GPUCommandEncoder): void;
}

export type ModuleInstance = ModuleInstanceLifecycle & (Steppable | Drawable | Recordable);

/**
 * The shape every ecosystem module namespace has. Check it with a type test:
 *
 * @example
 * ```ts
 * import * as bitonicSort from '../src/bitonic/index.ts';
 *
 * bitonicSort satisfies ModuleNamespace<
 *   BitonicSortOptions,
 *   BitonicSortIo,
 *   BitonicSortDefinition,
 *   BitonicSortInstance
 * >;
 * ```
 */
export interface ModuleNamespace<
  TOptions,
  TIo,
  TDefinition,
  TInstance extends ModuleInstance = ModuleInstance,
> {
  define(root: TgpuRoot, options: TOptions): TDefinition;
  instantiate(root: TgpuRoot, definition: TDefinition, io: TIo): TInstance;
  defineAndInstantiate(root: TgpuRoot, options: TOptions, io: TIo): TInstance;
}

export interface RecordingMocks {
  device: MockDevice;
  commandEncoder: MockCommandEncoder;
  computePassEncoder: MockComputePassEncoder;
  renderPassEncoder: MockRenderPassEncoder;
}

interface RecordedCall {
  method: string;
  args: unknown[];
  order: number;
}

function callsSince(
  source: string,
  target: object,
  since: Map<Mock, number>,
  into: RecordedCall[],
): void {
  for (const [method, fn] of Object.entries(target)) {
    if (method === 'mock' || typeof fn !== 'function' || !('mock' in fn)) {
      continue;
    }
    const spy = fn as Mock;
    const start = since.get(spy) ?? 0;
    spy.mock.calls.slice(start).forEach((args, i) => {
      into.push({
        method: `${source}.${method}`,
        args,
        order: spy.mock.invocationCallOrder[start + i] ?? 0,
      });
    });
  }
}

function snapshotCounts(targets: object[]): Map<Mock, number> {
  const counts = new Map<Mock, number>();
  for (const target of targets) {
    for (const [method, fn] of Object.entries(target)) {
      if (method !== 'mock' && typeof fn === 'function' && 'mock' in fn) {
        counts.set(fn as Mock, (fn as Mock).mock.calls.length);
      }
    }
  }
  return counts;
}

/**
 * Runs `record` and returns every command it recorded, in order, without touching the mocks.
 */
export function recordCommands(mocks: RecordingMocks, record: () => void): RecordedCall[] {
  const sources = {
    queue: mocks.device.mock.queue,
    commandEncoder: mocks.commandEncoder.mock,
    computePass: mocks.computePassEncoder.mock,
    renderPass: mocks.renderPassEncoder.mock,
  };
  const before = snapshotCounts(Object.values(sources));

  record();

  const calls: RecordedCall[] = [];
  for (const [name, target] of Object.entries(sources)) {
    callsSince(name, target, before, calls);
  }
  return calls.toSorted((a, b) => a.order - b.order);
}

function strip(calls: RecordedCall[]) {
  return calls.map(({ method, args }) => ({ method, args }));
}

/**
 * The recording test from the module API rules: `record` is called twice, and neither call may
 * submit or write to the queue. Both calls have to record the same commands.
 *
 * @example
 * ```ts
 * it('only records', ({ root, device, commandEncoder, computePassEncoder, renderPassEncoder }) => {
 *   const sorter = bitonicSort.defineAndInstantiate(root, {}, { keys });
 *   const encoder = root.createCommandEncoder();
 *   const pass = encoder.beginComputePass();
 *   expectRecordingOnly(
 *     { device, commandEncoder, computePassEncoder, renderPassEncoder },
 *     () => sorter.step(pass),
 *   );
 * });
 * ```
 */
export function expectRecordingOnly(mocks: RecordingMocks, record: () => void): void {
  const first = strip(recordCommands(mocks, record));
  const second = strip(recordCommands(mocks, record));

  for (const calls of [first, second]) {
    const queueCalls = calls.filter((call) => call.method.startsWith('queue.'));
    expect(
      queueCalls.map((call) => call.method),
      'recording methods must not submit or write to the queue',
    ).toEqual([]);
  }

  expect(first.length, 'the recording has to record something').toBeGreaterThan(0);
  expect(second, 'recording twice has to record the same commands').toEqual(first);
}
