#!/usr/bin/env node

import { arrayOf, type } from 'arktype';
import * as fs from 'node:fs/promises';
import { ResultsTable } from './results-table.ts';

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

  // Split tests into static and dynamic
  const staticTests = [...allTests].filter((t) => !t.includes('_from_'))
    .sort();
  const dynamicTests = [...allTests].filter((t) => t.includes('_from_'))
    .sort();

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
  output += totalUnknown > 0
    ? `- ❔ **Unknown**: ${totalUnknown} bundles\n`
    : '';
  output += '\n';

  // Main comparison table
  output += `## 📋 Bundle Size Comparison\n\n`;
  const staticTable = new ResultsTable(allBundlers, 0.005);
  const dynamicTable = new ResultsTable(allBundlers, 0.005);
  const allTable = new ResultsTable(allBundlers, 0);

  staticTests.forEach((test) => {
    const prResults = prGrouped[test];
    const targetResults = targetGrouped[test];
    staticTable.addRow(test, prResults, targetResults);
    allTable.addRow(test, prResults, targetResults);
  });

  dynamicTests.forEach((test) => {
    const prResults = prGrouped[test];
    const targetResults = targetGrouped[test];
    dynamicTable.addRow(test, prResults, targetResults);
    allTable.addRow(test, prResults, targetResults);
  });

  output += `Interesting static test results:\n${staticTable}\n\n`;
  output += `Interesting dynamic test results:\n${dynamicTable}\n\n`;
  output += `All test results:\n${allTable}\n\n`;

  if (allBundlers.size === 0) {
    output +=
      `If you wish to run a comparison for other, slower bundlers, run the 'Tree-shake test' from the GitHub Actions menu.\n`;
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
