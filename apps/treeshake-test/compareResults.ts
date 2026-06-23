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
  prNamespaceResults: typeof BenchmarkResults.infer,
  targetNamespaceResults: typeof BenchmarkResults.infer,
  prNamedResults: typeof BenchmarkResults.infer,
) {
  // testFilename -> bundler -> result
  const grouped: Record<string, Record<string, Result>> = {};

  const assign = (results: typeof BenchmarkResults.infer, resultsType: keyof Result) => {
    for (const { testFilename, bundler, size } of results) {
      ((grouped[testFilename] ??= {})[bundler] ??= {})[resultsType] = size;
    }
  };

  assign(prNamespaceResults, 'prNamespace');
  assign(targetNamespaceResults, 'targetNamespace');
  assign(prNamedResults, 'prNamed');

  return grouped;
}

async function generateReport(
  prNamespaceResults: typeof BenchmarkResults.infer,
  targetNamespaceResults: typeof BenchmarkResults.infer,
  prNamedResults: typeof BenchmarkResults.infer,
) {
  const grouped = groupResultsByTest(prNamespaceResults, targetNamespaceResults, prNamedResults);

  // All tests from the current branch (we are not interested in removed tests)
  const allTests = new Set(Object.values(prNamespaceResults).map((r) => r.testFilename));

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
      const { prNamespace: prSize, targetNamespace: targetSize } = result ?? {};

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

  const bundleSizeTableString = notableTable.getBundleSizeTable();
  const treeShakeTableString = notableTable.getTreeShakeTable();

  // Markdown generation
  let output = '';

  output +=
    '### Bundle size comparison (`import * as ...` in PR vs `import * as ...` in target):\n\n';
  output += '| 🟢 Decreased | ➖ Unchanged | 🔴 Increased | ❔ Unknown |\n';
  output += '| :---: | :---: | :---: | :---: |\n';
  output += `| **${totalDecreased}** | **${totalUnchanged}** | **${totalIncreased}** | **${totalUnknown}** |\n\n`;

  if (bundleSizeTableString !== emptyResultsString || treeShakeTableString !== emptyResultsString) {
    if (bundleSizeTableString !== emptyResultsString) {
      output += `### \`import * as ...\` in PR vs \`import * as ...\` in target (did bundle size increase?):\n${bundleSizeTableString}\n\n`;
    }
    if (treeShakeTableString !== emptyResultsString) {
      output += `### \`import { ... }\` in PR vs \`import * as ...\` in PR (is the library tree-Shakeable?):\n${treeShakeTableString}\n\n`;
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
  const [prNamespaceFile, targetNamespaceFile, prNamedFile] = process.argv.slice(2);

  if (!prNamespaceFile || !targetNamespaceFile || !prNamedFile) {
    console.error(
      'Usage: compare-results.js <pr-namespace-results.json> <target-namespace-results.json> <pr-named-results.json>',
    );
    process.exit(1);
  }

  let prNamespaceResults: typeof BenchmarkResults.infer;
  try {
    const content = await fs.readFile(prNamespaceFile, 'utf8');
    prNamespaceResults = BenchmarkResults.assert(JSON.parse(content));
  } catch (error) {
    throw new Error('PR namespace results validation failed', { cause: error });
  }

  let targetNamespaceResults: typeof BenchmarkResults.infer = [];
  try {
    const targetContent = await fs.readFile(targetNamespaceFile, 'utf8');
    targetNamespaceResults = BenchmarkResults.assert(JSON.parse(targetContent));
  } catch (error) {
    console.warn('Could not read or validate target results:', error);
    console.warn('Returning empty results instead.');
  }

  let prNamedResults: typeof BenchmarkResults.infer;
  try {
    const content = await fs.readFile(prNamedFile, 'utf8');
    prNamedResults = BenchmarkResults.assert(JSON.parse(content));
  } catch (error) {
    throw new Error('PR named results validation failed', { cause: error });
  }

  // Generate appropriate report
  const markdownReport = await generateReport(
    prNamespaceResults,
    targetNamespaceResults,
    prNamedResults,
  );
  console.log(markdownReport);
}

await main();
