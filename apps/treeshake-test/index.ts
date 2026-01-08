import * as fs from "node:fs/promises";
import {
  bundleWithEsbuild,
  bundleWithTsdown,
  bundleWithWebpack,
  getFileSize,
  type ResultRecord,
} from "./utils.ts";

const DIST_DIR = new URL("./dist/", import.meta.url);
const EXAMPLES_DIR = new URL("./examples/", import.meta.url);

/**
 * A list of example filenames in the examples directory.
 * E.g.: ['example1.ts', 'example2.ts', ...]
 */
const examples = await fs.readdir(EXAMPLES_DIR);

async function bundleExample(
  exampleFilename: string,
  bundler: string,
  bundle: (exampleUrl: URL, outUrl: URL) => Promise<URL>,
): Promise<ResultRecord> {
  const exampleUrl = new URL(exampleFilename, EXAMPLES_DIR);
  const outUrl = await bundle(exampleUrl, DIST_DIR);
  const size = await getFileSize(outUrl);

  return { exampleFilename, exampleUrl, bundler, size };
}

async function main() {
  console.log("Starting bundler efficiency measurement...");
  await fs.mkdir(DIST_DIR, { recursive: true });

  const results = await Promise.allSettled(
    examples.flatMap((example) => [
      bundleExample(example, "esbuild", bundleWithEsbuild),
      bundleExample(example, "tsdown", bundleWithTsdown),
      bundleExample(example, "webpack", bundleWithWebpack),
    ]),
  );

  if (results.some((result) => result.status === "rejected")) {
    console.error("Some examples failed to bundle.");
    for (const result of results) {
      if (result.status === "rejected") {
        console.error(result.reason);
      }
    }
    process.exit(1);
  }

  const successfulResults = (
    results as PromiseFulfilledResult<ResultRecord>[]
  ).map((result) => result.value);

  // Save results as JSON
  await fs.writeFile(
    "results.json",
    JSON.stringify(successfulResults, null, 2),
  );

  console.log("\nMeasurement complete. Results saved to results.json");
}

await main();
