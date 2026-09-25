import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export interface Report {
  runtime: string;
  cpu?: string | undefined;
  runs: { implementation: string; unsupported?: boolean; results: Record<string, number[]> }[];
}
export function median(xs: number[]): number {
  const a = xs.toSorted((x, y) => x - y);
  const i = Math.floor(a.length / 2);
  return a.length % 2 ? (a[i] as number) : ((a[i - 1] as number) + (a[i] as number)) / 2;
}
function timing(r: Report, impl: string, key: string) {
  const xs = r.runs
    .filter((x) => x.implementation === impl && x.results[key])
    .map((x) => median(x.results[key] as number[]));
  return xs.length ? median(xs) : undefined;
}
export function render(current: Report, target?: Report) {
  const lines = [
    '## Abstract vector CPU benchmark',
    '',
    `${current.runtime}, ${current.cpu}. Median ns/op; lower is better. Ratios compare TypeGPU with the fastest measured plain-JS contender.`,
    '',
    '| Workload | Object | Class | Array | TypeGPU | JS / TypeGPU | Target TypeGPU | Target / PR |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const key of Object.keys(current.runs[0]?.results ?? {})) {
    const plain = ['object', 'class', 'array'].map((impl) => timing(current, impl, key) as number);
    const actual = timing(current, 'typegpu', key);
    const old = target && timing(target, 'typegpu', key);
    lines.push(
      `| ${key} | ${plain.map((x) => x.toFixed(1)).join(' | ')} | ${actual?.toFixed(1) ?? 'N/A'} | ${actual ? (Math.min(...plain) / actual).toFixed(2) + '×' : 'N/A'} | ${old?.toFixed(1) ?? 'N/A'} | ${old && actual ? (old / actual).toFixed(2) + '×' : 'N/A'} |`,
    );
  }
  lines.push(
    '',
    'Fresh processes, varying inputs, fresh result objects, escaped allocations, and component-wise correctness checks. JS / TypeGPU near 1× means parity. Noise at nanosecond scales and shared CI runners can be substantial; results are advisory, not a timing gate. N/A means the target does not expose abstract vectors.',
  );
  return lines.join('\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const current = JSON.parse(readFileSync(process.argv[2] as string, 'utf8'));
  const target = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : undefined;
  console.log(render(current, target));
}
