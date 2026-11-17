import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import ts from 'typescript';
import { prepareDirectory } from '../src/utils/files.ts';
import { setupWebgpuTypes } from '../src/steps/webgpu-types.ts';

it('B38: preparing an absolute project path creates that exact directory', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typegpu-cli-absolute-'));
  try {
    const target = path.join(directory, 'target');
    const cwd = path.join(directory, 'cwd');
    fs.mkdirSync(cwd);
    const actual = await prepareDirectory(cwd, target, {
      interactive: false,
    });
    expect(actual).toBe(target);
    expect(fs.existsSync(target)).toBe(true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('B39: WebGPU type setup preserves globals inherited through tsconfig extends', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typegpu-cli-ambient-'));
  try {
    fs.mkdirSync(path.join(directory, 'node_modules/@types/project-env'), { recursive: true });
    fs.mkdirSync(path.join(directory, 'node_modules/@webgpu/types'), { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'node_modules/@types/project-env/index.d.ts'),
      'declare const CUSTOM_GLOBAL: string;',
    );
    fs.writeFileSync(
      path.join(directory, 'node_modules/@webgpu/types/index.d.ts'),
      'declare const WEBGPU_GLOBAL: string;',
    );
    fs.writeFileSync(path.join(directory, 'index.ts'), 'const value = CUSTOM_GLOBAL;');
    fs.writeFileSync(
      path.join(directory, 'tsconfig.base.json'),
      JSON.stringify({ compilerOptions: { types: ['project-env'] } }),
    );
    fs.writeFileSync(
      path.join(directory, 'tsconfig.json'),
      JSON.stringify({
        extends: './tsconfig.base.json',
        compilerOptions: { skipLibCheck: true, typeRoots: ['./node_modules/@types'] },
        include: ['index.ts'],
      }),
    );
    const diagnostics = () => {
      const config = ts.readConfigFile(path.join(directory, 'tsconfig.json'), ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, directory);
      return ts
        .getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, parsed.options))
        .filter((diagnostic) => diagnostic.file?.fileName === path.join(directory, 'index.ts'))
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    };
    expect(diagnostics()).toHaveLength(0);
    setupWebgpuTypes(directory, 'npm', {
      name: 'regression-test',
      devDependencies: { '@webgpu/types': '*' },
    });
    expect(diagnostics()).toHaveLength(0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
