import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
      const addGPU = ($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (a, b) => {
        'kernel';

        return a + b;
      }, {
        v: 1,
        ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
        externals: {}
      }) && $.f)({});
      const addCPU = (a, b) => {
        return a + b;
      };"
    `);
  });

  it('makes plugin transpile marked arrow functions passed to shells and keeps JS impl', () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu.fn([]);

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
      const shell = tgpu.fn([]);
      shell(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (a, b) => {
        'kernel';

        return a + b;
      }, {
        v: 1,
        ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
        externals: {}
      }) && $.f)({}));
      shell((a, b) => {
        return a + b;
      });"
    `);
  });

  it('makes plugin transpile marked non-arrow functions passed to shells', () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu.fn([]);

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
      const shell = tgpu.fn([]);
      shell(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function (a, b) {
        'kernel';

        return a + b;
      }, {
        v: 1,
        ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
        externals: {}
      }) && $.f)({}));
      shell(function (a, b) {
        return a + b;
      });"
    `);
  });

  it('makes plugin transpile marked non-arrow named functions passed to shells', () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu.fn([]);

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
      const shell = tgpu.fn([]);
      shell(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function addGPU(a, b) {
        'kernel';

        return a + b;
      }, {
        v: 1,
        ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
        externals: {}
      }) && $.f)({}));
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
      const addGPU = ($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function addGPU(a, b) {
        'kernel';

        return a + b;
      }, {
        v: 1,
        ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
        externals: {}
      }) && $.f)({});
      function addCPU(a, b) {
        return a + b;
      }"
    `);
  });

  it('parses when no typegpu import', () => {
    const code = `\
      function add(a, b) {
        'kernel';
        return a + b;
      };
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const add = ($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function add(a, b) {
        'kernel';

        return a + b;
      }, {
        v: 1,
        ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
        externals: {}
      }) && $.f)({});
      ;"
    `);
  });

  it('does not parse when not marked', () => {
    const code = `\
      function add(a, b) {
        return a + b;
      };
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "function add(a, b) {
        return a + b;
      }
      ;"
    `);
  });
});

describe('[ROLLUP] "kernel" directive', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

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
      "import 'typegpu';

      const addGPU = (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((a, b) => {
              'kernel';
              return a + b;
            }), {
                    v: 1,
                    ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
                    get externals() { return {}; },
                  }) && $.f)({}));

            console.log(addGPU);

            const addCPU = (a, b) => {
              return a + b;
            };

            console.log(addCPU);
      "
    `);
  });

  it('makes plugin transpile marked arrow functions passed to shells and keeps JS impl', async () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu.fn([]);

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

      const shell = tgpu.fn([]);

            shell((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((a, b) => {
              'kernel';
              return a + b;
            }), {
                    v: 1,
                    ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
                    get externals() { return {}; },
                  }) && $.f)({})));

            shell((a, b) => {
              return a + b;
            });
      "
    `);
  });

  it('makes plugin transpile marked non-arrow functions passed to shells', async () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu.fn([]);

      shell(function(a, b){
        'kernel';
        return a + b;
      })

      shell(function(a, b) {
        return a + b;
      })`;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const shell = tgpu.fn([]);

            shell((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function(a, b){
              'kernel';
              return a + b;
            }), {
                    v: 1,
                    ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
                    get externals() { return {}; },
                  }) && $.f)({})));

            shell(function(a, b) {
              return a + b;
            });
      "
    `);
  });

  it('makes plugin transpile marked non-arrow named functions passed to shells', async () => {
    const code = `\
      import tgpu from 'typegpu';

      const shell = tgpu.fn([]);

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

      const shell = tgpu.fn([]);

            shell((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function addGPU(a, b){
              'kernel';
              return a + b;
            }), {
                    v: 1,
                    ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
                    get externals() { return {}; },
                  }) && $.f)({})));

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
      "import 'typegpu';

      const addGPU = (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function addGPU(a, b) {
              'kernel';
              return a + b;
            }), {
                    v: 1,
                    ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
                    get externals() { return {}; },
                  }) && $.f)({}));

            console.log(addGPU);

            function addCPU(a, b) {
              return a + b;
            }

            console.log(addCPU);
      "
    `);
  });

  it('parses when no typegpu import', async () => {
    const code = `\
      function add(a, b) {
        'kernel';
        return a + b;
      };
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function add(a, b) {
              'kernel';
              return a + b;
            }), {
                    v: 1,
                    ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
                    get externals() { return {}; },
                  }) && $.f)({}));
      "
    `);
  });

  it('does not parse when not marked', async () => {
    const code = `\
      function add(a, b) {
        return a + b;
      };

      console.log(add);
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "function add(a, b) {
              return a + b;
            }
            console.log(add);
      "
    `);
  });
});
