import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { d, tgpu, type TgpuFn } from 'typegpu';
import { generate } from '../gen.mjs';

const cli = fileURLToPath(new URL('../tgpu-gen.mjs', import.meta.url));
const options = () => ({
  inputPath: '',
  outputPath: '',
  toTs: false,
  moduleSyntax: 'commonjs' as const,
});

function evaluate(source: string) {
  const module = { exports: {} as Record<string, unknown> };
  const code = generate(source, options());
  // oxlint-disable-next-line typescript-eslint/no-implied-eval -- Execute generated CommonJS to verify its syntax and behavior.
  new Function('require', 'module', code)(() => ({ tgpu, d }), module);
  return module.exports;
}

it('B40: generic WGSL matrix and half-vector types map to their data schemas', () => {
  for (const [type, schema] of [
    ['mat4x4<f32>', d.mat4x4f],
    ['vec3<f16>', d.vec3h],
  ] as const) {
    const result = evaluate(`enable f16; struct Params { value: ${type}, }`);
    const params = result.Params as { propTypes: Record<string, unknown> };
    expect.soft(params.propTypes.value).toBe(schema);
  }
});

it('B41: forward struct references inside nested arrays are sorted before evaluation', () => {
  const result = evaluate(`
struct Outer { values: array<array<Inner, 2>, 2>, }
struct Inner { value: f32, }
`);
  expect(result.Outer).toBeDefined();
  expect(result.Inner).toBeDefined();
});

it('B42: generated runtime-array aliases evaluate without an unbound length', () => {
  expect(() =>
    evaluate('alias Values = array<f32>; @group(0) @binding(0) var<storage, read> values: Values;'),
  ).not.toThrow();
});

it('B43: functions on the same WGSL line keep their individual bodies', () => {
  const result = evaluate('fn a()->f32 { return 1; } fn b()->f32 { return 2; }');
  const a = tgpu.resolve([result.a as TgpuFn<() => d.F32>], { names: 'strict' });
  const b = tgpu.resolve([result.b as TgpuFn<() => d.F32>], { names: 'strict' });
  expect.soft(a).toContain('return 1;');
  expect.soft(a).not.toContain('return 2;');
  expect.soft(b).toContain('return 2;');
  expect.soft(b).not.toContain('return 1;');
});

it('B44: a backtick in a valid WGSL comment remains safe in generated JavaScript', () => {
  expect(() => evaluate('fn a()->f32 { /* ` */ return 1; }')).not.toThrow();
});

it('B45: resolving a generated function includes its called helper', () => {
  const result = evaluate('fn a()->f32 { return 1; }\nfn b()->f32 { return a(); }');
  const code = tgpu.resolve([result.b as TgpuFn<() => d.F32>], { names: 'strict' });
  expect(code).toContain('fn a(');
  expect(code).toContain('return a()');
});

it('B70: CLI output containing a hash preserves unrelated existing files', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tgpu-gen-hash-'));
  try {
    fs.writeFileSync(path.join(directory, 'shader.wgsl'), 'struct Result { value:f32, }');
    fs.writeFileSync(path.join(directory, 'out'), 'existing file');
    const run = spawnSync(process.execPath, [cli, 'shader.wgsl', '-o', 'out#1.ts'], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(run.status, run.stderr).toBe(0);
    expect.soft(fs.readFileSync(path.join(directory, 'out'), 'utf8')).toBe('existing file');
    expect(fs.existsSync(path.join(directory, 'out#1.ts'))).toBe(true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('B71: CLI output globs preserve folders when an input directory contains parentheses', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tgpu-gen-glob-'));
  try {
    for (const name of ['one', 'two']) {
      fs.mkdirSync(path.join(directory, 'src(v2)', name), { recursive: true });
      fs.writeFileSync(
        path.join(directory, 'src(v2)', name, 'shader.wgsl'),
        `struct ${name} { value:f32, }`,
      );
    }
    const run = spawnSync(process.execPath, [cli, 'src(v2)/**/*.wgsl', '-o', 'out/**/*.ts'], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(run.status, run.stderr).toBe(0);
    for (const name of ['one', 'two']) {
      expect.soft(fs.existsSync(path.join(directory, 'out', name, 'shader.ts'))).toBe(true);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('B72: legal WGSL names do not collide with imports or generated layouts', () => {
  for (const source of [
    'struct d { value:f32, }',
    'fn tgpu() -> f32 { return 1.; }',
    'struct layout0 { value:f32, }\n@group(0) @binding(0) var<uniform> u:layout0;',
  ]) {
    expect.soft(() => evaluate(source)).not.toThrow();
  }
});
