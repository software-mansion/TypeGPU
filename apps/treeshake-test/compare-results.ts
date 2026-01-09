#!/usr/bin/env node

import * as fs from "node:fs/promises";
import { arrayOf, type } from "arktype";
import assert from "node:assert";

// Define schema for benchmark results
const ResultRecord = type({
  exampleFilename: "string",
  exampleUrl: "string",
  bundler: "string",
  size: "number",
});

const BenchmarkResults = arrayOf(ResultRecord);

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
  prSize: number | undefined,
  targetSize: number | undefined,
): { emoji: string; percent: string } {
  if (prSize === undefined || targetSize === undefined) {
    return { emoji: "", percent: "" };
  }
  if (prSize === targetSize) {
    return { emoji: "➖", percent: "0.0%" };
  }
  const diff = prSize - targetSize;
  const percent = ((diff / targetSize) * 100).toFixed(1);
  const emoji = diff > 0 ? "▲" : "▼";
  return { emoji, percent: `${diff > 0 ? "+" : ""}${percent}%` };
}

function prettifySize(size: number | undefined) {
  if (size === undefined) {
    return "N/A";
  }
  const units = ["B", "kB", "MB", "GB", "TB"];
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

async function generateSingleTableReport(
  prResults: typeof BenchmarkResults.infer,
  targetResults: typeof BenchmarkResults.infer,
) {
  const prGrouped = groupResultsByExample(prResults);
  const targetGrouped = groupResultsByExample(targetResults);

  // Get all unique bundlers from both branches
  const allBundlers = new Set([
    ...new Set(prResults.map((r) => r.bundler)),
    ...new Set(targetResults.map((r) => r.bundler)),
  ]);

  // Get all unique examples from both branches
  const allExamples = new Set([
    ...Object.keys(prGrouped),
    ...Object.keys(targetGrouped),
  ]);

  let output = "\n\n";

  // Summary statistics
  let totalIncrease = 0,
    totalDecrease = 0,
    totalUnchanged = 0,
    totalUnknown = 0;

  for (const example of allExamples) {
    for (const bundler of allBundlers) {
      const prSize = prGrouped[example]?.[bundler];
      const targetSize = targetGrouped[example]?.[bundler];
      assert(prSize);

      if (targetSize === undefined) totalUnknown++;
      else if (prSize > targetSize) totalIncrease++;
      else if (prSize < targetSize) totalDecrease++;
      else totalUnchanged++;
    }
  }

  output += "## 📈 Summary\n\n";
  output += `- 📈 **Increased**: ${totalIncrease} bundles\n`;
  output += `- 📉 **Decreased**: ${totalDecrease} bundles\n`;
  output += `- ➖ **Unchanged**: ${totalUnchanged} bundles\n\n`;
  output += `- ❔ **Unknown**: ${totalUnknown} bundles\n\n`;

  // Main comparison table
  output += "## 📋 Bundle Size Comparison\n\n";

  // Table header
  output += "| Example";
  for (const bundler of allBundlers) {
    output += ` | ${bundler}`;
  }
  output += " |\n";

  // Table separator
  output += "|---------";
  for (const bundler of allBundlers) {
    output += "|---------";
  }
  output += " |\n";

  // Table rows
  for (const example of [...allExamples].sort()) {
    output += `| ${example}`;

    for (const bundler of allBundlers) {
      const prSize = prGrouped[example]?.[bundler];
      const targetSize = targetGrouped[example]?.[bundler];

      const trend = calculateTrend(prSize, targetSize);
      output += ` | ${prettifySize(targetSize)} -> ${
        prettifySize(prSize)
      } ${trend.percent} ${trend.emoji}`;
    }
    output += " |\n";
  }
  output += "\n";

  return output;
}

async function main() {
  const [prFile, targetFile] = process.argv.slice(2);

  if (!prFile) {
    console.error(
      "Usage: compare-results.js <pr-results.json> [target-results.json]",
    );
    process.exit(1);
  }

  // Read and validate PR results
  const prContent = await fs.readFile(prFile, "utf8");
  let prResults: typeof BenchmarkResults.infer;

  try {
    prResults = BenchmarkResults.assert(JSON.parse(prContent));
  } catch (error) {
    throw new Error("PR results validation failed", { cause: error });
  }

  // Try to read and validate target results
  let targetResults: typeof BenchmarkResults.infer = [];
  if (targetFile) {
    try {
      const targetContent = await fs.readFile(targetFile, "utf8");
      targetResults = BenchmarkResults.assert(JSON.parse(targetContent));
    } catch (error) {
      console.warn("Could not read or validate target results:", error);
    }
  }

  // Generate appropriate report
  const markdownReport = await generateSingleTableReport(
    prResults,
    targetResults,
  );
  console.log(markdownReport);
}

await main();
