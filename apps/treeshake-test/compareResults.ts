#!/usr/bin/env node

import { type } from 'arktype';
import * as fs from 'node:fs/promises';
import { emptyResultsString, ResultsTable, type Result } from './resultsTable.ts';

// Define schema for benchmark results
const ResultRecord = type({
  testFilename: 'string',
  bundler: 'string',
  size: 'number',
});

const BenchmarkResults = ResultRecord.array();

function groupResultsByTest(
  prEntrypointResults: typeof BenchmarkResults.infer,
  prDirectResults: typeof BenchmarkResults.infer,
  targetEntrypointResults: typeof BenchmarkResults.infer,
) {
  // testFilename -> bundler -> result
  const grouped: Record<string, Record<string, Result>> = {};

  const assign = (results: typeof BenchmarkResults.infer, resultsType: keyof Result) => {
    for (const { testFilename, bundler, size } of results) {
      ((grouped[testFilename] ??= {})[bundler] ??= {})[resultsType] = size;
    }
  };

  assign(prEntrypointResults, 'prEntrypoint');
  assign(prDirectResults, 'prDirect');
  assign(targetEntrypointResults, 'targetEntrypoint');

  return grouped;
}

async function generateReport(
  prEntrypointResults: typeof BenchmarkResults.infer,
  prDirectResults: typeof BenchmarkResults.infer,
  targetEntrypointResults: typeof BenchmarkResults.infer,
) {
  const grouped = groupResultsByTest(prEntrypointResults, prDirectResults, targetEntrypointResults);

  // All unique tests from both branches
  const allTests = new Set(Object.keys(grouped));

  // All unique bundlers from both branches
  const allBundlers = new Set(
    Object.values(grouped)
      .map((r) => Object.keys(r))
      .flat(),
  );

  // Summary statistics
  let totalDecreased = 0;
  let totalIncreased = 0;
  let totalUnchanged = 0;
  let totalUnknown = 0;

  for (const test of allTests) {
    for (const bundler of allBundlers) {
      const result = grouped[test]?.[bundler];
      const { prEntrypoint: prSize, targetEntrypoint: targetSize } = result ?? {};

      if (targetSize === undefined || prSize === undefined) totalUnknown++;
      else if (prSize > targetSize) totalIncreased++;
      else if (prSize < targetSize) totalDecreased++;
      else totalUnchanged++;
    }
  }

  const notableTable = new ResultsTable(allBundlers, 0.005);

  allTests.forEach((test) => {
    const result = grouped[test];
    notableTable.addRow(test, result);
  });

  const notableTableString = notableTable.toString();
  const notableDirectTableString = notableTable.getProblematicDirectImports();

  // Markdown generation
  let output = '';

  output +=
    '## Bundle Size Comparison (`import * as ...` in PR vs `import * as ...` in target):\n\n';
  output += '| 🟢 Decreased | ➖ Unchanged | 🔴 Increased | ❔ Unknown |\n';
  output += '| :---: | :---: | :---: | :---: |\n';
  output += `| **${totalDecreased}** | **${totalUnchanged}** | **${totalIncreased}** | **${totalUnknown}** |\n\n`;

  if (
    notableTableString !== emptyResultsString ||
    notableDirectTableString !== emptyResultsString
  ) {
    output += `## Notable changes\n\n`;
    if (notableTableString !== emptyResultsString) {
      output += `### \`import * as ...\` in PR vs \`import * as ...\` in target (did bundle size increase?):\n${notableTableString}\n\n`;
    }
    if (notableDirectTableString !== emptyResultsString) {
      output += `### \`import { ... }\` in PR vs \`import * as ...\` in PR (is the library tree-shakable?):\n${notableDirectTableString}\n\n`;
    }
  } else {
    output += `No notable changes.\n\n`;
  }

  if (allBundlers.size === 1) {
    output += `If you wish to run a comparison for other, slower bundlers, run the 'Tree-shake test' from the GitHub Actions menu.\n`;
  }

  return output;
}

async function main() {
  const [prEntrypointFile, targetEntrypointFile, prDirectFile] = process.argv.slice(2);

  if (!prEntrypointFile || !targetEntrypointFile || !prDirectFile) {
    console.error(
      'Usage: compare-results.js <pr-entrypoint-results.json> <target-entrypoint-results.json> <pr-direct-results.json>',
    );
    process.exit(1);
  }

  let prEntrypointResults: typeof BenchmarkResults.infer;
  try {
    const content = await fs.readFile(prEntrypointFile, 'utf8');
    prEntrypointResults = BenchmarkResults.assert(JSON.parse(content));
  } catch (error) {
    throw new Error('PR entrypoint results validation failed', { cause: error });
  }

  let prDirectResults: typeof BenchmarkResults.infer;
  try {
    const content = await fs.readFile(prDirectFile, 'utf8');
    prDirectResults = BenchmarkResults.assert(JSON.parse(content));
  } catch (error) {
    throw new Error('PR entrypoint results validation failed', { cause: error });
  }

  let targetEntrypointResults: typeof BenchmarkResults.infer = [];
  try {
    const targetContent = await fs.readFile(targetEntrypointFile, 'utf8');
    targetEntrypointResults = BenchmarkResults.assert(JSON.parse(targetContent));
  } catch (error) {
    console.warn('Could not read or validate target results:', error);
    console.warn('Returning empty results instead.');
  }

  // Generate appropriate report
  const markdownReport = await generateReport(
    prEntrypointResults,
    prDirectResults,
    targetEntrypointResults,
  );
  console.log(markdownReport);
}

await main();
