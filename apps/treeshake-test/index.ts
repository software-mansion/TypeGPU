#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BundleResult {
  example: string;
  bundler: string;
  size: number;
  gzipSize: number;
  error?: string;
}

// Get all example files
const examplesDir = path.join(__dirname, 'examples');
const examples = fs.readdirSync(examplesDir)
  .filter(file => file.endsWith('.ts'))
  .map(file => path.join(examplesDir, file));

const results: BundleResult[] = [];

// Clean up any previous build artifacts
const outDir = path.join(__dirname, 'out');
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true });
}
fs.mkdirSync(outDir, { recursive: true });

// Bundle with esbuild
async function bundleWithEsbuild(inputFile: string): Promise<BundleResult> {
  const exampleName = path.basename(inputFile, '.ts');
  const outputFile = path.join(outDir, `${exampleName}.esbuild.js`);
  
  try {
    execSync(`npx esbuild "${inputFile}" --bundle --minify --outfile="${outputFile}" --platform=node --format=esm --external:@webgpu/types`, {
      cwd: __dirname,
      stdio: 'pipe'
    });

    const stats = fs.statSync(outputFile);
    const gzipSize = getGzipSize(outputFile);
    
    return {
      example: exampleName,
      bundler: 'esbuild',
      size: stats.size,
      gzipSize
    };
  } catch (error) {
    return {
      example: exampleName,
      bundler: 'esbuild',
      size: 0,
      gzipSize: 0,
      error: String(error)
    };
  }
}

// Bundle with tsdown
async function bundleWithTsdown(inputFile: string): Promise<BundleResult> {
  const exampleName = path.basename(inputFile, '.ts');
  const outputFile = path.join(outDir, `${exampleName}.tsdown.js`);
  
  try {
    execSync(`npx tsdown "${inputFile}" --outfile "${outputFile}" --minify --target node`, {
      cwd: __dirname,
      stdio: 'pipe'
    });

    const stats = fs.statSync(outputFile);
    const gzipSize = getGzipSize(outputFile);
    
    return {
      example: exampleName,
      bundler: 'tsdown',
      size: stats.size,
      gzipSize
    };
  } catch (error) {
    return {
      example: exampleName,
      bundler: 'tsdown',
      size: 0,
      gzipSize: 0,
      error: String(error)
    };
  }
}

// Bundle with webpack
async function bundleWithWebpack(inputFile: string): Promise<BundleResult> {
  const exampleName = path.basename(inputFile, '.ts');
  const outputFile = path.join(outDir, `${exampleName}.webpack.js`);
  
  try {
    // Create a temporary webpack config
    const configFile = path.join(outDir, `webpack.config.${exampleName}.cjs`);
    const webpackConfig = `
const path = require('path');

module.exports = {
  entry: '${inputFile}',
  mode: 'production',
  target: 'node',
  output: {
    path: '${path.dirname(outputFile)}',
    filename: '${path.basename(outputFile)}',
    libraryTarget: 'commonjs2'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  externals: {
    '@webgpu/types': 'commonjs @webgpu/types'
  },
  optimization: {
    minimize: true
  }
};
`;
    
    fs.writeFileSync(configFile, webpackConfig);
    
    execSync(`npx webpack --config "${configFile}"`, {
      cwd: __dirname,
      stdio: 'pipe'
    });

    // Clean up config file
    fs.unlinkSync(configFile);

    const stats = fs.statSync(outputFile);
    const gzipSize = getGzipSize(outputFile);
    
    return {
      example: exampleName,
      bundler: 'webpack',
      size: stats.size,
      gzipSize
    };
  } catch (error) {
    return {
      example: exampleName,
      bundler: 'webpack',
      size: 0,
      gzipSize: 0,
      error: String(error)
    };
  }
}

// Measure source file size (for baseline comparison)
async function measureSource(inputFile: string): Promise<BundleResult> {
  const exampleName = path.basename(inputFile, '.ts');
  
  try {
    const stats = fs.statSync(inputFile);
    const gzipSize = getGzipSize(inputFile);
    
    return {
      example: exampleName,
      bundler: 'source',
      size: stats.size,
      gzipSize
    };
  } catch (error) {
    return {
      example: exampleName,
      bundler: 'source',
      size: 0,
      gzipSize: 0,
      error: String(error)
    };
  }
}

function getGzipSize(filePath: string): number {
  try {
    const gzipCommand = `gzip -c "${filePath}" | wc -c`;
    const result = execSync(gzipCommand, { encoding: 'utf8' });
    return Number.parseInt(result.trim(), 10);
  } catch {
    return 0;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function generateTable(results: BundleResult[]): string {
  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.example]) {
      acc[result.example] = {};
    }
    acc[result.example]![result.bundler] = result;
    return acc;
  }, {} as Record<string, Record<string, BundleResult>>);

  let table = '| Example | Type | Size | Gzipped | Status |\n';
  table += '|---------|------|------|---------|--------|\n';

  for (const [example, bundlerResults] of Object.entries(groupedResults)) {
    for (const [bundler, result] of Object.entries(bundlerResults)) {
      const size = result.error ? 'Error' : formatBytes(result.size);
      const gzipSize = result.error ? 'Error' : formatBytes(result.gzipSize);
      const status = result.error ? '❌ Failed' : '✅ Success';
      
      table += `| ${example} | ${bundler} | ${size} | ${gzipSize} | ${status} |\n`;
    }
  }

  return table;
}

async function main() {
  console.log('🌳 TypeGPU Tree-shake Testing');
  console.log('=============================\n');

  console.log(`Found ${examples.length} example files:`);
  examples.forEach(example => {
    console.log(`  - ${path.basename(example)}`);
  });
  console.log();

  const processors = [
    { name: 'source', fn: measureSource },
    { name: 'esbuild', fn: bundleWithEsbuild },
    { name: 'tsdown', fn: bundleWithTsdown },
    { name: 'webpack', fn: bundleWithWebpack }
  ];

  for (const example of examples) {
    console.log(`Processing ${path.basename(example)}...`);
    
    for (const processor of processors) {
      console.log(`  📊 Measuring ${processor.name}...`);
      try {
        const result = await processor.fn(example);
        results.push(result);
        
        if (result.error) {
          console.log(`    ❌ Failed: ${result.error.slice(0, 100)}...`);
        } else {
          console.log(`    ✅ Success: ${formatBytes(result.size)} (${formatBytes(result.gzipSize)} gzipped)`);
        }
      } catch (error) {
        console.log(`    ❌ Failed: ${error}`);
        results.push({
          example: path.basename(example, '.ts'),
          bundler: processor.name,
          size: 0,
          gzipSize: 0,
          error: String(error)
        });
      }
    }
    console.log();
  }

  console.log('📊 Results Summary');
  console.log('==================\n');

  const table = generateTable(results);
  console.log(table);

  // Save results to file
  const resultsFile = path.join(__dirname, 'treeshake-results.md');
  const markdown = `# TypeGPU Tree-shake Test Results

Generated on: ${new Date().toISOString()}

## Summary

This test measures the bundle size of different TypeGPU import patterns using esbuild, tsdown, and webpack. This helps understand the impact of different import styles on final bundle size.

## Results

${table}

## Example Files

${examples.map(example => {
  const content = fs.readFileSync(example, 'utf8');
  return `### ${path.basename(example)}

\`\`\`typescript
${content}
\`\`\``;
}).join('\n\n')}

## Notes

- **source**: Original TypeScript file size
- **esbuild**: Bundled and minified with esbuild
- **tsdown**: Bundled and minified with tsdown
- **webpack**: Bundled and minified with webpack

The bundled sizes show the actual JavaScript payload that would be delivered to users when using these import patterns.
`;

  fs.writeFileSync(resultsFile, markdown);
  console.log(`\n📄 Results saved to: ${resultsFile}`);
}

main().catch(console.error);