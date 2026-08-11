import { describe, expect, type Mock } from 'vitest';
import { tgpu, d } from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe('minification', () => {
  const inner = () => {
    'use gpu';
    return 1;
  };

  const outer = () => {
    'use gpu';
    return inner();
  };

  const computeFn = tgpu.computeFn({ workgroupSize: [1, 1, 1] })(() => {
    'use gpu';
    outer();
  });

  describe('enabling', () => {
    it('does not minify if not set to', async () => {
      const root = await tgpu.init();
      const pipeline = root.createComputePipeline({ compute: computeFn });

      const code = tgpu.resolve([pipeline]);

      expect(code).toMatchInlineSnapshot(`
        "fn inner() -> i32 {
          return 1;
        }

        fn outer() -> i32 {
          return inner();
        }

        @compute @workgroup_size(1, 1, 1) fn computeFn() {
          outer();
        }"
      `);
      expect(code).toContain('  ');
    });

    it('minifies in resolve', async () => {
      const code = tgpu.resolve([inner], { unstable_minify: true });

      expect(code).toMatchInlineSnapshot(`"fn inner()->i32{return 1;}"`);
      expect(code).not.toContain('  ');
    });

    it('minifies in resolveWithContext', async () => {
      const code = tgpu.resolveWithContext([inner], { unstable_minify: true }).code;

      expect(code).toMatchInlineSnapshot(`"fn inner()->i32{return 1;}"`);
      expect(code).not.toContain('  ');
    });

    it('minifies in resolve with template', async () => {
      const code = tgpu.resolve({
        template: 'fn main() { inner(); }',
        externals: { inner },
        unstable_minify: true,
      });

      expect(code).toMatchInlineSnapshot(`"fn inner()->i32{return 1;}fn main(){inner();}"`);
      expect(code).not.toContain('  ');
    });

    it('minifies in resolve if root is set to minify', async () => {
      const root = await tgpu.init({ unstable_minify: true });
      const pipeline = root.createComputePipeline({ compute: computeFn });

      const code = tgpu.resolve([pipeline]);

      expect(code).toMatchInlineSnapshot(
        `"fn inner()->i32{return 1;}fn outer()->i32{return inner();}@compute@workgroup_size(1,1,1)fn computeFn(){outer();}"`,
      );
      expect(code).not.toContain('  ');
    });

    it('minifies in implicit resolve if root is set to minify', async ({ device }) => {
      const root = await tgpu.init({ unstable_minify: true });
      const pipeline = root.createComputePipeline({ compute: computeFn });

      pipeline.dispatchWorkgroups(1);

      expect((device.createShaderModule as Mock).mock.calls).toMatchInlineSnapshot(`
        [
          [
            {
              "code": "fn inner()->i32{return 1;}fn outer()->i32{return inner();}@compute@workgroup_size(1,1,1)fn computeFn(){outer();}",
              "label": "pipeline - Shader",
            },
          ],
        ]
      `);
    });

    it('does not minify in resolve with minify disabled even if root is set to minify', async () => {
      const root = await tgpu.init({ unstable_minify: true });
      const pipeline = root.createComputePipeline({ compute: computeFn });

      const code = tgpu.resolve([pipeline], { unstable_minify: false });

      expect(code).toMatchInlineSnapshot(`
        "fn inner() -> i32 {
          return 1;
        }

        fn outer() -> i32 {
          return inner();
        }

        @compute @workgroup_size(1, 1, 1) fn computeFn() {
          outer();
        }"
      `);
      expect(code).toContain('  ');
    });
  });

  describe('comments', () => {
    it('does not accidentally create comments in raw-wgsl implemented functions', () => {
      const rawFn = tgpu.fn([])`() => {
        var a = 1;
        let p = &a;
        var b = 1 / *p;
      }`;

      const code = tgpu.resolve([rawFn], { unstable_minify: true });

      expect(code).toMatchInlineSnapshot(`"fn rawFn(){var a=1;let p=&a;var b=1/ *p;}"`);
      expect(code).not.toContain('  ');
      expect(code).not.toContain('/*');
    });

    it('does not accidentally create comments in use gpu functions', () => {
      const fn = () => {
        'use gpu';
        const a = d.vec3f();
        const c = a;
        const b = 1 / c;
      };

      const code = tgpu.resolve([fn], { unstable_minify: true });

      expect(code).toMatchInlineSnapshot(`"fn fn_1(){var a=vec3f();let c=(&a);let b=(1f/(*c));}"`);
      expect(code).not.toContain('  ');
      expect(code).not.toContain('/*');
    });

    it('removes eol comments', () => {
      const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
        let b = 1;
        // a comment
        return a + 1; // my comment /*
        // // other comment
      } // end of file`;

      const code = tgpu.resolve([rawFn], { unstable_minify: true });

      expect(code).toMatchInlineSnapshot(`"fn rawFn(a:u32)->u32{let b=1;return a+1;}"`);
      expect(code).not.toContain('  ');
    });

    it('removes block comments', () => {
      const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
        /* a comment */return a + 1;/* my comment */
        /* other
        comment */
      }`;

      const code = tgpu.resolve([rawFn], { unstable_minify: true });

      expect(code).toMatchInlineSnapshot(`"fn rawFn(a:u32)->u32{return a+1;}"`);
      expect(code).not.toContain('  ');
    });

    it('removes unicode comments', () => {
      const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
        // 🙂
        return a + 1;
      }`;

      const code = tgpu.resolve([rawFn], { unstable_minify: true });

      expect(code).toMatchInlineSnapshot(`"fn rawFn(a:u32)->u32{return a+1;}"`);
      expect(code).not.toContain('  ');
    });

    it('removes nested block comments', () => {
      const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
        /* outer /* inner */ */
        return a + 1; /* other */
      }`;

      const code = tgpu.resolve([rawFn], { unstable_minify: true });

      expect(code).toMatchInlineSnapshot(`"fn rawFn(a:u32)->u32{return a+1;}"`);
      expect(code).not.toContain('  ');
    });

    it('ignores // in block comments', () => {
      const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
        /* 
        // this is not an eol comment */
        return a + 1;
      }`;

      const code = tgpu.resolve([rawFn], { unstable_minify: true });

      expect(code).toMatchInlineSnapshot(`"fn rawFn(a:u32)->u32{return a+1;}"`);
      expect(code).not.toContain('  ');
    });

    it('ignores // in nested block comments', () => {
      const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
        /* text
        text // text /* text
        /////**/ */*/
        return a;
      }/* text */`;

      const code = tgpu.resolve([rawFn], { unstable_minify: true });

      expect(code).toMatchInlineSnapshot(`"fn rawFn(a:u32)->u32{return a;}"`);
      expect(code).not.toContain('  ');
    });

    it('ignores /* in eol comments', () => {
      const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
        // /* this is not a block comment start
        return a + 1;
      }`;

      const code = tgpu.resolve([rawFn], { unstable_minify: true });

      expect(code).toMatchInlineSnapshot(`"fn rawFn(a:u32)->u32{return a+1;}"`);
      expect(code).not.toContain('  ');
    });

    it('reports block comment closed without an opening', () => {
      const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
        /* comment */ */
        return a + 1;
      }`;

      expect(() =>
        tgpu.resolve([rawFn], { unstable_minify: true }),
      ).toThrowErrorMatchingInlineSnapshot(
        `[SyntaxError: Block comment closing without corresponding opening found during minification.]`,
      );
    });

    it('reports block comment opened without a closing', () => {
      const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
        return a + 1;
      } /* unfinished`;

      expect(() =>
        tgpu.resolve([rawFn], { unstable_minify: true }),
      ).toThrowErrorMatchingInlineSnapshot(
        `[SyntaxError: Block comment opening without corresponding closing found during minification.]`,
      );
    });
  });

  describe('whitespaces', () => {
    it('reduces spaces if items are separated by , or :', async () => {
      const helper = (a: number, b: number, c: number) => {
        'use gpu';
        return a + b + c;
      };

      const fn = () => {
        'use gpu';
        return helper(1, 2, 3);
      };

      const code = tgpu.resolve([fn], { unstable_minify: true });

      expect(code).toMatchInlineSnapshot(
        `"fn helper(a:i32,b:i32,c:i32)->i32{return((a+b)+c);}fn fn_1()->i32{return helper(1i,2i,3i);}"`,
      );
      expect(code).not.toContain('  ');
    });

    it('handles |', () => {
      const fn = () => {
        'use gpu';
        const a = 1; // a com|ment
        const b = a | 2;
        const c = true;
        const d = c || false;
      };

      const code = tgpu.resolve([fn], { unstable_minify: true });

      expect(code).toMatchInlineSnapshot(
        `"fn fn_1(){const a=1;let b=(a|2i);const c=true;let d=(c||false);}"`,
      );
      expect(code).not.toContain('  ');
      expect(code).toContain('a|2');
      expect(code).toContain('c||false');
    });

    it('handles spaces at the start and end of a file', () => {
      const fn = tgpu.fn([])`  
        (   ) => {
      
      }
        
        `;

      const code = tgpu.resolve([fn], { unstable_minify: true });

      expect(code).toMatchInlineSnapshot(`"fn fn_1(){}"`);
      expect(code).not.toContain('  ');
    });
  });

  describe('dependencies', () => {
    it('minifies raw wgsl implemented functions', async () => {
      const rawFn = tgpu.fn([d.u32], d.u32)`(a) => {
        return a + 1;
      }`;

      const code = tgpu.resolve([rawFn], { unstable_minify: true });

      expect(code).toMatchInlineSnapshot(`"fn rawFn(a:u32)->u32{return a+1;}"`);
      expect(code).not.toContain('  ');
    });

    it('minifies raw code snippets', async () => {
      const rawCodeSnippet = tgpu['~unstable'].rawCodeSnippet('1u + 2u', d.u32, 'constant', false);
      const fn = () => {
        'use gpu';
        const a = rawCodeSnippet.$;
        return a;
      };

      const code = tgpu.resolve([fn], { unstable_minify: true });

      expect(code).toMatchInlineSnapshot(`"fn fn_1()->u32{const a=1u+2u;return a;}"`);
      expect(code).not.toContain('  ');
    });

    it('minifies transitive dependencies in resolve', async () => {
      const code = tgpu.resolve([outer], { unstable_minify: true });

      expect(code).toMatchInlineSnapshot(
        `"fn inner()->i32{return 1;}fn outer()->i32{return inner();}"`,
      );
      expect(code).not.toContain('  ');
    });

    it('minifies declarations', async () => {
      const result = tgpu.resolveWithContext([outer], { unstable_minify: true });

      expect(result.declarations).toMatchInlineSnapshot(`
        [
          {
            "code": "fn inner()->i32{return 1;}",
            "name": "inner",
          },
          {
            "code": "fn outer()->i32{return inner();}",
            "name": "outer",
          },
        ]
      `);
    });
  });
});
