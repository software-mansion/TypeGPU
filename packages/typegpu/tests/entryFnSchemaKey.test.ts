import { describe, expect, it } from 'vitest';
import { tgpu, d } from 'typegpu';
import { type FunctionDefinitionOptions, WgslGenerator } from 'typegpu/~internal';

class ArgRecordingGenerator extends WgslGenerator {
  args: { name: string; schemaKey: string | undefined }[] = [];

  public functionDefinition(options: FunctionDefinitionOptions): string {
    if (options.functionType !== 'normal') {
      this.args = options.args.map((arg) => ({ name: arg.name, schemaKey: arg.schemaKey }));
    }
    return super.functionDefinition(options);
  }
}

describe('schemaKey of entry function arguments', () => {
  it('is the IO schema key, even when destructured under an alias', () => {
    const vertex = tgpu.vertexFn({
      in: { position: d.vec2f, vertexIndex: d.builtin.vertexIndex },
      out: { pos: d.builtin.position },
    })(({ position: p, vertexIndex: idx }) => {
      'use gpu';
      return { pos: d.vec4f(p, d.f32(idx), 1) };
    });

    const generator = new ArgRecordingGenerator();
    tgpu.resolve([vertex], { unstable_shaderGenerator: generator });

    expect(generator.args).toStrictEqual([
      { name: 'p', schemaKey: 'position' },
      { name: 'idx', schemaKey: 'vertexIndex' },
    ]);
  });

  it('is undefined for arguments of non-entry functions', () => {
    const add = tgpu.fn([d.f32, d.f32], d.f32)((a, b) => a + b);
    const main = tgpu.computeFn({ workgroupSize: [1] })(() => {
      'use gpu';
      add(1, 2);
    });

    let nonEntryArgs: (string | undefined)[] = [];
    class Generator extends WgslGenerator {
      public functionDefinition(options: FunctionDefinitionOptions): string {
        if (options.functionType === 'normal') {
          nonEntryArgs = options.args.map((arg) => arg.schemaKey);
        }
        return super.functionDefinition(options);
      }
    }
    tgpu.resolve([main], { unstable_shaderGenerator: new Generator() });

    expect(nonEntryArgs).toStrictEqual([undefined, undefined]);
  });
});
