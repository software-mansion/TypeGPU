import { createHash } from 'node:crypto';
import type { LogEntry } from './mockGpu.ts';

const hash = (text: string) => createHash('sha1').update(text).digest('hex').slice(0, 10);

type Desc = Record<string, unknown>;

/**
 * Describes the GPU work in a log by content instead of object identity, so that
 * logs of two builds of the same app can be compared.
 */
export function describeGpuWork(log: LogEntry[]) {
  const byRef = new Map(log.map((entry) => [`#${entry.kind}${entry.id}`, entry]));

  const contents = new Map<number, number[]>();
  for (const entry of log) {
    const desc = entry.desc as Desc;
    if (entry.kind === 'buffer') {
      contents.set(
        entry.id,
        Array.from({ length: desc.size as number }, () => 0),
      );
    }
    if (entry.kind === 'buffer.initialData' || entry.kind === 'queue.writeBuffer') {
      const target = contents.get(entry.id) as number[];
      (desc.bytes as number[]).forEach((byte, idx) => {
        target[(desc.offset as number) + idx] = byte;
      });
    }
  }

  const key = (value: unknown): unknown => {
    if (typeof value !== 'string' || !value.startsWith('#')) {
      return value;
    }
    const entry = byRef.get(value) as LogEntry;
    const desc = entry.desc as Desc;
    switch (entry.kind) {
      case 'buffer':
        return `buffer(${desc.size}, ${desc.usage}, ${hash((contents.get(entry.id) ?? []).join(','))})`;
      case 'shaderModule':
        // Precompiled WGSL has no comments
        return `shader(${hash(
          (desc.code as string)
            .replace(/\/\/[^\n]*/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\s+/g, ''),
        )})`;
      case 'bindGroupLayout':
        return `layout(${JSON.stringify(desc.entries)})`;
      case 'pipelineLayout':
        return `pipelineLayout(${(desc.bindGroupLayouts as string[]).map(key).join(';')})`;
      case 'bindGroup':
        return `bindGroup(${key(desc.layout)}; ${(desc.entries as Desc[])
          .map((e) => `${e.binding}=${key((e.resource as Desc).buffer ?? e.resource)}`)
          .join(',')})`;
      default:
        return `${entry.kind}(${JSON.stringify(normalize(desc))})`;
    }
  };

  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(normalize);
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([name]) => name !== 'label')
          .toSorted(([a], [b]) => a.localeCompare(b))
          .map(([name, item]) => [name, normalize(item)]),
      );
    }
    return key(value);
  };

  return log
    .filter((entry) =>
      /^(computePass|renderPass|renderBundleEncoder)\.|^commandEncoder\.begin/.test(entry.kind),
    )
    .map((entry) => {
      // Trailing defaults and empty pass descriptors don't change the work
      const args = (entry.desc as unknown[]).filter((arg) => arg !== null && arg !== undefined);
      const isDefault = (arg: unknown, idx: number) =>
        (entry.kind.endsWith('.draw') && ((idx >= 2 && arg === 0) || (idx === 1 && arg === 1))) ||
        (entry.kind.endsWith('.dispatchWorkgroups') && idx >= 1 && arg === 1) ||
        (entry.kind.endsWith('beginComputePass') && JSON.stringify(normalize(arg)) === '{}');
      while (args.length > 0 && isDefault(args.at(-1), args.length - 1)) {
        args.pop();
      }
      return `${entry.kind.split('.')[1]}(${JSON.stringify(normalize(args))})`;
    });
}
