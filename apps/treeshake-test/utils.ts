import { build as esbuild } from 'esbuild';
import { build as tsdown } from 'tsdown';
import webpack from 'webpack';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type ResultRecord = {
  exampleUrl: URL;
  exampleFilename: string;
  bundler: string;
  size: number;
};

export async function bundleWithEsbuild(
  entryUrl: URL,
  outDir: URL,
): Promise<URL> {
  const entryFileName = path.basename(entryUrl.pathname, '.ts');
  const outPath = new URL(`${entryFileName}.esbuild.js`, outDir);
  await esbuild({
    entryPoints: [entryUrl.pathname],
    bundle: true,
    outfile: outPath.pathname,
    format: 'esm',
    minify: true,
    treeShaking: true,
  });
  return outPath;
}

export async function bundleWithWebpack(
  entryPath: URL,
  outDir: URL,
): Promise<URL> {
  const entryFileName = path.basename(entryPath.pathname, '.ts');
  const outPath = new URL(`./${entryFileName}.webpack.js`, outDir);

  return new Promise((resolve, reject) => {
    webpack(
      {
        entry: entryPath.pathname,
        output: {
          path: path.dirname(outPath.pathname),
          filename: path.basename(outPath.pathname),
        },
        module: {
          rules: [
            {
              test: /\.ts$/,
              use: {
                loader: 'ts-loader',
                options: {
                  compilerOptions: {
                    module: 'es2015',
                    target: 'es2015',
                    esModuleInterop: true,
                    allowSyntheticDefaultImports: true,
                    skipLibCheck: true,
                  },
                  transpileOnly: true,
                },
              },
              exclude: /node_modules/,
            },
          ],
        },
        optimization: {
          minimize: true,
        },
      },
      (err, stats) => {
        if (err || stats?.hasErrors()) {
          console.error(stats?.toString());
          reject(err || new Error('Webpack bundling failed'));
        } else {
          resolve(outPath);
        }
      },
    );
  });
}

export async function bundleWithTsdown(
  entryUrl: URL,
  outDir: URL,
): Promise<URL> {
  const entryFileName = path.basename(entryUrl.pathname, '.ts');
  const outPath = new URL(`./${entryFileName}.tsdown.js`, outDir);

  try {
    await tsdown({
      minify: true,
      platform: 'neutral',
      clean: false,
      entry: {
        [`${entryFileName}.tsdown`]: entryUrl.pathname,
      },
    });

    return outPath;
  } catch (error) {
    throw new Error(`tsdown bundling failed`, { cause: error });
  }
}

export async function getFileSize(filePath: URL): Promise<number> {
  const stats = await fs.stat(filePath);
  return stats.size;
}

export async function generateMarkdownReport(results: ResultRecord[]) {
  const grouped = Object.groupBy(results, (r) => r.exampleFilename);
  const exampleNames = Object.keys(grouped);
  const snippetsMap = Object.fromEntries(
    await Promise.all(
      exampleNames.map(async (exampleName) => {
        const row = grouped[exampleName]![0]!;
        const exampleUrl = row.exampleUrl;
        return [exampleName, await fs.readFile(exampleUrl, 'utf8')] as const;
      }),
    ),
  );

  let report = '# Bundler Efficiency Report\n\n';

  for (const [exampleFilename, rows] of Object.entries(grouped)) {
    // Read snippet code
    const snippet = snippetsMap[exampleFilename] ?? '';
    report += `## ${exampleFilename}\n\n`;
    report += `\`\`\`typescript\n${snippet.trim()}\n\`\`\`\n\n`;
    report += '| Bundler | Bundle Size (bytes) |\n';
    report += '|---------|---------------------|\n';
    for (const row of rows ?? []) {
      report += `| \`${row.bundler}\` | ${row.size} |\n`;
    }
    report += '\n';
  }

  // General table
  report += '---\n\n';
  report += '| Example File | Bundler   | Bundle Size (bytes) |\n';
  report += '|--------------|-----------|---------------------|\n';
  for (const result of results) {
    report +=
      `| \`${result.exampleFilename}\` | \`${result.bundler}\` | ${result.size} |\n`;
  }

  await fs.writeFile('results.md', report);
}
