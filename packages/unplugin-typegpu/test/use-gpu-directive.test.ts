import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

describe('[BABEL] "use gpu" directive', () => {
  it('makes plugin transpile marked arrow functions', () => {
    const code = `\
      import tgpu from 'typegpu';

      const addGPU = (a, b) => {
        'use gpu';
        return a + b;
      };

      const addCPU = (a, b) => {
        return a + b;
      };
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const addGPU = ($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (a, b) => {
        'use gpu';

        return __tsover_add(a, b);
      }, {
        v: 1,
        name: "addGPU",
        ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
        externals: () => {
          return {};
        }
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
        'use gpu';
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
        'use gpu';

        return __tsover_add(a, b);
      }, {
        v: 1,
        name: void 0,
        ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
        externals: () => {
          return {};
        }
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
        'use gpu';
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
        'use gpu';

        return __tsover_add(a, b);
      }, {
        v: 1,
        name: void 0,
        ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
        externals: () => {
          return {};
        }
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
        'use gpu';
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
        'use gpu';

        return __tsover_add(a, b);
      }, {
        v: 1,
        name: "addGPU",
        ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
        externals: () => {
          return {};
        }
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
        'use gpu';
        return a + b;
      }

      function addCPU(a, b) {
        return a + b;
      }
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const addGPU = ($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function addGPU(a, b) {
        'use gpu';

        return a + b;
      }, {
        v: 1,
        name: "addGPU",
        ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
        externals: () => {
          return {};
        }
      }) && $.f)({});
      function addCPU(a, b) {
        return a + b;
      }"
    `);
  });

  it('makes plugin transpile marked object method', () => {
    const code = `\
        const obj = {
          mod: (a: number, b: number): number => {
            'use gpu';
            return a % b;
          }
        }

        const isPrime = (n: number): boolean => {
          'use gpu';
          if (n <= 1) {
            return false;
          }

          for (let i = 2; i < n; i++) {
            if (obj.mod(n, i) === 0) {
              return false;
            }
          }
          return true;
        }
      `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const obj = {
        mod: ($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (a: number, b: number): number => {
          'use gpu';

          return __tsover_mod(a, b);
        }, {
          v: 1,
          name: "mod",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","%","b"]]]],"externalNames":[]},
          externals: () => {
            return {};
          }
        }) && $.f)({})
      };
      const isPrime = ($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (n: number): boolean => {
        'use gpu';

        if (n <= 1) {
          return false;
        }
        for (let i = 2; i < n; i++) {
          if (obj.mod(n, i) === 0) {
            return false;
          }
        }
        return true;
      }, {
        v: 1,
        name: "isPrime",
        ast: {"params":[{"type":"i","name":"n"}],"body":[0,[[11,[1,"n","<=",[5,"1"]],[0,[[10,false]]]],[14,[12,"i",[5,"2"]],[1,"i","<","n"],[102,"++","i"],[0,[[11,[1,[6,[7,"obj","mod"],["n","i"]],"===",[5,"0"]],[0,[[10,false]]]]]]],[10,true]]],"externalNames":["obj"]},
        externals: () => {
          return {
            obj
          };
        }
      }) && $.f)({});"
    `);
  });

  it('parses when no typegpu import', () => {
    const code = `\
      function add(a, b) {
        'use gpu';
        return a + b;
      };
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const add = ($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function add(a, b) {
        'use gpu';

        return a + b;
      }, {
        v: 1,
        name: "add",
        ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
        externals: () => {
          return {};
        }
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

  it('transforms numeric operations', async () => {
    const code = `\
      import tgpu, { d } from 'typegpu';

      const root = await tgpu.init();
      const countMutable = root.createMutable(d.i32, 0);

      const main = (a, b) => {
        'use gpu';
        let c = a + b + 2;
        c += 2 * b;
        countMutable.$ += 3;
      };
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu, { d } from 'typegpu';
      const root = await tgpu.init();
      const countMutable = root.createMutable(d.i32, 0);
      const main = ($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (a, b) => {
        'use gpu';

        let c = __tsover_add(__tsover_add(a, b), 2);
        c = __tsover_add(c, __tsover_mul(2, b));
        countMutable.$ = __tsover_add(countMutable.$, 3);
      }, {
        v: 1,
        name: "main",
        ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[12,"c",[1,[1,"a","+","b"],"+",[5,"2"]]],[2,"c","+=",[1,[5,"2"],"*","b"]],[2,[7,"countMutable","$"],"+=",[5,"3"]]]],"externalNames":["countMutable"]},
        externals: () => {
          return {
            countMutable
          };
        }
      }) && $.f)({});"
    `);
  });
});

describe('[ROLLUP] "use gpu" directive', () => {
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
        'use gpu';
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
              'use gpu';
              return __tsover_add(a, b);
            }), {
                    v: 1,
                    name: "addGPU",
                    ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
                    externals: () => ({}),
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
        'use gpu';
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
              'use gpu';
              return __tsover_add(a, b);
            }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
                    externals: () => ({}),
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
        'use gpu';
        return a + b;
      })

      shell(function(a, b) {
        return a + b;
      })`;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const shell = tgpu.fn([]);

            shell((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function(a, b){
              'use gpu';
              return __tsover_add(a, b);
            }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
                    externals: () => ({}),
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
        'use gpu';
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
              'use gpu';
              return __tsover_add(a, b);
            }), {
                    v: 1,
                    name: "addGPU",
                    ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
                    externals: () => ({}),
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
        'use gpu';
        return a + b * 3;
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
              'use gpu';
              return __tsover_add(a, __tsover_mul(b, 3));
            }), {
                    v: 1,
                    name: "addGPU",
                    ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+",[1,"b","*",[5,"3"]]]]]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({}));

            console.log(addGPU);

            function addCPU(a, b) {
              return a + b;
            }

            console.log(addCPU);
      "
    `);
  });

  it('makes plugin transpile marked object method', async () => {
    const code = `\
        const obj = {
          mod: (a, b) => {
            'use gpu';
            return a % b;
          }
        }

        const isPrime = (n) => {
          'use gpu';
          if (n <= 1) {
            return false;
          }

          for (let i = 2; i < n; i++) {
            if (obj.mod(n, i) === 0) {
              return false;
            }
          }
          return true;
        }
      `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const obj = {
                mod: (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((a, b) => {
                  'use gpu';
                  return __tsover_mod(a, b);
                }), {
                    v: 1,
                    name: "mod",
                    ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","%","b"]]]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({}))
              };

              (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((n) => {
                'use gpu';
                if (n <= 1) {
                  return false;
                }

                for (let i = 2; i < n; i++) {
                  if (obj.mod(n, i) === 0) {
                    return false;
                  }
                }
                return true;
              }), {
                    v: 1,
                    name: "isPrime",
                    ast: {"params":[{"type":"i","name":"n"}],"body":[0,[[11,[1,"n","<=",[5,"1"]],[0,[[10,false]]]],[14,[12,"i",[5,"2"]],[1,"i","<","n"],[102,"++","i"],[0,[[11,[1,[6,[7,"obj","mod"],["n","i"]],"===",[5,"0"]],[0,[[10,false]]]]]]],[10,true]]],"externalNames":["obj"]},
                    externals: () => ({obj}),
                  }) && $.f)({}));
      "
    `);
  });

  it('throws when hoisting was meant to be used', async () => {
    const code = `\
      const sum = add(1, 2);
      function add(a, b) {
        'use gpu';
        return a + b;
      };
    `;

    await rollupTransform(code);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `File  virtual:code: function "add" might have been referenced before its usage. Function statements are no longer hoisted after being transformed by the plugin.`,
    );
  });

  it('parses when no typegpu import', async () => {
    const code = `\
      function add(a, b) {
        'use gpu';
        return a + b;
      };
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function add(a, b) {
              'use gpu';
              return __tsover_add(a, b);
            }), {
                    v: 1,
                    name: "add",
                    ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":[]},
                    externals: () => ({}),
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

  it('transforms numeric operations', async () => {
    const code = `\
      import tgpu, { d } from 'typegpu';

      const root = await tgpu.init();
      const countMutable = root.createMutable(d.i32, 0);

      const main = (a, b) => {
        'use gpu';
        let c = a + b + 2;
        c += 2 * b;
        countMutable.$ += 3;
      };
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu, { d } from 'typegpu';

      const root = await tgpu.init();
            const countMutable = root.createMutable(d.i32, 0);

            (($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((a, b) => {
              'use gpu';
              let c = __tsover_add(__tsover_add(a, b), 2);
              c = __tsover_add(c, __tsover_mul(2, b));
              countMutable.$ = __tsover_add(countMutable.$, 3);
            }), {
                    v: 1,
                    name: "main",
                    ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[12,"c",[1,[1,"a","+","b"],"+",[5,"2"]]],[2,"c","+=",[1,[5,"2"],"*","b"]],[2,[7,"countMutable","$"],"+=",[5,"3"]]]],"externalNames":["countMutable"]},
                    externals: () => ({countMutable}),
                  }) && $.f)({}));
      "
    `);
  });
});
