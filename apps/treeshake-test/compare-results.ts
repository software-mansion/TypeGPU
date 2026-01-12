#!/usr/bin/env node

import { arrayOf, type } from 'arktype';
import * as fs from 'node:fs/promises';

// Define schema for benchmark results
const ResultRecord = type({
  testFilename: 'string',
  bundler: 'string',
  size: 'number',
});

const BenchmarkResults = arrayOf(ResultRecord);

function groupResultsByTest(results: typeof BenchmarkResults.infer) {
  const grouped: Record<string, Record<string, number>> = {};
  for (const result of results) {
    if (!grouped[result.testFilename]) {
      grouped[result.testFilename] = {};
    }
    // biome-ignore lint/style/noNonNullAssertion: it's there...
    grouped[result.testFilename]![result.bundler] = result.size;
  }
  return grouped;
}

function calculateTrendMessage(
  prSize: number | undefined,
  targetSize: number | undefined,
): string {
  if (prSize === undefined || targetSize === undefined) {
    return '';
  }
  if (prSize === targetSize) {
    return '(➖)';
  }
  const diff = prSize - targetSize;
  const percent = ((diff / targetSize) * 100).toFixed(1);
  if (diff > 0) {
    return `($\${\\color{red}+${percent}\\\\%}$$)`;
  }
  return `($\${\\color{green}${percent}\\\\%}$$)`;
}

function prettifySize(size: number | undefined) {
  if (size === undefined) {
    return 'N/A';
  }
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let sizeInUnits = size;
  while (sizeInUnits > 1024 && unitIndex < units.length) {
    sizeInUnits /= 1024;
    unitIndex += 1;
  }
  return `${
    Number.isInteger(sizeInUnits) ? sizeInUnits : sizeInUnits.toFixed(2)
  } ${units[unitIndex]}`;
}

function generateTable(
  tests: string[],
  allBundlers: Set<string>,
  prGrouped: Record<string, Record<string, number>>,
  targetGrouped: Record<string, Record<string, number>>,
) {
  let output = '';
  // Table header
  output += '| Test';
  for (const bundler of allBundlers) {
    output += ` | ${bundler}`;
  }
  output += ' |\n';

  // Table separator.
  output += '|---------';
  for (const _ of allBundlers) {
    output += '|---------';
  }
  output += ' |\n';

  // Table rows
  for (const test of tests) {
    output += `| ${test}`;

    for (const bundler of allBundlers) {
      const prSize = prGrouped[test]?.[bundler];
      const targetSize = targetGrouped[test]?.[bundler];

      output += ` | ${prettifySize(prSize)} ${
        calculateTrendMessage(prSize, targetSize)
      }`;
    }
    output += ' |\n';
  }
  output += '\n';

  return output;
}

async function generateReport(
  prResults: typeof BenchmarkResults.infer,
  targetResults: typeof BenchmarkResults.infer,
) {
  const prGrouped = groupResultsByTest(prResults);
  const targetGrouped = groupResultsByTest(targetResults);

  // Get all unique bundlers from both branches
  const allBundlers = new Set([
    ...new Set(prResults.map((r) => r.bundler)),
    ...new Set(targetResults.map((r) => r.bundler)),
  ]);

  // Get all unique tests from both branches
  const allTests = new Set([
    ...Object.keys(prGrouped),
    ...Object.keys(targetGrouped),
  ]);

  let output = '\n\n';

  // Summary statistics
  let totalIncrease = 0,
    totalDecrease = 0,
    totalUnchanged = 0,
    totalUnknown = 0;

  for (const test of allTests) {
    for (const bundler of allBundlers) {
      const prSize = prGrouped[test]?.[bundler];
      const targetSize = targetGrouped[test]?.[bundler];

      if (targetSize === undefined || prSize === undefined) totalUnknown++;
      else if (prSize > targetSize) totalIncrease++;
      else if (prSize < targetSize) totalDecrease++;
      else totalUnchanged++;
    }
  }

  output += '## 📊 Bundle Size Comparison\n\n';
  output += '## 📈 Summary\n\n';
  output += `- 📈 **Increased**: ${totalIncrease} bundles\n`;
  output += `- 📉 **Decreased**: ${totalDecrease} bundles\n`;
  output += `- ➖ **Unchanged**: ${totalUnchanged} bundles\n\n`;
  output += `- ❔ **Unknown**: ${totalUnknown} bundles\n\n`;

  // Main comparison table
  output += '## 📋 Bundle Size Comparison\n\n';

  const staticTests = [...allTests].filter((t) => !t.startsWith('import_'))
    .sort();
  const dynamicTests = [...allTests].filter((t) => t.startsWith('import_'))
    .sort();

  output += generateTable(staticTests, allBundlers, prGrouped, targetGrouped);

  if (dynamicTests.length > 0) {
    output += `
<details>
<summary>Import tests</summary>

${generateTable(dynamicTests, allBundlers, prGrouped, targetGrouped)}
</details>\n`;
  } else {
    output +=
      `If you wish to run a comparison for every export as well, run the 'Tree-shake test' from the GitHub Actions menu.\n`;
  }

  return output;
}

async function main() {
  const [prFile, targetFile] = process.argv.slice(2);

  if (!prFile || !targetFile) {
    console.error(
      'Usage: compare-results.js <pr-results.json> [target-results.json]',
    );
    process.exit(1);
  }

  // Read and validate PR results
  let prResults: typeof BenchmarkResults.infer;
  try {
    const prContent = await fs.readFile(prFile, 'utf8');
    prResults = BenchmarkResults.assert(JSON.parse(prContent));
  } catch (error) {
    throw new Error('PR results validation failed', { cause: error });
  }

  // Read and validate target results
  let targetResults: typeof BenchmarkResults.infer = [];
  if (targetFile) {
    try {
      const targetContent = await fs.readFile(targetFile, 'utf8');
      targetResults = BenchmarkResults.assert(JSON.parse(targetContent));
    } catch (error) {
      console.warn('Could not read or validate target results:', error);
    }
  }

  // Generate appropriate report
  const markdownReport = await generateReport(
    prResults,
    targetResults,
  );
  console.log(markdownReport);
}

await main();
