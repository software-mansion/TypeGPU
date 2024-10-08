import { describe, expect, it } from 'vitest';
import { createOutputPathCompiler } from '../outputPathCompiler.mjs';

const test = ({
  input,
  output,
  fileName,
  expected,
}: {
  input?: string;
  output: string;
  fileName: string;
  expected: string;
}) =>
  expect(
    createOutputPathCompiler(input ?? '**/*.wgsl', output)(fileName),
  ).toEqual(expected);

describe('createOutputPathCompiler', () => {
  it('generates an output path that is the same as output pattern when no placeholders are used', () => {
    test({
      output: 'hello.ts',
      fileName: 'hello.wgsl',
      expected: 'hello.ts',
    });
  });

  it('generates output paths in the same directories as the source files when no directory separator is present in the output pattern', () => {
    test({
      output: '*.ts',
      fileName: 'hello.wgsl',
      expected: 'hello.ts',
    });

    test({
      output: '*.js',
      fileName: 'hello.wgsl',
      expected: 'hello.js',
    });

    test({
      output: '*.ts',
      fileName: 'test/hello.wgsl',
      expected: 'test/hello.ts',
    });

    test({
      output: '*.ts',
      fileName: 'test/test2/hello.wgsl',
      expected: 'test/test2/hello.ts',
    });
  });

  it('generates output paths, flattening all outputs to a single specified directory when no ** placeholder is used', () => {
    test({
      output: 'generated/*.ts',
      fileName: 'hello.wgsl',
      expected: 'generated/hello.ts',
    });

    test({
      output: 'generated/generated2/*.ts',
      fileName: 'hello.wgsl',
      expected: 'generated/generated2/hello.ts',
    });

    test({
      output: 'generated/*.ts',
      fileName: 'hello.wgsl',
      expected: 'generated/hello.ts',
    });

    test({
      output: 'generated/*.ts',
      fileName: 'test/hello.wgsl',
      expected: 'generated/hello.ts',
    });

    test({
      output: 'generated/*.ts',
      fileName: 'test/test2/hello.wgsl',
      expected: 'generated/hello.ts',
    });
  });

  it('generates output paths keeping the directory structure when ** placeholder is used', () => {
    test({
      output: 'generated/**/*.ts',
      fileName: 'hello.wgsl',
      expected: 'generated/hello.ts',
    });

    test({
      output: 'generated/**/*.ts',
      fileName: 'test/hello.wgsl',
      expected: 'generated/test/hello.ts',
    });

    test({
      output: 'generated/**/*.ts',
      fileName: 'test/test2/hello.wgsl',
      expected: 'generated/test/test2/hello.ts',
    });

    test({
      output: 'generated/**/files/*.ts',
      fileName: 'test/test2/hello.wgsl',
      expected: 'generated/test/test2/files/hello.ts',
    });

    test({
      output: 'generated/**/*_1.ts',
      fileName: 'test/test2/hello.wgsl',
      expected: 'generated/test/test2/hello_1.ts',
    });

    test({
      input: 'test/**/*.wgsl',
      output: 'generated/**/*.ts',
      fileName: 'test/test2/hello.wgsl',
      expected: 'generated/test2/hello.ts',
    });
  });
});
