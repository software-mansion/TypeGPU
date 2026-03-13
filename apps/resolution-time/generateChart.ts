import { readFileSync, writeFileSync } from 'node:fs';
import type { BenchmarkResult } from './procedural.ts';

interface Dataset {
  label: string;
  data: BenchmarkResult[];
}

const args = process.argv.slice(2);

const inputs: Dataset[] = [];
let title = '';
let output = '';
let xAxisTitle = '';
let yAxisTitle = '';

// parsing arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--input') {
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const [label, filepath] = args[++i]!.split(':', 2);
    inputs.push({
      label: label as string,
      data: JSON.parse(readFileSync(filepath as string, 'utf8')),
    });
  } else if (args[i] === '--title') {
    if (title !== '') {
      throw new Error('Ambiguous title');
    }
    // oxlint-disable-next-line typescript/no-non-null-assertion
    title = args[++i]!;
  } else if (args[i] === '--output') {
    if (output !== '') {
      throw new Error('Ambiguous output');
    }
    // oxlint-disable-next-line typescript/no-non-null-assertion
    output = args[++i]!;
  } else if (args[i] === '--xAxisTitle') {
    if (xAxisTitle !== '') {
      throw new Error('Ambiguous xAxisTitle');
    }
    // oxlint-disable-next-line typescript/no-non-null-assertion
    xAxisTitle = args[++i]!;
  } else if (args[i] === '--yAxisTitle') {
    if (yAxisTitle !== '') {
      throw new Error('Ambiguous yAxisTitle');
    }
    // oxlint-disable-next-line typescript/no-non-null-assertion
    yAxisTitle = args[++i]!;
  }
}

if (inputs.length === 0) {
  throw new Error('No input path provided');
}

if (inputs.length > 3) {
  throw new Error('Inputs are limited to 3');
}

if (title === '') {
  throw new Error('No title provided');
}

function median(values: number[]): number {
  // oxlint-disable-next-line  eslint-plugin-unicorn(no-array-sort)
  const sorted = values.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // oxlint-disable-next-line typescript/no-non-null-assertion
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// oxlint-disable-next-line  eslint-plugin-unicorn(no-array-sort)
const allDepths = [...new Set(inputs.flatMap((ds) => ds.data.map((d) => d.maxDepth)))].sort(
  (a, b) => a - b,
);

// mermaid chart
const lines: string[] = [];

const symbols = ['\u{1f534}', '\u{1f535}', '\u{1f7e2}'];
const legend = inputs.map((ds, i) => `${symbols[i]} ${ds.label}`).join(' | ');

lines.push('```mermaid');
lines.push(`---
config:
  themeVariables:
    xyChart:
      plotColorPalette: "#E63946, #3B82F6, #059669"
---`);
lines.push('xychart');
lines.push(`  title "${title} (${legend})"`);
lines.push(`  x-axis "${xAxisTitle ? xAxisTitle : ' '}" [${allDepths.join(', ')}]`);
lines.push(`  y-axis "${yAxisTitle ? yAxisTitle : ' '}"`);

for (const ds of inputs) {
  const medians = allDepths.map((depth) => {
    const times = ds.data.filter((d) => d.maxDepth === depth).map((d) => d.timeMs);
    return times.length ? median(times).toFixed(2) : '0';
  });
  lines.push(`  line [${medians.join(', ')}]`);
}

lines.push('```');

const md = lines.join('\n');

if (output) {
  writeFileSync(output, md);
} else {
  console.log(md);
}
