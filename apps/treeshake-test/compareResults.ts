#!/usr/bin/env node

import { arrayOf, type } from 'arktype';
import * as fs from 'node:fs/promises';
import { ResultsTable } from './resultsTable.ts';

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
    // oxlint-disable-next-line typescript/no-non-null-assertion -- it's there...
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

  // All unique bundlers from both branches
  const allBundlers = new Set([
    ...new Set(prResults.map((r) => r.bundler)),
    ...new Set(targetResults.map((r) => r.bundler)),
  ]);

  // All unique tests from both branches
  const allTests = new Set([...Object.keys(prGrouped), ...Object.keys(targetGrouped)]);

  // Split tests into static and dynamic
  const staticTests = [...allTests].filter((t) => !t.includes('_from_')).toSorted();
  const dynamicTests = [...allTests].filter((t) => t.includes('_from_')).toSorted();

  // Summary statistics
  let totalDecreased = 0;
  let totalIncreased = 0;
  let totalUnchanged = 0;
  let totalUnknown = 0;

  for (const test of allTests) {
    for (const bundler of allBundlers) {
      const prSize = prGrouped[test]?.[bundler];
      const targetSize = targetGrouped[test]?.[bundler];

      if (targetSize === undefined || prSize === undefined) totalUnknown++;
      else if (prSize > targetSize) totalIncreased++;
      else if (prSize < targetSize) totalDecreased++;
      else totalUnchanged++;
    }
  }

  // Comparison tables
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

  // Markdown generation
  let output = '';

  output += '## 📊 Bundle Size Comparison\n\n';
  output += '| 🟢 Decreased | ➖ Unchanged | 🔴 Increased | ❔ Unknown |\n';
  output += '| :---: | :---: | :---: | :---: |\n';
  output += `| **${totalDecreased}** | **${totalUnchanged}** | **${totalIncreased}** | **${totalUnknown}** |\n\n`;

  output += `## 👀 Notable results\n\n`;
  output += `### Static test results:\n${staticTable}\n\n`;
  output += `### Dynamic test results:\n${dynamicTable}\n\n`;

  output += `## 📋 All results\n\n`;
  output += `${allTable}\n\n`;

  if (allBundlers.size === 1) {
    output += `If you wish to run a comparison for other, slower bundlers, run the 'Tree-shake test' from the GitHub Actions menu.\n`;
  }

  return output;
}

async function main() {
  const [prFile, targetFile] = process.argv.slice(2);

  if (!prFile || !targetFile) {
    console.error('Usage: compare-results.js <pr-results.json> [target-results.json]');
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
  const markdownReport = await generateReport(prResults, targetResults);
  console.log(markdownReport);
}

await main();
