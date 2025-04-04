import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform';

describe('[BABEL] "kernel & js" directive', () => {
  it('makes plugin transpile marked arrow functions', () => {
    const code = `\
      import tgpu from 'typegpu';

      const addGPU = (a, b) => {
        'kernel & js';
        return a + b;
      };

      const addCPU = (a, b) => {
          return a + b;
      };
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const addGPU = tgpu.__assignAst((a, b) => {
        'kernel & js';

        return a + b;
      }, {"argNames":{"type":"identifiers","names":["a","b"]},"body":{"b":[{"r":{"x":["a","+","b"]}}]},"externalNames":[]}, {});
      const addCPU = (a, b) => {
        return a + b;
      };"
    `);
  });

  it('makes plugin transpile marked arrow functions passed to shells', () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu['unstable'].fn([]);

      shell((a, b) => {
        'kernel & js';
        return a + b;
      })

      shell((a, b) => {
        return a + b;
      })
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const shell = tgpu['unstable'].fn([]);
      shell(tgpu.__assignAst((a, b) => {
        'kernel & js';

        return a + b;
      }, {"argNames":{"type":"identifiers","names":["a","b"]},"body":{"b":[{"r":{"x":["a","+","b"]}}]},"externalNames":[]}, {}));
      shell((a, b) => {
        return a + b;
      });"
    `);
  });

  it('makes plugin keep JS implementation when transpiling marked arrow functions passed to inline-defined shells', () => {
    const code = `\
      import tgpu from 'typegpu';

      tgpu['unstable'].fn([])((a, b) => {
        'kernel & js';
        return a + b;
      })
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      tgpu['unstable'].fn([])(tgpu.__assignAst((a, b) => {
        'kernel & js';

        return a + b;
      }, {"argNames":{"type":"identifiers","names":["a","b"]},"body":{"b":[{"r":{"x":["a","+","b"]}}]},"externalNames":[]}, {}));"
    `);
  });

  it('makes plugin transpile marked non-arrow functions passed to shells', () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu['unstable'].fn([]);

      shell(function(a, b){
        'kernel & js';
        return a + b;
      })

      shell(function(a, b) {
        return a + b;
      })
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const shell = tgpu['unstable'].fn([]);
      shell(tgpu.__assignAst(function (a, b) {
        'kernel & js';

        return a + b;
      }, {"argNames":{"type":"identifiers","names":["a","b"]},"body":{"b":[{"r":{"x":["a","+","b"]}}]},"externalNames":[]}, {}));
      shell(function (a, b) {
        return a + b;
      });"
    `);
  });

  it('makes plugin transpile marked non-arrow named functions passed to shells', () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu['unstable'].fn([]);

      shell(function addGPU(a, b){
        'kernel & js';
        return a + b;
      })

      shell(function addCPU(a, b) {
        return a + b;
      })
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const shell = tgpu['unstable'].fn([]);
      shell(tgpu.__assignAst(function addGPU(a, b) {
        'kernel & js';

        return a + b;
      }, {"argNames":{"type":"identifiers","names":["a","b"]},"body":{"b":[{"r":{"x":["a","+","b"]}}]},"externalNames":[]}, {}));
      shell(function addCPU(a, b) {
        return a + b;
      });"
    `);
  });

  it('makes plugin transpile marked function statements', () => {
    const code = `\
      import tgpu from 'typegpu';

      function addGPU(a, b) {
        'kernel & js';
        return a + b;
      }

      function addCPU(a, b) {
        return a + b;
      }
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const addGPU = tgpu.__assignAst(function addGPU(a, b) {
        'kernel & js';

        return a + b;
      }, {"argNames":{"type":"identifiers","names":["a","b"]},"body":{"b":[{"r":{"x":["a","+","b"]}}]},"externalNames":[]}, {});
      function addCPU(a, b) {
        return a + b;
      }"
    `);
  });
});

describe('[ROLLUP] "kernel & js" directive', () => {
  it('makes plugin transpile marked arrow functions', async () => {
    const code = `\
      import tgpu from 'typegpu';

      const addGPU = (a, b) => {
        'kernel & js';
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

      const addGPU = tgpu.__assignAst((a, b) => {
              'kernel & js';
              return a + b;
            }, {"argNames":{"type":"identifiers","names":["a","b"]},"body":{"b":[{"r":{"x":["a","+","b"]}}]},"externalNames":[]});

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

      const shell = tgpu['unstable'].fn([]);

      shell((a, b) => {
        'kernel & js';
        return a + b;
      })

      shell((a, b) => {
        return a + b;
      })
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const shell = tgpu['unstable'].fn([]);

            shell(tgpu.__assignAst((a, b) => {
              'kernel & js';
              return a + b;
            }, {"argNames":{"type":"identifiers","names":["a","b"]},"body":{"b":[{"r":{"x":["a","+","b"]}}]},"externalNames":[]}));

            shell((a, b) => {
              return a + b;
            });
      "
    `);
  });

  it('makes plugin keep JS implementation when transpiling marked arrow functions passed to inline-defined shells', async () => {
    const code = `\
      import tgpu from 'typegpu';

      tgpu['unstable'].fn([])((a, b) => {
        'kernel & js';
        return a + b;
      })
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      tgpu['unstable'].fn([])(tgpu.__assignAst((a, b) => {
              'kernel & js';
              return a + b;
            }, {"argNames":{"type":"identifiers","names":["a","b"]},"body":{"b":[{"r":{"x":["a","+","b"]}}]},"externalNames":[]}));
      "
    `);
  });

  it('makes plugin transpile marked non-arrow functions passed to shells', async () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu['unstable'].fn([]);

      shell(function(a, b){
        'kernel & js';
        return a + b;
      })

      shell(function(a, b) {
        return a + b;
      })`;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const shell = tgpu['unstable'].fn([]);

            shell(tgpu.__assignAst(function(a, b){
              'kernel & js';
              return a + b;
            }, {"argNames":{"type":"identifiers","names":["a","b"]},"body":{"b":[{"r":{"x":["a","+","b"]}}]},"externalNames":[]}));

            shell(function(a, b) {
              return a + b;
            });
      "
    `);
  });

  it('makes plugin transpile marked non-arrow named functions passed to shells', async () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu['unstable'].fn([]);

      shell(function addGPU(a, b){
        'kernel & js';
        return a + b;
      })

      shell(function addCPU(a, b) {
        return a + b;
      })
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const shell = tgpu['unstable'].fn([]);

            shell(tgpu.__assignAst(function addGPU(a, b){
              'kernel & js';
              return a + b;
            }, {"argNames":{"type":"identifiers","names":["a","b"]},"body":{"b":[{"r":{"x":["a","+","b"]}}]},"externalNames":[]}));

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
        'kernel & js';
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

      const addGPU = tgpu.__assignAst(function addGPU(a, b) {
              'kernel & js';
              return a + b;
            }, {"argNames":{"type":"identifiers","names":["a","b"]},"body":{"b":[{"r":{"x":["a","+","b"]}}]},"externalNames":[]});

            console.log(addGPU);

            function addCPU(a, b) {
              return a + b;
            }

            console.log(addCPU);
      "
    `);
  });
});
