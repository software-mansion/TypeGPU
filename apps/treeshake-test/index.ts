import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  bundleWithEsbuild,
  bundleWithTsdown,
  bundleWithWebpack,
  generateMarkdownReport,
  getFileSize,
} from './utils.ts';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const examples = [
  'example1.ts',
  'example2.ts',
  'example3.ts',
];

const outDir = path.resolve(__dirname, 'dist');

console.log('Output directory:', outDir);

async function main() {
  console.log('Starting bundler efficiency measurement...');
  await fs.mkdir(outDir, { recursive: true });

  const results: { example: string; bundler: string; size: number }[] = [];

  for (const example of examples) {
    console.log('\n================================');
    console.log(`Processing ${example}...`);
    console.log('================================\n');
    const examplePath = path.resolve(__dirname, 'examples', example);
    const exampleOutDir = path.join(outDir, path.basename(example, '.ts'));
    await fs.mkdir(exampleOutDir, { recursive: true });

    try {
      console.log('Bundling with tsdown...');
      const tsdownOut = await bundleWithTsdown(examplePath, exampleOutDir);
      const tsdownSize = await getFileSize(tsdownOut);
      results.push({ example, bundler: 'tsdown', size: tsdownSize });
      console.log(`tsdown bundle size: ${tsdownSize} bytes`);
    } catch (error) {
      console.error('tsdown failed:', error);
    }

    try {
      console.log('Bundling with esbuild...');
      const esbuildOut = await bundleWithEsbuild(examplePath, exampleOutDir);
      const esbuildSize = await getFileSize(esbuildOut);
      results.push({ example, bundler: 'esbuild', size: esbuildSize });
      console.log(`esbuild bundle size: ${esbuildSize} bytes`);
    } catch (error) {
      console.error('esbuild failed:', error);
    }

    try {
      console.log('Bundling with webpack...');
      const webpackOut = await bundleWithWebpack(examplePath, exampleOutDir);
      const webpackSize = await getFileSize(webpackOut);
      results.push({ example, bundler: 'webpack', size: webpackSize });
      console.log(`webpack bundle size: ${webpackSize} bytes`);
    } catch (error) {
      console.error('webpack failed:', error);
    }
  }

  await generateMarkdownReport(results);

  console.log('\nMeasurement complete. Results saved to results.md');
}

main().catch(console.error);
