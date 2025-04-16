import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

describe('[BABEL] "kernel" directive', () => {
  it('makes plugin transpile marked arrow functions', () => {
    const code = `\
      import tgpu from 'typegpu';

      const addGPU = (a, b) => {
        'kernel';
        return a + b;
      };

      const addCPU = (a, b) => {
        return a + b;
      };
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const addGPU = tgpu.__assignAst(tgpu.__removedJsImpl("addGPU"), {"argNames":{"type":"identifiers","names":["a","b"]},"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]}, {});
      const addCPU = (a, b) => {
        return a + b;
      };"
    `);
  });

  it('makes plugin transpile marked arrow functions passed to shells', () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu['~unstable'].fn([]);

      shell((a, b) => {
        'kernel';
        return a + b;
      })

      shell((a, b) => {
        return a + b;
      })
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const shell = tgpu['~unstable'].fn([]);
      shell(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":["a","b"]},"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]}, {}));
      shell((a, b) => {
        return a + b;
      });"
    `);
  });

  it('makes plugin transpile marked non-arrow functions passed to shells', () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu['~unstable'].fn([]);

      shell(function(a, b){
        'kernel';
        return a + b;
      })

      shell(function(a, b) {
        return a + b;
      })
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const shell = tgpu['~unstable'].fn([]);
      shell(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":["a","b"]},"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]}, {}));
      shell(function (a, b) {
        return a + b;
      });"
    `);
  });

  it('makes plugin transpile marked non-arrow named functions passed to shells', () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu['~unstable'].fn([]);

      shell(function addGPU(a, b){
        'kernel';
        return a + b;
      })

      shell(function addCPU(a, b) {
        return a + b;
      })
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const shell = tgpu['~unstable'].fn([]);
      shell(tgpu.__assignAst(tgpu.__removedJsImpl("addGPU"), {"argNames":{"type":"identifiers","names":["a","b"]},"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]}, {}));
      shell(function addCPU(a, b) {
        return a + b;
      });"
    `);
  });

  it('makes plugin transpile marked function statements', () => {
    const code = `\
      import tgpu from 'typegpu';

      function addGPU(a, b) {
        'kernel';
        return a + b;
      }

      function addCPU(a, b) {
        return a + b;
      }
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const addGPU = tgpu.__assignAst(tgpu.__removedJsImpl("addGPU"), {"argNames":{"type":"identifiers","names":["a","b"]},"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]}, {});
      function addCPU(a, b) {
        return a + b;
      }"
    `);
  });
});

describe('[ROLLUP] "kernel" directive', () => {
  it('makes plugin transpile marked arrow functions', async () => {
    const code = `\
      import tgpu from 'typegpu';

      const addGPU = (a, b) => {
        'kernel';
        return a + b;
      };

      console.log(addGPU);

      const addCPU = (a, b) => {
        return a + b;
      };

      console.log(addCPU);
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const addGPU = tgpu.__assignAst(tgpu.__removedJsImpl("addGPU"), {"argNames":{"type":"identifiers","names":["a","b"]},"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]});

            console.log(addGPU);

            const addCPU = (a, b) => {
              return a + b;
            };

            console.log(addCPU);
      "
    `);
  });

  it('makes plugin transpile marked arrow functions passed to shells', async () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu['~unstable'].fn([]);

      shell((a, b) => {
        'kernel';
        return a + b;
      })

      shell((a, b) => {
        return a + b;
      })
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const shell = tgpu['~unstable'].fn([]);

            shell(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":["a","b"]},"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]}));

            shell((a, b) => {
              return a + b;
            });
      "
    `);
  });

  it('makes plugin transpile marked non-arrow functions passed to shells', async () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu['~unstable'].fn([]);

      shell(function(a, b){
        'kernel';
        return a + b;
      })

      shell(function(a, b) {
        return a + b;
      })`;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const shell = tgpu['~unstable'].fn([]);

            shell(tgpu.__assignAst(tgpu.__removedJsImpl(), {"argNames":{"type":"identifiers","names":["a","b"]},"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]}));

            shell(function(a, b) {
              return a + b;
            });
      "
    `);
  });

  it('makes plugin transpile marked non-arrow named functions passed to shells', async () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu['~unstable'].fn([]);

      shell(function addGPU(a, b){
        'kernel';
        return a + b;
      })

      shell(function addCPU(a, b) {
        return a + b;
      })
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const shell = tgpu['~unstable'].fn([]);

            shell(tgpu.__assignAst(tgpu.__removedJsImpl("addGPU"), {"argNames":{"type":"identifiers","names":["a","b"]},"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]}));

            shell(function addCPU(a, b) {
              return a + b;
            });
      "
    `);
  });

  it('makes plugin transpile marked function statements', async () => {
    const code = `\
      import tgpu from 'typegpu';

      function addGPU(a, b) {
        'kernel';
        return a + b;
      }

      console.log(addGPU);

      function addCPU(a, b) {
        return a + b;
      }

      console.log(addCPU);
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const addGPU = tgpu.__assignAst(tgpu.__removedJsImpl("addGPU"), {"argNames":{"type":"identifiers","names":["a","b"]},"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]});

            console.log(addGPU);

            function addCPU(a, b) {
              return a + b;
            }

            console.log(addCPU);
      "
    `);
  });
});
