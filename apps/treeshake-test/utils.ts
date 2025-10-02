import { build as esbuild } from 'esbuild';
import webpack from 'webpack';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const execFileAsync = promisify(execFile);

export async function bundleWithEsbuild(
  entryPath: string,
  outDir: string,
): Promise<string> {
  const entryFileName = path.basename(entryPath, '.ts');
  const outPath = path.join(outDir, `${entryFileName}.esbuild.js`);
  await esbuild({
    entryPoints: [entryPath],
    bundle: true,
    outfile: outPath,
    format: 'esm',
    minify: true,
    treeShaking: true,
  });
  return outPath;
}

export async function bundleWithWebpack(
  entryPath: string,
  outDir: string,
): Promise<string> {
  const entryFileName = path.basename(entryPath, '.ts');
  const outPath = path.join(outDir, `${entryFileName}.webpack.js`);

  return new Promise((resolve, reject) => {
    webpack(
      {
        entry: entryPath,
        output: {
          path: path.dirname(outPath),
          filename: path.basename(outPath),
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
  entryPath: string,
  outDir: string,
): Promise<string> {
  const entryFileName = path.basename(entryPath, '.ts');
  const outPath = path.join(outDir, `${entryFileName}.tsdown.js`);

  try {
    console.log('Running tsdown with options...');

    const { stdout, stderr } = await execFileAsync('npx', [
      'tsdown',
      entryPath,
      '--out-dir',
      outDir,
      '--config',
      'tsdown.config.ts',
    ], {
      cwd: process.cwd(),
    });

    console.log('tsdown stdout:', stdout);
    if (stderr) console.log('tsdown stderr:', stderr);

    const files = await fs.readdir(outDir);
    const tsdownFile = files.find((file) =>
      file.includes(entryFileName) && file.endsWith('.js')
    );
    if (tsdownFile && tsdownFile !== `${entryFileName}.tsdown.js`) {
      const actualOutPath = path.join(outDir, tsdownFile);
      await fs.rename(actualOutPath, outPath);
      return outPath;
    } else if (tsdownFile) {
      return path.join(outDir, tsdownFile);
    }

    throw new Error('tsdown output file not found');
  } catch (error) {
    throw new Error(`tsdown bundling failed: ${error}`);
  }
}

export async function getFileSize(filePath: string): Promise<number> {
  const stats = await fs.stat(filePath);
  return stats.size;
}

export async function generateMarkdownReport(
  results: { example: string; bundler: string; size: number }[],
) {
  const grouped: Record<string, { bundler: string; size: number }[]> = {};
  for (const r of results) {
    if (!grouped[r.example]) grouped[r.example] = [];
    grouped[r.example]!.push({ bundler: r.bundler, size: r.size });
  }

  let report = '# Bundler Efficiency Report\n\n';

  for (const example of Object.keys(grouped)) {
    if (grouped[example]) {
    // Read snippet code
    let snippet = '';
    try {
      const snippetPath = path.join('examples', example + (example.endsWith('.ts') ? '' : '.ts'));
      snippet = await fs.readFile(snippetPath, 'utf8');
    } catch (e) {
      snippet = '_Could not read example source._';
    }
    report += `## ${example}\n\n`;
    report += '```typescript\n' + snippet.trim() + '\n```\n\n';
    report += '| Bundler | Bundle Size (bytes) |\n';
    report += '|---------|---------------------|\n';
      for (const row of grouped[example]) {
        report += `| \`${row.bundler}\` | ${row.size} |\n`;
    }
    report += '\n';
    }
  }

  // General table
  report += '---\n\n';
  report += '| Example File | Bundler   | Bundle Size (bytes) |\n';
  report += '|--------------|-----------|---------------------|\n';
  for (const result of results) {
    report += `| \`${result.example}\` | \`${result.bundler}\` | ${result.size} |\n`;
  }

  await fs.writeFile('results.md', report);
}
