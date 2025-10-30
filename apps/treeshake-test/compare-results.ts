#!/usr/bin/env node

import * as fs from 'node:fs/promises';
import { arrayOf, type } from 'arktype';

// Define schema for benchmark results
const ResultRecord = type({
  exampleFilename: 'string',
  exampleUrl: 'string',
  bundler: 'string',
  size: 'number',
});

const BenchmarkResults = arrayOf(ResultRecord);

function getSharedBundlers(
  prResults: typeof BenchmarkResults.infer,
  targetResults: typeof BenchmarkResults.infer,
) {
  const prBundlers = new Set(prResults.map((r) => r.bundler));
  const targetBundlers = new Set(targetResults.map((r) => r.bundler));
  return [...prBundlers].filter((bundler) => targetBundlers.has(bundler));
}

function groupResultsByExample(results: typeof BenchmarkResults.infer) {
  const grouped: Record<string, Record<string, number>> = {};
  for (const result of results) {
    if (!grouped[result.exampleFilename]) {
      grouped[result.exampleFilename] = {};
    }
    grouped[result.exampleFilename]![result.bundler] = result.size;
  }
  return grouped;
}

function calculateTrend(
  prSize: number,
  targetSize: number,
): { emoji: string; percent: string; diff: number } {
  if (prSize === targetSize) {
    return { emoji: '➖', percent: '0.0%', diff: 0 };
  }
  const diff = prSize - targetSize;
  const percent = ((diff / targetSize) * 100).toFixed(1);
  const emoji = diff > 0 ? '▲' : '▼';
  return { emoji, percent: `${diff > 0 ? '+' : ''}${percent}%`, diff };
}

async function readExampleContent(examplePath: string): Promise<string> {
  try {
    return await fs.readFile(examplePath, 'utf8');
  } catch {
    return '// Example content not found';
  }
}

async function generateSingleTableReport(
  prResults: typeof BenchmarkResults.infer,
  targetResults: typeof BenchmarkResults.infer,
) {
  const sharedBundlers = getSharedBundlers(prResults, targetResults);
  const prGrouped = groupResultsByExample(prResults);
  const targetGrouped = groupResultsByExample(targetResults);

  // Get all unique examples from both branches
  const allExamples = new Set([
    ...Object.keys(prGrouped),
    ...Object.keys(targetGrouped),
  ]);

  let output = '# 📊 Bundle Size Comparison Report\n\n';

  // Summary statistics
  let totalIncrease = 0,
    totalDecrease = 0,
    totalUnchanged = 0;
  const comparisons = [];

  for (const example of allExamples) {
    for (const bundler of sharedBundlers) {
      const prSize = prGrouped[example]?.[bundler];
      const targetSize = targetGrouped[example]?.[bundler];

      if (prSize !== undefined && targetSize !== undefined) {
        const trend = calculateTrend(prSize, targetSize);
        if (trend.diff > 0) totalIncrease++;
        else if (trend.diff < 0) totalDecrease++;
        else totalUnchanged++;

        comparisons.push({ example, bundler, prSize, targetSize, trend });
      }
    }
  }

  output += '## 📈 Summary\n\n';
  output += `- 📈 **Increased**: ${totalIncrease} bundles\n`;
  output += `- 📉 **Decreased**: ${totalDecrease} bundles\n`;
  output += `- ➖ **Unchanged**: ${totalUnchanged} bundles\n\n`;

  // Main comparison table
  output += '## 📋 Bundle Size Comparison\n\n';

  // Table header
  output += '| Example';
  for (const bundler of sharedBundlers) {
    output += ` | ${bundler}`;
  }
  output += ' |\n';

  // Table separator
  output += '|---------';
  for (const bundler of sharedBundlers) {
    output += '|---------';
  }
  output += ' |\n';

  // Table rows
  for (const example of [...allExamples].sort()) {
    output += `| ${example}`;

    for (const bundler of sharedBundlers) {
      const prSize = prGrouped[example]?.[bundler];
      const targetSize = targetGrouped[example]?.[bundler];

      if (prSize !== undefined && targetSize !== undefined) {
        const trend = calculateTrend(prSize, targetSize);
        output += ` | ${prSize}/${targetSize} ${trend.percent} ${trend.emoji}`;
      } else if (prSize !== undefined) {
        output += ` | ${prSize}/-`;
      } else if (targetSize !== undefined) {
        output += ` | -/${targetSize}`;
      } else {
        output += ' | -';
      }
    }
    output += ' |\n';
  }
  output += '\n';

  // Example code sections
  output += '---\n\n';
  output += '## 💻 Example Code\n\n';

  for (const example of [...allExamples].sort()) {
    const examplePath = `./examples/${example}`;
    const exampleContent = await readExampleContent(examplePath);

    output += `### ${example}\n\n`;
    output += '```typescript\n';
    output += exampleContent.trim();
    output += '\n```\n\n';
  }

  return output;
}

async function generatePROnlyReport(prResults: typeof BenchmarkResults.infer) {
  const grouped = groupResultsByExample(prResults);
  const bundlers = [...new Set(prResults.map((r) => r.bundler))];
  const examples = Object.keys(grouped).sort();

  let output = '# 📊 Bundle Size Report (PR Branch Only)\n\n';

  // Main results table
  output += '## 📋 Bundle Sizes\n\n';

  // Table header
  output += '| Example';
  for (const bundler of bundlers) {
    output += ` | ${bundler}`;
  }
  output += ' |\n';

  // Table separator
  output += '|---------';
  for (const bundler of bundlers) {
    output += '|---------';
  }
  output += ' |\n';

  // Table rows
  for (const example of examples) {
    output += `| ${example}`;
    for (const bundler of bundlers) {
      const size = grouped[example]?.[bundler];
      output += size !== undefined ? ` | ${size}` : ' | -';
    }
    output += ' |\n';
  }
  output += '\n';

  // Example code sections
  output += '---\n\n';
  output += '## 💻 Example Code\n\n';

  for (const example of examples) {
    const examplePath = `./examples/${example}`;
    const exampleContent = await readExampleContent(examplePath);

    output += `### ${example}\n\n`;
    output += '```typescript\n';
    output += exampleContent.trim();
    output += '\n```\n\n';
  }

  return output;
}

async function main() {
  const [prFile, targetFile] = process.argv.slice(2);

  if (!prFile) {
    console.error(
      'Usage: compare-results.js <pr-results.json> [target-results.json]',
    );
    process.exit(1);
  }

  // Read and validate PR results
  const prContent = await fs.readFile(prFile, 'utf8');
  let prResults: typeof BenchmarkResults.infer;

  try {
    prResults = BenchmarkResults.assert(JSON.parse(prContent));
  } catch (error) {
    throw new Error('PR results validation failed', { cause: error });
  }

  // Try to read and validate target results
  let targetResults: typeof BenchmarkResults.infer | null = null;
  if (targetFile) {
    try {
      const targetContent = await fs.readFile(targetFile, 'utf8');
      targetResults = BenchmarkResults.assert(JSON.parse(targetContent));
    } catch (error) {
      console.warn('Could not read or validate target results:', error);
    }
  }

  // Generate appropriate report
  let markdownReport;
  if (targetResults && targetResults.length > 0) {
    markdownReport = await generateSingleTableReport(prResults, targetResults);
  } else {
    markdownReport = await generatePROnlyReport(prResults);
  }

  console.log(markdownReport);
}

await main();
