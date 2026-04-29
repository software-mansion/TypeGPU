import { describe, expect, test } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

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
      "/** ADD */
      // another comment
      const addGPU = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (a, b) => {
        'use gpu';

        return __tsover_add(a, b);
      }, {
        v: 1,
        name: "addGPU",
        ast: {
          params: [{
            type: "i",
            name: "a"
          }, {
            type: "i",
            name: "b"
          }],
          body: [0, [[10, [1, "a", "+", "b"]]]],
          externalNames: {}
        },
        externals: () => {
          return {};
        },
        externals2: {}
      }) && $.f)({});
      const addCPU = (a, b) => {
        return a + b;
      };
      console.log(addGPU, addCPU);"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "/** ADD */
          // another comment
          const addGPU = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((a, b) => {
            'use gpu';
            return __tsover_add(a, b);
          }), {
          v: 1,
          name: "addGPU",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":{}},
          externals: () => ({}),
          externals2: {  }
        }) && $.f)({}));

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

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const shell = tgpu.fn([]);
      shell(/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (a, b) => {
        'use gpu';

        return __tsover_add(a, b);
      }, {
        v: 1,
        name: undefined,
        ast: {
          params: [{
            type: "i",
            name: "a"
          }, {
            type: "i",
            name: "b"
          }],
          body: [0, [[10, [1, "a", "+", "b"]]]],
          externalNames: {}
        },
        externals: () => {
          return {};
        },
        externals2: {}
      }) && $.f)({}));
      shell((a, b) => {
        return a + b;
      });"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const shell = tgpu.fn([]);

          shell((/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((a, b) => {
            'use gpu';
            return __tsover_add(a, b);
          }), {
          v: 1,
          name: undefined,
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":{}},
          externals: () => ({}),
          externals2: {  }
        }) && $.f)({})));

          shell((a, b) => {
            return a + b;
          });
      "
    `);
  });
});

describe('marked anonymous function expressions passed to shells', () => {
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

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const shell = tgpu.fn([]);
      shell(/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function (a, b) {
        'use gpu';

        return __tsover_add(a, b);
      }, {
        v: 1,
        name: undefined,
        ast: {
          params: [{
            type: "i",
            name: "a"
          }, {
            type: "i",
            name: "b"
          }],
          body: [0, [[10, [1, "a", "+", "b"]]]],
          externalNames: {}
        },
        externals: () => {
          return {};
        },
        externals2: {}
      }) && $.f)({}));
      shell(function (a, b) {
        return a + b;
      });"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const shell = tgpu.fn([]);

          shell((/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function(a, b){
            'use gpu';
            return __tsover_add(a, b);
          }), {
          v: 1,
          name: undefined,
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":{}},
          externals: () => ({}),
          externals2: {  }
        }) && $.f)({})));

          shell(function(a, b) {
            return a + b;
          });
      "
    `);
  });
});

describe('marked named function expressions passed to shells', () => {
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

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const shell = tgpu.fn([]);
      shell(/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function addGPU(a, b) {
        'use gpu';

        return __tsover_add(a, b);
      }, {
        v: 1,
        name: "addGPU",
        ast: {
          params: [{
            type: "i",
            name: "a"
          }, {
            type: "i",
            name: "b"
          }],
          body: [0, [[10, [1, "a", "+", "b"]]]],
          externalNames: {}
        },
        externals: () => {
          return {};
        },
        externals2: {}
      }) && $.f)({}));
      shell(function addCPU(a, b) {
        return a + b;
      });"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const shell = tgpu.fn([]);

          shell((/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function addGPU(a, b){
            'use gpu';
            return __tsover_add(a, b);
          }), {
          v: 1,
          name: "addGPU",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":{}},
          externals: () => ({}),
          externals2: {  }
        }) && $.f)({})));

          shell(function addCPU(a, b) {
            return a + b;
          });
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
      "/** ADD */
      const addGPU = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function addGPU(a, b) {
        'use gpu';

        // hello there
        return __tsover_add(a, b);
      }, {
        v: 1,
        name: "addGPU",
        ast: {
          params: [{
            type: "i",
            name: "a"
          }, {
            type: "i",
            name: "b"
          }],
          body: [0, [[10, [1, "a", "+", "b"]]]],
          externalNames: {}
        },
        externals: () => {
          return {};
        },
        externals2: {}
      }) && $.f)({});
      function addCPU(a, b) {
        return a + b;
      }
      console.log(addGPU(1, 2), addCPU(2, 4));"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "/** ADD */
          const addGPU = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function addGPU(a, b) {
            'use gpu';
            // hello there
            return __tsover_add(a, b);
          }), {
          v: 1,
          name: "addGPU",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":{}},
          externals: () => ({}),
          externals2: {  }
        }) && $.f)({}));




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
      "const obj = {
        /** MOD */
        mod: /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (a, b) => {
          'use gpu';

          return __tsover_mod(a, b);
        }, {
          v: 1,
          name: "mod",
          ast: {
            params: [{
              type: "i",
              name: "a"
            }, {
              type: "i",
              name: "b"
            }],
            body: [0, [[10, [1, "a", "%", "b"]]]],
            externalNames: {}
          },
          externals: () => {
            return {};
          },
          externals2: {}
        }) && $.f)({})
      };

      /** PRIME */
      const isPrime = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = n => {
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
        ast: {
          params: [{
            type: "i",
            name: "n"
          }],
          body: [0, [[11, [1, "n", "<=", [5, "1"]], [0, [[10, false]]]], [14, [12, "i", [5, "2"]], [1, "i", "<", "n"], [102, "++", "i"], [0, [[11, [1, [6, [7, "obj", "mod"], ["n", "i"]], "===", [5, "0"]], [0, [[10, false]]]]]]], [10, true]]],
          externalNames: {
            obj: {
              mod: "obj.mod"
            }
          }
        },
        externals: () => {
          return {
            obj
          };
        },
        externals2: {
          obj: {
            mod: () => obj.mod
          }
        }
      }) && $.f)({});
      console.log(obj, isPrime);"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const obj = {
            /** MOD */
            mod: (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((a, b) => {
              'use gpu';
              return __tsover_mod(a, b);
            }), {
          v: 1,
          name: "mod",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","%","b"]]]],"externalNames":{}},
          externals: () => ({}),
          externals2: {  }
        }) && $.f)({}))
          };

          /** PRIME */
          const isPrime = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((n) => {
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
          ast: {"params":[{"type":"i","name":"n"}],"body":[0,[[11,[1,"n","<=",[5,"1"]],[0,[[10,false]]]],[14,[12,"i",[5,"2"]],[1,"i","<","n"],[102,"++","i"],[0,[[11,[1,[6,[7,"obj","mod"],["n","i"]],"===",[5,"0"]],[0,[[10,false]]]]]]],[10,true]]],"externalNames":{"obj":{"mod":"obj.mod"}}},
          externals: () => ({obj}),
          externals2: { obj: { mod: () => obj.mod } }
        }) && $.f)({}));

          console.log(obj, isPrime);
      "
    `);
  });
});

describe('transforms numeric operations', () => {
  const code = `\
    import tgpu, { d } from 'typegpu';

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
      "import tgpu, { d } from 'typegpu';
      const root = await tgpu.init();
      const countMutable = root.createMutable(d.i32, 0);

      /** the main function */
      // another comment
      const main = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (a, b) => {
        'use gpu';

        let c = __tsover_add(__tsover_add(a, b), 2);
        c = __tsover_add(c, __tsover_mul(2, b));
        countMutable.$ = __tsover_add(countMutable.$, 3);
      }, {
        v: 1,
        name: "main",
        ast: {
          params: [{
            type: "i",
            name: "a"
          }, {
            type: "i",
            name: "b"
          }],
          body: [0, [[12, "c", [1, [1, "a", "+", "b"], "+", [5, "2"]]], [2, "c", "+=", [1, [5, "2"], "*", "b"]], [2, [7, "countMutable", "$"], "+=", [5, "3"]]]],
          externalNames: {
            countMutable: {
              $: "countMutable.$"
            }
          }
        },
        externals: () => {
          return {
            countMutable
          };
        },
        externals2: {
          countMutable: {
            $: () => countMutable.$
          }
        }
      }) && $.f)({});
      console.log(main);"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu, { d } from 'typegpu';

      const root = await tgpu.init();
          const countMutable = root.createMutable(d.i32, 0);

          /** the main function */
          // another comment
          const main = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((a, b) => {
            'use gpu';
            let c = __tsover_add(__tsover_add(a, b), 2);
            c = __tsover_add(c, __tsover_mul(2, b));
            countMutable.$ = __tsover_add(countMutable.$, 3);
          }), {
          v: 1,
          name: "main",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[12,"c",[1,[1,"a","+","b"],"+",[5,"2"]]],[2,"c","+=",[1,[5,"2"],"*","b"]],[2,[7,"countMutable","$"],"+=",[5,"3"]]]],"externalNames":{"countMutable":{"$":"countMutable.$"}}},
          externals: () => ({countMutable}),
          externals2: { countMutable: { $: () => countMutable.$ } }
        }) && $.f)({}));

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
      "/** MUL */
      // another comment
      const mul = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function mul(a, b) {
        'use gpu';

        return __tsover_mul(a, b);
      }, {
        v: 1,
        name: "mul",
        ast: {
          params: [{
            type: "i",
            name: "a"
          }, {
            type: "i",
            name: "b"
          }],
          body: [0, [[10, [1, "a", "*", "b"]]]],
          externalNames: {}
        },
        externals: () => {
          return {};
        },
        externals2: {}
      }) && $.f)({});
      /** ADD */
      // another comment
      const add = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function add(a, b) {
        'use gpu';

        return __tsover_add(a, b);
      }, {
        v: 1,
        name: "add",
        ast: {
          params: [{
            type: "i",
            name: "a"
          }, {
            type: "i",
            name: "b"
          }],
          body: [0, [[10, [1, "a", "+", "b"]]]],
          externalNames: {}
        },
        externals: () => {
          return {};
        },
        externals2: {}
      }) && $.f)({});
      console.log(add, mul);"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "/** MUL */
      // another comment
      const mul = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function mul(a, b) {
            'use gpu';
            return __tsover_mul(a, b);
          }), {
          v: 1,
          name: "mul",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","*","b"]]]],"externalNames":{}},
          externals: () => ({}),
          externals2: {  }
        }) && $.f)({}));

      /** ADD */
      // another comment
      const add = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function add(a, b) {
            'use gpu';
            return __tsover_add(a, b);
          }), {
          v: 1,
          name: "add",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":{}},
          externals: () => ({}),
          externals2: {  }
        }) && $.f)({}));

      console.log(add, mul);
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
      "export function scope() {
        /** MUL */
        // another comment
        const mul = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function mul(a, b) {
          'use gpu';

          return __tsover_mul(a, b);
        }, {
          v: 1,
          name: "mul",
          ast: {
            params: [{
              type: "i",
              name: "a"
            }, {
              type: "i",
              name: "b"
            }],
            body: [0, [[10, [1, "a", "*", "b"]]]],
            externalNames: {}
          },
          externals: () => {
            return {};
          },
          externals2: {}
        }) && $.f)({});
        /** ADD */
        // another comment
        const add = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function add(a, b) {
          'use gpu';

          return __tsover_add(a, b);
        }, {
          v: 1,
          name: "add",
          ast: {
            params: [{
              type: "i",
              name: "a"
            }, {
              type: "i",
              name: "b"
            }],
            body: [0, [[10, [1, "a", "+", "b"]]]],
            externalNames: {}
          },
          externals: () => {
            return {};
          },
          externals2: {}
        }) && $.f)({});
        console.log(add, mul);
      }"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "function scope() {
            /** MUL */
      // another comment
      const mul = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function mul(a, b) {
              'use gpu';
              return __tsover_mul(a, b);
            }), {
          v: 1,
          name: "mul",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","*","b"]]]],"externalNames":{}},
          externals: () => ({}),
          externals2: {  }
        }) && $.f)({}));

      /** ADD */
      // another comment
      const add = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function add(a, b) {
              'use gpu';
              return __tsover_add(a, b);
            }), {
          v: 1,
          name: "add",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":{}},
          externals: () => ({}),
          externals2: {  }
        }) && $.f)({}));

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
      "export const scope = () => {
        /** MUL */
        // another comment
        const mul = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function mul(a, b) {
          'use gpu';

          return __tsover_mul(a, b);
        }, {
          v: 1,
          name: "mul",
          ast: {
            params: [{
              type: "i",
              name: "a"
            }, {
              type: "i",
              name: "b"
            }],
            body: [0, [[10, [1, "a", "*", "b"]]]],
            externalNames: {}
          },
          externals: () => {
            return {};
          },
          externals2: {}
        }) && $.f)({});
        /** ADD */
        // another comment
        const add = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function add(a, b) {
          'use gpu';

          return __tsover_add(a, b);
        }, {
          v: 1,
          name: "add",
          ast: {
            params: [{
              type: "i",
              name: "a"
            }, {
              type: "i",
              name: "b"
            }],
            body: [0, [[10, [1, "a", "+", "b"]]]],
            externalNames: {}
          },
          externals: () => {
            return {};
          },
          externals2: {}
        }) && $.f)({});
        console.log(add, mul);
      };"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const scope = () => {
            /** MUL */
      // another comment
      const mul = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function mul(a, b) {
              'use gpu';
              return __tsover_mul(a, b);
            }), {
          v: 1,
          name: "mul",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","*","b"]]]],"externalNames":{}},
          externals: () => ({}),
          externals2: {  }
        }) && $.f)({}));

      /** ADD */
      // another comment
      const add = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function add(a, b) {
              'use gpu';
              return __tsover_add(a, b);
            }), {
          v: 1,
          name: "add",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":{}},
          externals: () => ({}),
          externals2: {  }
        }) && $.f)({}));

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
      "const c = 1 + 2;
      if (globalThis.YUP) {
        /** MUL */
        // another comment
        const mul = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function mul(a, b) {
          'use gpu';

          return __tsover_mul(__tsover_mul(a, b), c);
        }, {
          v: 1,
          name: "mul",
          ast: {
            params: [{
              type: "i",
              name: "a"
            }, {
              type: "i",
              name: "b"
            }],
            body: [0, [[10, [1, [1, "a", "*", "b"], "*", "c"]]]],
            externalNames: {
              c: "c"
            }
          },
          externals: () => {
            return {
              c
            };
          },
          externals2: {
            c: () => c
          }
        }) && $.f)({});
        /** ADD */
        // another comment
        const add = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function add(a, b) {
          'use gpu';

          return __tsover_add(__tsover_add(a, b), c);
        }, {
          v: 1,
          name: "add",
          ast: {
            params: [{
              type: "i",
              name: "a"
            }, {
              type: "i",
              name: "b"
            }],
            body: [0, [[10, [1, [1, "a", "+", "b"], "+", "c"]]]],
            externalNames: {
              c: "c"
            }
          },
          externals: () => {
            return {
              c
            };
          },
          externals2: {
            c: () => c
          }
        }) && $.f)({});
        console.log(add, mul);
      }"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const c = 1 + 2;
          if (globalThis.YUP) {
            /** MUL */
      // another comment
      const mul = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function mul(a, b) {
              'use gpu';
              return __tsover_mul(__tsover_mul(a, b), c);
            }), {
          v: 1,
          name: "mul",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,[1,"a","*","b"],"*","c"]]]],"externalNames":{"c":"c"}},
          externals: () => ({c}),
          externals2: { c: () => c }
        }) && $.f)({}));

      /** ADD */
      // another comment
      const add = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function add(a, b) {
              'use gpu';
              return __tsover_add(__tsover_add(a, b), c);
            }), {
          v: 1,
          name: "add",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,[1,"a","+","b"],"+","c"]]]],"externalNames":{"c":"c"}},
          externals: () => ({c}),
          externals2: { c: () => c }
        }) && $.f)({}));

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
      "const c = 1 + 2;
      switch (globalThis.YUP) {
        case 0:
          console.log(add, mul);

          /** ADD */
          // another comment
          const add = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function add(a, b) {
            'use gpu';

            return __tsover_add(__tsover_add(a, b), c);
          }, {
            v: 1,
            name: "add",
            ast: {
              params: [{
                type: "i",
                name: "a"
              }, {
                type: "i",
                name: "b"
              }],
              body: [0, [[10, [1, [1, "a", "+", "b"], "+", "c"]]]],
              externalNames: {
                c: "c"
              }
            },
            externals: () => {
              return {
                c
              };
            },
            externals2: {
              c: () => c
            }
          }) && $.f)({});
          break;
        default:
          /** MUL */
          // another comment
          const mul = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = function mul(a, b) {
            'use gpu';

            return __tsover_mul(__tsover_mul(a, b), c);
          }, {
            v: 1,
            name: "mul",
            ast: {
              params: [{
                type: "i",
                name: "a"
              }, {
                type: "i",
                name: "b"
              }],
              body: [0, [[10, [1, [1, "a", "*", "b"], "*", "c"]]]],
              externalNames: {
                c: "c"
              }
            },
            externals: () => {
              return {
                c
              };
            },
            externals2: {
              c: () => c
            }
          }) && $.f)({});
          break;
      }"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "const c = 1 + 2;
          switch (globalThis.YUP) {
            case 0:
              console.log(add, mul);

              /** ADD */
              // another comment
              const add = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function add(a, b) {
                'use gpu';
                return __tsover_add(__tsover_add(a, b), c);
              }), {
          v: 1,
          name: "add",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,[1,"a","+","b"],"+","c"]]]],"externalNames":{"c":"c"}},
          externals: () => ({c}),
          externals2: { c: () => c }
        }) && $.f)({}));


              break;
            default:
              /** MUL */
              // another comment
              const mul = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function mul(a, b) {
                'use gpu';
                return __tsover_mul(__tsover_mul(a, b), c);
              }), {
          v: 1,
          name: "mul",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,[1,"a","*","b"],"*","c"]]]],"externalNames":{"c":"c"}},
          externals: () => ({c}),
          externals2: { c: () => c }
        }) && $.f)({}));


              break;
          }
      "
    `);
  });
});

test('hoists exported marked function statements', async () => {
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

  expect(await rollupTransform(code)).toMatchInlineSnapshot(`
    "/** MUL */
    const mul = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function mul(a, b) {
          'use gpu';
          return __tsover_mul(a, b);
        }), {
        v: 1,
        name: "mul",
        ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","*","b"]]]],"externalNames":{}},
        externals: () => ({}),
        externals2: {  }
      }) && $.f)({}));

    /** ADD */
    const add = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (function add(a, b) {
          'use gpu';
          return __tsover_add(a, b);
        }), {
        v: 1,
        name: "add",
        ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]],"externalNames":{}},
        externals: () => ({}),
        externals2: {  }
      }) && $.f)({}));

    console.log(add);
        console.log(mul);

    export { add, mul };
    "
  `);
});
