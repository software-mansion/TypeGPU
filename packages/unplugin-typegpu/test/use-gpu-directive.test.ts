import { describe, expect, test } from 'vitest';
import type { UnpluginContextMeta } from 'unplugin';
import { babelTransform, rollupTransform } from './transform.ts';
import { unpluginFactory } from '../src/core/factory.ts';

describe('"use gpu" is preserved after transform', () => {
  const code = `\
    const fn1 = () => {
      'use gpu';
    };

    const fn2 = () => {
      'use gpu';
      'worklet';
    };

    const fn3 = () => {
      'worklet';
      'use gpu';
    };

    console.log(fn1, fn2, fn3);
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      const fn1 = /*#__PURE__*/__tgpu_meta(() => {
        'use gpu';
      }, "[[],[]]", {}, "fn1");
      const fn2 = /*#__PURE__*/__tgpu_meta(() => {
        'use gpu';
        'worklet';
      }, "[[],[]]", {}, "fn2");
      const fn3 = /*#__PURE__*/__tgpu_meta(() => {
        'worklet';
        'use gpu';
      }, "[[],[]]", {}, "fn3");
      console.log(fn1, fn2, fn3);"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          const fn1 = (/*#__PURE__*/__tgpu_meta(() => {
            'use gpu';
          }, '[[],[]]', {}, "fn1"));

          const fn2 = (/*#__PURE__*/__tgpu_meta(() => {
            'use gpu';
            'worklet';
          }, '[[],[]]', {}, "fn2"));

          const fn3 = (/*#__PURE__*/__tgpu_meta(() => {
            'worklet';
            'use gpu';
          }, '[[],[]]', {}, "fn3"));

          console.log(fn1, fn2, fn3);
      "
    `);
  });
});

describe('metadata helper placement', () => {
  const code = `\
    'use client';
    const fn = () => {
      'use gpu';
    };
    console.log(fn);
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "'use client';

      const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      const fn = /*#__PURE__*/__tgpu_meta(() => {
        'use gpu';
      }, "[[],[]]", {}, "fn");
      console.log(fn);"
    `);
  });

  // Rollup drops module-level directives, so we call the transform directly
  test('unplugin', () => {
    const plugin = unpluginFactory({ autoNamingEnabled: false }, {} as UnpluginContextMeta);
    const result = plugin.transform.handler.call(
      { warn: () => {} } as unknown as ThisParameterType<typeof plugin.transform.handler>,
      `#!/usr/bin/env node\n${code}`,
      'file.ts',
    );
    expect(result?.code).toMatchInlineSnapshot(`
      "#!/usr/bin/env node
          'use client';
      const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);

          const fn = (/*#__PURE__*/__tgpu_meta(() => {
            'use gpu';
          }, '[[],[]]', {}, "fn"));
          console.log(fn);
        "
    `);
  });
});

describe('double transformation', () => {
  const code = `\
    const fn = () => {
      'use gpu';
    };

    console.log(fn);
  `;

  test('babel', () => {
    const once = babelTransform(code) ?? '';
    const twice = babelTransform(once) ?? '';

    expect(twice).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      const fn = /*#__PURE__*/__tgpu_meta(() => {
        'use gpu';
      }, "[[],[]]", {}, "fn");
      console.log(fn);"
    `);
  });

  test('rollup', async () => {
    const once = await rollupTransform(code);
    const twice = await rollupTransform(once);

    expect(twice).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          const fn = (/*#__PURE__*/__tgpu_meta(() => {
            'use gpu';
          }, '[[],[]]', {}, "fn"));

          console.log(fn);
      "
    `);
  });
});

describe('"use gpu" marked arrow function, assigned to a const', () => {
  const code = `\
    /** ADD */
    // another comment
    const addGPU = (a, b) => {
      'use gpu';
      return a + b;
    };

    const addCPU = (a, b) => {
      return a + b;
    };

    console.log(addGPU, addCPU);
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      /** ADD */
      // another comment
      const addGPU = /*#__PURE__*/__tgpu_meta((a, b) => {
        'use gpu';

        return __tsover_add(a, b);
      }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"+\\",\\"b\\"]]]]", {}, "addGPU");
      const addCPU = (a, b) => {
        return a + b;
      };
      console.log(addGPU, addCPU);"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          /** ADD */
          // another comment
          const addGPU = (/*#__PURE__*/__tgpu_meta((a, b) => {
            'use gpu';
            return __tsover_add(a, b);
          }, '[["a","b"],[[10,[1,"a","+","b"]]]]', {}, "addGPU"));

          const addCPU = (a, b) => {
            return a + b;
          };

          console.log(addGPU, addCPU);
      "
    `);
  });
});

describe('marked arrow functions passed to shells', () => {
  const code = `\
    import { tgpu } from 'typegpu';

    const shell = tgpu.fn([]);

    shell((a, b) => {
      'use gpu';
      return a + b;
    })

    shell((a, b) => {
      return a + b;
    })
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      import { tgpu } from 'typegpu';
      const shell = tgpu.fn([]);
      shell(/*#__PURE__*/__tgpu_meta((a, b) => {
        'use gpu';

        return __tsover_add(a, b);
      }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"+\\",\\"b\\"]]]]", {}));
      shell((a, b) => {
        return a + b;
      });"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu } from 'typegpu';

      const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);

          const shell = tgpu.fn([]);

          shell((/*#__PURE__*/__tgpu_meta((a, b) => {
            'use gpu';
            return __tsover_add(a, b);
          }, '[["a","b"],[[10,[1,"a","+","b"]]]]', {})));

          shell((a, b) => {
            return a + b;
          });
      "
    `);
  });
});

describe('marked anonymous function expressions passed to shells', () => {
  const code = `\
    import { tgpu } from 'typegpu';

    const shell = tgpu.fn([]);

    shell(function(a, b){
      'use gpu';
      return a + b;
    })

    shell(function(a, b) {
      return a + b;
    })
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      import { tgpu } from 'typegpu';
      const shell = tgpu.fn([]);
      shell(/*#__PURE__*/__tgpu_meta(function (a, b) {
        'use gpu';

        return __tsover_add(a, b);
      }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"+\\",\\"b\\"]]]]", {}));
      shell(function (a, b) {
        return a + b;
      });"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu } from 'typegpu';

      const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);

          const shell = tgpu.fn([]);

          shell((/*#__PURE__*/__tgpu_meta(function(a, b){
            'use gpu';
            return __tsover_add(a, b);
          }, '[["a","b"],[[10,[1,"a","+","b"]]]]', {})));

          shell(function(a, b) {
            return a + b;
          });
      "
    `);
  });
});

describe('marked named function expressions passed to shells', () => {
  const code = `\
    import { tgpu } from 'typegpu';

    const shell = tgpu.fn([]);

    shell(function addGPU(a, b){
      'use gpu';
      return a + b;
    })

    shell(function addCPU(a, b) {
      return a + b;
    })
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      import { tgpu } from 'typegpu';
      const shell = tgpu.fn([]);
      shell(/*#__PURE__*/__tgpu_meta(function addGPU(a, b) {
        'use gpu';

        return __tsover_add(a, b);
      }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"+\\",\\"b\\"]]]]", {}, "addGPU"));
      shell(function addCPU(a, b) {
        return a + b;
      });"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu } from 'typegpu';

      const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);

          const shell = tgpu.fn([]);

          shell((/*#__PURE__*/__tgpu_meta(function addGPU(a, b){
            'use gpu';
            return __tsover_add(a, b);
          }, '[["a","b"],[[10,[1,"a","+","b"]]]]', {}, "addGPU")));

          shell(function addCPU(a, b) {
            return a + b;
          });
      "
    `);
  });
});

describe('reassigned marked function statements', () => {
  const code = `\
    function shader() {
      'use gpu';
      return 1;
    }

    shader = () => 2;

    console.log(shader());
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      let shader = /*#__PURE__*/__tgpu_meta(function shader() {
        'use gpu';

        return 1;
      }, "[[],[[10,1]]]", {}, "shader");
      shader = () => 2;
      console.log(shader());"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          let shader = (/*#__PURE__*/__tgpu_meta(function shader() {
            'use gpu';
            return 1;
          }, '[[],[[10,1]]]', {}, "shader"));



          shader = () => 2;

          console.log(shader());
      "
    `);
  });
});

describe('marked function statements', () => {
  const code = `
    /** ADD */
    function addGPU(a, b) {
      'use gpu';
      // hello there
      return a + b;
    }


    function addCPU(a, b) {
      return a + b;
    }

    console.log(addGPU(1, 2), addCPU(2, 4));
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      /** ADD */
      let addGPU = /*#__PURE__*/__tgpu_meta(function addGPU(a, b) {
        'use gpu';

        // hello there
        return __tsover_add(a, b);
      }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"+\\",\\"b\\"]]]]", {}, "addGPU");
      function addCPU(a, b) {
        return a + b;
      }
      console.log(addGPU(1, 2), addCPU(2, 4));"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);

          /** ADD */
          let addGPU = (/*#__PURE__*/__tgpu_meta(function addGPU(a, b) {
            'use gpu';
            // hello there
            return __tsover_add(a, b);
          }, '[["a","b"],[[10,[1,"a","+","b"]]]]', {}, "addGPU"));




          function addCPU(a, b) {
            return a + b;
          }

          console.log(addGPU(1, 2), addCPU(2, 4));
      "
    `);
  });
});

describe('marked object methods', () => {
  const code = `\
    const obj = {
      /** MOD */
      mod: (a, b) => {
        'use gpu';
        return a % b;
      }
    }

    /** PRIME */
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

    console.log(obj, isPrime);
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      const obj = {
        /** MOD */
        mod: /*#__PURE__*/__tgpu_meta((a, b) => {
          'use gpu';

          return __tsover_mod(a, b);
        }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"%\\",\\"b\\"]]]]", {}, "mod")
      };

      /** PRIME */
      const isPrime = /*#__PURE__*/__tgpu_meta(n => {
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
      }, "[[\\"n\\"],[[11,[1,\\"n\\",\\"<=\\",1],[0,[[10,false]]]],[14,[12,\\"i\\",2],[1,\\"i\\",\\"<\\",\\"n\\"],[102,\\"++\\",\\"i\\"],[0,[[11,[1,[6,\\"obj.mod\\",[\\"n\\",\\"i\\"]],\\"===\\",0],[0,[[10,false]]]]]]],[10,true]]]", {
        "obj.mod": () => obj.mod
      }, "isPrime");
      console.log(obj, isPrime);"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          const obj = {
            /** MOD */
            mod: (/*#__PURE__*/__tgpu_meta((a, b) => {
              'use gpu';
              return __tsover_mod(a, b);
            }, '[["a","b"],[[10,[1,"a","%","b"]]]]', {}, "mod"))
          };

          /** PRIME */
          const isPrime = (/*#__PURE__*/__tgpu_meta((n) => {
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
          }, '[["n"],[[11,[1,"n","<=",1],[0,[[10,false]]]],[14,[12,"i",2],[1,"i","<","n"],[102,"++","i"],[0,[[11,[1,[6,"obj.mod",["n","i"]],"===",0],[0,[[10,false]]]]]]],[10,true]]]', {"obj.mod":() => obj.mod}, "isPrime"));

          console.log(obj, isPrime);
      "
    `);
  });
});

describe('transforms numeric operations', () => {
  const code = `\
    import { tgpu, d } from 'typegpu';

    const root = await tgpu.init();
    const countMutable = root.createMutable(d.i32, 0);

    /** the main function */
    // another comment
    const main = (a, b) => {
      'use gpu';
      let c = a + b + 2;
      c += 2 * b;
      countMutable.$ += 3;
    };

    console.log(main);
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      import { tgpu, d } from 'typegpu';
      const root = await tgpu.init();
      const countMutable = root.createMutable(d.i32, 0);

      /** the main function */
      // another comment
      const main = /*#__PURE__*/__tgpu_meta((a, b) => {
        'use gpu';

        let c = __tsover_add(__tsover_add(a, b), 2);
        c = __tsover_add(c, __tsover_mul(2, b));
        countMutable.$ = __tsover_add(countMutable.$, 3);
      }, "[[\\"a\\",\\"b\\"],[[12,\\"c\\",[1,[1,\\"a\\",\\"+\\",\\"b\\"],\\"+\\",2]],[2,\\"c\\",\\"+=\\",[1,2,\\"*\\",\\"b\\"]],[2,[7,\\"countMutable\\",\\"$\\"],\\"+=\\",3]]]", {
        "countMutable": () => countMutable
      }, "main");
      console.log(main);"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu, d } from 'typegpu';

      const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);

          const root = await tgpu.init();
          const countMutable = root.createMutable(d.i32, 0);

          /** the main function */
          // another comment
          const main = (/*#__PURE__*/__tgpu_meta((a, b) => {
            'use gpu';
            let c = __tsover_add(__tsover_add(a, b), 2);
            c = __tsover_add(c, __tsover_mul(2, b));
            countMutable.$ = __tsover_add(countMutable.$, 3);
          }, '[["a","b"],[[12,"c",[1,[1,"a","+","b"],"+",2]],[2,"c","+=",[1,2,"*","b"]],[2,[7,"countMutable","$"],"+=",3]]]', {"countMutable":() => countMutable}, "main"));

          console.log(main);
      "
    `);
  });
});

describe('hoists global function statements marked with "use gpu"', () => {
  const code = `\
    console.log(add, mul);

    /** ADD */
    // another comment
    function add(a, b) {
      'use gpu';
      return a + b;
    }

    /** MUL */
    // another comment
    function mul(a, b) {
      'use gpu';
      return a * b;
    }

  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      /** MUL */
      // another comment
      let mul = /*#__PURE__*/__tgpu_meta(function mul(a, b) {
        'use gpu';

        return __tsover_mul(a, b);
      }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"*\\",\\"b\\"]]]]", {}, "mul");
      /** ADD */
      // another comment
      let add = /*#__PURE__*/__tgpu_meta(function add(a, b) {
        'use gpu';

        return __tsover_add(a, b);
      }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"+\\",\\"b\\"]]]]", {}, "add");
      console.log(add, mul);"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          /** MUL */
      // another comment
      let mul = (/*#__PURE__*/__tgpu_meta(function mul(a, b) {
            'use gpu';
            return __tsover_mul(a, b);
          }, '[["a","b"],[[10,[1,"a","*","b"]]]]', {}, "mul"));

      /** ADD */
      // another comment
      let add = (/*#__PURE__*/__tgpu_meta(function add(a, b) {
            'use gpu';
            return __tsover_add(a, b);
          }, '[["a","b"],[[10,[1,"a","+","b"]]]]', {}, "add"));

      console.log(add, mul);
      "
    `);
  });
});

describe('hoists function statements marked with "use gpu" that shadow their own name', () => {
  const code = `\
    console.log(miter);

    function miter(a) {
      'use gpu';
      const miter = a * 2;
      return miter;
    }
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      let miter = /*#__PURE__*/__tgpu_meta(function miter(a) {
        'use gpu';

        const miter = __tsover_mul(a, 2);
        return miter;
      }, "[[\\"a\\"],[[13,\\"miter\\",[1,\\"a\\",\\"*\\",2]],[10,\\"miter\\"]]]", {}, "miter");
      console.log(miter);"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          let miter = (/*#__PURE__*/__tgpu_meta(function miter(a) {
            'use gpu';
            const miter = __tsover_mul(a, 2);
            return miter;
          }, '[["a"],[[13,"miter",[1,"a","*",2]],[10,"miter"]]]', {}, "miter"));

      console.log(miter);
      "
    `);
  });
});

describe('hoists function statements marked with "use gpu", scoped inside another function statement', () => {
  const code = `\
    export function scope() {
      console.log(add, mul);

      /** ADD */
      // another comment
      function add(a, b) {
        'use gpu';
        return a + b;
      }

      /** MUL */
      // another comment
      function mul(a, b) {
        'use gpu';
        return a * b;
      }
    }
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      export function scope() {
        /** MUL */
        // another comment
        let mul = /*#__PURE__*/__tgpu_meta(function mul(a, b) {
          'use gpu';

          return __tsover_mul(a, b);
        }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"*\\",\\"b\\"]]]]", {}, "mul");
        /** ADD */
        // another comment
        let add = /*#__PURE__*/__tgpu_meta(function add(a, b) {
          'use gpu';

          return __tsover_add(a, b);
        }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"+\\",\\"b\\"]]]]", {}, "add");
        console.log(add, mul);
      }"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          function scope() {
            /** MUL */
      // another comment
      let mul = (/*#__PURE__*/__tgpu_meta(function mul(a, b) {
              'use gpu';
              return __tsover_mul(a, b);
            }, '[["a","b"],[[10,[1,"a","*","b"]]]]', {}, "mul"));

      /** ADD */
      // another comment
      let add = (/*#__PURE__*/__tgpu_meta(function add(a, b) {
              'use gpu';
              return __tsover_add(a, b);
            }, '[["a","b"],[[10,[1,"a","+","b"]]]]', {}, "add"));

      console.log(add, mul);

            
            
            

            
            
            
          }

      export { scope };
      "
    `);
  });
});

describe('hoists function statements marked with "use gpu", scoped inside an arrow function', () => {
  const code = `\
    export const scope = () => {
      console.log(add, mul);

      /** ADD */
      // another comment
      function add(a, b) {
        'use gpu';
        return a + b;
      }

      /** MUL */
      // another comment
      function mul(a, b) {
        'use gpu';
        return a * b;
      }
    };
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      export const scope = () => {
        /** MUL */
        // another comment
        let mul = /*#__PURE__*/__tgpu_meta(function mul(a, b) {
          'use gpu';

          return __tsover_mul(a, b);
        }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"*\\",\\"b\\"]]]]", {}, "mul");
        /** ADD */
        // another comment
        let add = /*#__PURE__*/__tgpu_meta(function add(a, b) {
          'use gpu';

          return __tsover_add(a, b);
        }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"+\\",\\"b\\"]]]]", {}, "add");
        console.log(add, mul);
      };"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          const scope = () => {
            /** MUL */
      // another comment
      let mul = (/*#__PURE__*/__tgpu_meta(function mul(a, b) {
              'use gpu';
              return __tsover_mul(a, b);
            }, '[["a","b"],[[10,[1,"a","*","b"]]]]', {}, "mul"));

      /** ADD */
      // another comment
      let add = (/*#__PURE__*/__tgpu_meta(function add(a, b) {
              'use gpu';
              return __tsover_add(a, b);
            }, '[["a","b"],[[10,[1,"a","+","b"]]]]', {}, "add"));

      console.log(add, mul);

            
            
            

            
            
            
          };

      export { scope };
      "
    `);
  });
});

describe('hoists function statements marked with "use gpu", scoped inside an if statement', () => {
  const code = `\
    const c = 1 + 2;
    if (globalThis.YUP) {
      console.log(add, mul);

      /** ADD */
      // another comment
      function add(a, b) {
        'use gpu';
        return a + b + c;
      }

      /** MUL */
      // another comment
      function mul(a, b) {
        'use gpu';
        return a * b * c;
      }
    }
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      const c = 1 + 2;
      if (globalThis.YUP) {
        /** MUL */
        // another comment
        let mul = /*#__PURE__*/__tgpu_meta(function mul(a, b) {
          'use gpu';

          return __tsover_mul(__tsover_mul(a, b), c);
        }, "[[\\"a\\",\\"b\\"],[[10,[1,[1,\\"a\\",\\"*\\",\\"b\\"],\\"*\\",\\"c\\"]]]]", {
          "c": () => c
        }, "mul");
        /** ADD */
        // another comment
        let add = /*#__PURE__*/__tgpu_meta(function add(a, b) {
          'use gpu';

          return __tsover_add(__tsover_add(a, b), c);
        }, "[[\\"a\\",\\"b\\"],[[10,[1,[1,\\"a\\",\\"+\\",\\"b\\"],\\"+\\",\\"c\\"]]]]", {
          "c": () => c
        }, "add");
        console.log(add, mul);
      }"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          const c = 1 + 2;
          if (globalThis.YUP) {
            /** MUL */
      // another comment
      let mul = (/*#__PURE__*/__tgpu_meta(function mul(a, b) {
              'use gpu';
              return __tsover_mul(__tsover_mul(a, b), c);
            }, '[["a","b"],[[10,[1,[1,"a","*","b"],"*","c"]]]]', {"c":() => c}, "mul"));

      /** ADD */
      // another comment
      let add = (/*#__PURE__*/__tgpu_meta(function add(a, b) {
              'use gpu';
              return __tsover_add(__tsover_add(a, b), c);
            }, '[["a","b"],[[10,[1,[1,"a","+","b"],"+","c"]]]]', {"c":() => c}, "add"));

      console.log(add, mul);

            
            
            

            
            
            
          }
      "
    `);
  });
});

describe('replaces function statements marked with "use gpu" in place when conditions aren\'t ideal (like within switch statements)', () => {
  const code = `\
    const c = 1 + 2;
    switch (globalThis.YUP) {
      case 0:
        console.log(add, mul);

        /** ADD */
        // another comment
        function add(a, b) {
          'use gpu';
          return a + b + c;
        }
        break;
      default:
        /** MUL */
        // another comment
        function mul(a, b) {
          'use gpu';
          return a * b * c;
        }
        break;
    }
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      const c = 1 + 2;
      switch (globalThis.YUP) {
        case 0:
          console.log(add, mul);

          /** ADD */
          // another comment
          let add = /*#__PURE__*/__tgpu_meta(function add(a, b) {
            'use gpu';

            return __tsover_add(__tsover_add(a, b), c);
          }, "[[\\"a\\",\\"b\\"],[[10,[1,[1,\\"a\\",\\"+\\",\\"b\\"],\\"+\\",\\"c\\"]]]]", {
            "c": () => c
          }, "add");
          break;
        default:
          /** MUL */
          // another comment
          let mul = /*#__PURE__*/__tgpu_meta(function mul(a, b) {
            'use gpu';

            return __tsover_mul(__tsover_mul(a, b), c);
          }, "[[\\"a\\",\\"b\\"],[[10,[1,[1,\\"a\\",\\"*\\",\\"b\\"],\\"*\\",\\"c\\"]]]]", {
            "c": () => c
          }, "mul");
          break;
      }"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          const c = 1 + 2;
          switch (globalThis.YUP) {
            case 0:
              console.log(add, mul);

              /** ADD */
              // another comment
              let add = (/*#__PURE__*/__tgpu_meta(function add(a, b) {
                'use gpu';
                return __tsover_add(__tsover_add(a, b), c);
              }, '[["a","b"],[[10,[1,[1,"a","+","b"],"+","c"]]]]', {"c":() => c}, "add"));


              break;
            default:
              /** MUL */
              // another comment
              let mul = (/*#__PURE__*/__tgpu_meta(function mul(a, b) {
                'use gpu';
                return __tsover_mul(__tsover_mul(a, b), c);
              }, '[["a","b"],[[10,[1,[1,"a","*","b"],"*","c"]]]]', {"c":() => c}, "mul"));


              break;
          }
      "
    `);
  });
});

describe('hoists exported marked function statements', () => {
  const code = `\
    console.log(add);
    console.log(mul);

    /** ADD */
    export function add(a, b) {
      'use gpu';
      return a + b;
    }

    /** MUL */
    export function mul(a, b) {
      'use gpu';
      return a * b;
    }
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      /** MUL */
      let mul = /*#__PURE__*/__tgpu_meta(function mul(a, b) {
        'use gpu';

        return __tsover_mul(a, b);
      }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"*\\",\\"b\\"]]]]", {}, "mul");
      /** ADD */
      let add = /*#__PURE__*/__tgpu_meta(function add(a, b) {
        'use gpu';

        return __tsover_add(a, b);
      }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"+\\",\\"b\\"]]]]", {}, "add");
      console.log(add);
      console.log(mul);
      export { add };
      export { mul };"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          /** MUL */
      let mul = (/*#__PURE__*/__tgpu_meta(function mul(a, b) {
            'use gpu';
            return __tsover_mul(a, b);
          }, '[["a","b"],[[10,[1,"a","*","b"]]]]', {}, "mul"));

      /** ADD */
      let add = (/*#__PURE__*/__tgpu_meta(function add(a, b) {
            'use gpu';
            return __tsover_add(a, b);
          }, '[["a","b"],[[10,[1,"a","+","b"]]]]', {}, "add"));

      console.log(add);
          console.log(mul);

      export { add, mul };
      "
    `);
  });
});

describe('hoists default exported marked function statement', () => {
  const code = `\
    console.log(add);

    /** ADD */
    export default function add(a, b) {
      'use gpu';
      return a + b;
    }
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      /** ADD */
      let add = /*#__PURE__*/__tgpu_meta(function add(a, b) {
        'use gpu';

        return __tsover_add(a, b);
      }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"+\\",\\"b\\"]]]]", {}, "add");
      console.log(add);
      export { add as default };"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          /** ADD */
      let add = (/*#__PURE__*/__tgpu_meta(function add(a, b) {
            'use gpu';
            return __tsover_add(a, b);
          }, '[["a","b"],[[10,[1,"a","+","b"]]]]', {}, "add"));
      console.log(add);

      export { add as default };
      "
    `);
  });
});

describe('reassigned default exported marked function statement', () => {
  const code = `\
    export default function shader() {
      'use gpu';
      return 1;
    }

    shader = () => 2;
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      let shader = /*#__PURE__*/__tgpu_meta(function shader() {
        'use gpu';

        return 1;
      }, "[[],[[10,1]]]", {}, "shader");
      export { shader as default };
      shader = () => 2;"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          let shader = (/*#__PURE__*/__tgpu_meta(function shader() {
            'use gpu';
            return 1;
          }, '[[],[[10,1]]]', {}, "shader"));

          shader = () => 2;

      export { shader as default };
      "
    `);
  });
});

describe('export marked arrow function', () => {
  const code = `\
    export const add = (a, b) => {
      'use gpu';
      return a + b;
    };

    const increment = (n) => {
      'use gpu';
      return n + 1;
    };

    export { increment };
    
    const mul = (a, b) => {
      'use gpu';
      return a * b;
    };

    export default mul;
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      export const add = /*#__PURE__*/__tgpu_meta((a, b) => {
        'use gpu';

        return __tsover_add(a, b);
      }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"+\\",\\"b\\"]]]]", {}, "add");
      const increment = /*#__PURE__*/__tgpu_meta(n => {
        'use gpu';

        return __tsover_add(n, 1);
      }, "[[\\"n\\"],[[10,[1,\\"n\\",\\"+\\",1]]]]", {}, "increment");
      export { increment };
      const mul = /*#__PURE__*/__tgpu_meta((a, b) => {
        'use gpu';

        return __tsover_mul(a, b);
      }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"*\\",\\"b\\"]]]]", {}, "mul");
      export default mul;"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          const add = (/*#__PURE__*/__tgpu_meta((a, b) => {
            'use gpu';
            return __tsover_add(a, b);
          }, '[["a","b"],[[10,[1,"a","+","b"]]]]', {}, "add"));

          const increment = (/*#__PURE__*/__tgpu_meta((n) => {
            'use gpu';
            return __tsover_add(n, 1);
          }, '[["n"],[[10,[1,"n","+",1]]]]', {}, "increment"));
          
          const mul = (/*#__PURE__*/__tgpu_meta((a, b) => {
            'use gpu';
            return __tsover_mul(a, b);
          }, '[["a","b"],[[10,[1,"a","*","b"]]]]', {}, "mul"));

      export { add, mul as default, increment };
      "
    `);
  });
});

describe('anonymous default export marked function statement', () => {
  const code = `\
    export default function (a, b) {
      'use gpu';
      return a + b;
    }
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      export default /*#__PURE__*/__tgpu_meta(function (a, b) {
        'use gpu';

        return __tsover_add(a, b);
      }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"+\\",\\"b\\"]]]]", {});"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          var _virtual_code = (/*#__PURE__*/__tgpu_meta(function (a, b) {
            'use gpu';
            return __tsover_add(a, b);
          }, '[["a","b"],[[10,[1,"a","+","b"]]]]', {}));

      export { _virtual_code as default };
      "
    `);
  });
});

describe('anonymous default export marked arrow function', () => {
  const code = `\
    export default (a, b) => {
      'use gpu';
      return a + b;
    }
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
      export default /*#__PURE__*/__tgpu_meta((a, b) => {
        'use gpu';

        return __tsover_add(a, b);
      }, "[[\\"a\\",\\"b\\"],[[10,[1,\\"a\\",\\"+\\",\\"b\\"]]]]", {});"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
          var _virtual_code = (/*#__PURE__*/__tgpu_meta((a, b) => {
            'use gpu';
            return __tsover_add(a, b);
          }, '[["a","b"],[[10,[1,"a","+","b"]]]]', {}));

      export { _virtual_code as default };
      "
    `);
  });
});
