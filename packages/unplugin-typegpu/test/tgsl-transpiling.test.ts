import { describe, expect, it } from 'vitest';
import {
  babelTransform,
  rollupTransform,
  webpackTransform,
} from './transform.ts';

describe('[BABEL] plugin for transpiling tgsl functions to tinyest', () => {
  it('wraps argument passed to function shell with globalThis set call', () => {
    const code = `\
        import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        const counterBuffer = root
            .createBuffer(d.vec3f, d.vec3f(0, 1, 0))
            .$usage('storage');
        const counter = counterBuffer.as('mutable');

        const increment = tgpu
            .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })((input) => {
                const tmp = counter.$.x;
                counter.$.x = counter.$.y;
                counter.$.y += tmp;
                counter.$.z += d.f32(input.num.x);
            });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const counterBuffer = root.createBuffer(d.vec3f, d.vec3f(0, 1, 0)).$usage('storage');
      const counter = counterBuffer.as('mutable');
      const increment = tgpu.computeFn({
        in: {
          num: d.builtin.numWorkgroups
        },
        workgroupSize: [1]
      })(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = input => {
        const tmp = counter.$.x;
        counter.$.x = counter.$.y;
        counter.$.y += tmp;
        counter.$.z += d.f32(input.num.x);
      }, {
        v: 1,
        name: void 0,
        ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"tmp",[7,[7,"counter","$"],"x"]],[2,[7,[7,"counter","$"],"x"],"=",[7,[7,"counter","$"],"y"]],[2,[7,[7,"counter","$"],"y"],"+=","tmp"],[2,[7,[7,"counter","$"],"z"],"+=",[6,[7,"d","f32"],[[7,[7,"input","num"],"x"]]]]]],"externalNames":["counter","d"]},
        externals: () => {
          return {
            counter,
            d
          };
        }
      }) && $.f)({}));"
    `);
  });

  it('works for multiple functions, skips wgsl-implemented', () => {
    const code = `\
      import tgpu from 'typegpu';

      const a = tgpu.computeFn({ workgroupSize: [1] })((input) => {
        const x = true;
      });

      const b = tgpu.fn([])(() => {
        const y = 2 + 2;
      });

      const cx = 2;
      const c = tgpu.fn([])(() => cx);

      const d = tgpu.fn([])('() {}');
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const a = tgpu.computeFn({
        workgroupSize: [1]
      })(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = input => {
        const x = true;
      }, {
        v: 1,
        name: void 0,
        ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"x",true]]],"externalNames":[]},
        externals: () => {
          return {};
        }
      }) && $.f)({}));
      const b = tgpu.fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        const y = 2 + 2;
      }, {
        v: 1,
        name: void 0,
        ast: {"params":[],"body":[0,[[13,"y",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
        externals: () => {
          return {};
        }
      }) && $.f)({}));
      const cx = 2;
      const c = tgpu.fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => cx, {
        v: 1,
        name: void 0,
        ast: {"params":[],"body":[0,[[10,"cx"]]],"externalNames":["cx"]},
        externals: () => {
          return {
            cx
          };
        }
      }) && $.f)({}));
      const d = tgpu.fn([])('() {}');"
    `);
  });

  it('transpiles only function shell invocations', () => {
    const code = `\
        import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        tgpu.x()(d.arrayOf(d.u32));
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      tgpu.x()(d.arrayOf(d.u32));"
    `);
  });

  it('works with some typescript features', () => {
    const code = `\
        import tgpu from 'typegpu';

        const fun = tgpu.computeFn({ workgroupSize: [1] })((input) => {
          const x = true;
        });

        const funcWithAs = tgpu.computeFn({ workgroupSize: [1] })((input) => {
          const x = true as boolean;
        });

        const funcWithSatisfies = tgpu.computeFn({ workgroupSize: [1] })((input) => {
          const x = true satisfies boolean;
        });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const fun = tgpu.computeFn({
        workgroupSize: [1]
      })(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = input => {
        const x = true;
      }, {
        v: 1,
        name: void 0,
        ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"x",true]]],"externalNames":[]},
        externals: () => {
          return {};
        }
      }) && $.f)({}));
      const funcWithAs = tgpu.computeFn({
        workgroupSize: [1]
      })(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = input => {
        const x = true as boolean;
      }, {
        v: 1,
        name: void 0,
        ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"x",true]]],"externalNames":[]},
        externals: () => {
          return {};
        }
      }) && $.f)({}));
      const funcWithSatisfies = tgpu.computeFn({
        workgroupSize: [1]
      })(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = input => {
        const x = true satisfies boolean;
      }, {
        v: 1,
        name: void 0,
        ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"x",true]]],"externalNames":[]},
        externals: () => {
          return {};
        }
      }) && $.f)({}));"
    `);
  });

  it('correctly lists "this" in externals', () => {
    const code = `
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const root = await tgpu.init();

      class MyController {
        myBuffer = root.createUniform(d.u32);
        myFn = tgpu.fn([], d.u32)(() => {
          return this.myBuffer.$;
        });
      }

      const myController = new MyController();

      console.log(tgpu.resolve([myController.myFn]));`;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';
      const root = await tgpu.init();
      class MyController {
        myBuffer = root.createUniform(d.u32);
        myFn = tgpu.fn([], d.u32)(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
          return this.myBuffer.$;
        }, {
          v: 1,
          name: void 0,
          ast: {"params":[],"body":[0,[[10,[7,[7,"this","myBuffer"],"$"]]]],"externalNames":["this"]},
          externals: () => {
            return {
              this: this
            };
          }
        }) && $.f)({}));
      }
      const myController = new MyController();
      console.log(tgpu.resolve([myController.myFn]));"
    `);
  });
});

describe('[ROLLUP] plugin for transpiling tgsl functions to tinyest', () => {
  it('wraps argument passed to function shell with globalThis set call', async () => {
    const code = `\
        import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        const counterBuffer = root
            .createBuffer(d.vec3f, d.vec3f(0, 1, 0))
            .$usage('storage');
        const counter = counterBuffer.as('mutable');

        const increment = tgpu
            .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })((input) => {
            const tmp = counter.$.x;
            counter.$.x = counter.$.y;
            counter.$.y += tmp;
            counter.$.z += d.f32(input.num.x);
            });
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const counterBuffer = root
                  .createBuffer(d.vec3f, d.vec3f(0, 1, 0))
                  .$usage('storage');
              const counter = counterBuffer.as('mutable');

              tgpu
                  .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((input) => {
                  const tmp = counter.$.x;
                  counter.$.x = counter.$.y;
                  counter.$.y = __tsover_add(counter.$.y, tmp);
                  counter.$.z = __tsover_add(counter.$.z, d.f32(input.num.x));
                  }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"tmp",[7,[7,"counter","$"],"x"]],[2,[7,[7,"counter","$"],"x"],"=",[7,[7,"counter","$"],"y"]],[2,[7,[7,"counter","$"],"y"],"+=","tmp"],[2,[7,[7,"counter","$"],"z"],"+=",[6,[7,"d","f32"],[[7,[7,"input","num"],"x"]]]]]],"externalNames":["counter","d"]},
                    externals: () => ({counter, d}),
                  }) && $.f)({})));
      "
    `);
  });

  it('works for multiple functions, skips wgsl-implemented', async () => {
    const code = `\
        import tgpu from 'typegpu';

        const a = tgpu.computeFn({ workgroupSize: [1] })((input) => {
        const x = true;
        });

        const b = tgpu.fn([])(() => {
        const y = 2 + 2;
        });

        const cx = 2;
        const c = tgpu.fn([])(() => cx);

        const d = tgpu.fn([])('() {}');
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      tgpu.computeFn({ workgroupSize: [1] })((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((input) => {
              }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"x",true]]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({})));

              tgpu.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
              __tsover_add(2, 2);
              }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[[13,"y",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({})));

              const cx = 2;
              tgpu.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => cx), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[[10,"cx"]]],"externalNames":["cx"]},
                    externals: () => ({cx}),
                  }) && $.f)({})));

              tgpu.fn([])('() {}');
      "
    `);
  });

  it('transpiles only function shell invocations', async () => {
    const code = `\
        import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        tgpu.x()(d.arrayOf(d.u32));
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      tgpu.x()(d.arrayOf(d.u32));
      "
    `);
  });

  it('correctly lists "this" in externals', async () => {
    const code = `
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const root = await tgpu.init();

      class MyController {
        myBuffer = root.createUniform(d.u32);
        myFn = tgpu.fn([], d.u32)(() => {
          return this.myBuffer.$;
        });
      }

      const myController = new MyController();

      console.log(tgpu.resolve([myController.myFn]));`;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      const root = await tgpu.init();

            class MyController {
              myBuffer = root.createUniform(d.u32);
              myFn = tgpu.fn([], d.u32)((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                return this.myBuffer.$;
              }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[[10,[7,[7,"this","myBuffer"],"$"]]]],"externalNames":["this"]},
                    externals: () => ({"this": this}),
                  }) && $.f)({})));
            }

            const myController = new MyController();

            console.log(tgpu.resolve([myController.myFn]));
      "
    `);
  });
});

describe('[WEBPACK] plugin for transpiling tgsl functions to tinyest', () => {
  it('wraps argument passed to function shell with globalThis set call', async () => {
    const code = `\
        import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        const counterBuffer = root
            .createBuffer(d.vec3f, d.vec3f(0, 1, 0))
            .$usage('storage');
        const counter = counterBuffer.as('mutable');

        const increment = tgpu
            .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })((input) => {
            const tmp = counter.$.x;
            counter.$.x = counter.$.y;
            counter.$.y += tmp;
            counter.$.z += d.f32(input.num.x);
            });
    `;

    expect(await webpackTransform(code)).toMatchInlineSnapshot(`
      "import * as __WEBPACK_EXTERNAL_MODULE_typegpu__ from "typegpu";
      import * as __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__ from "typegpu/data";
      /******/ var __webpack_modules__ = ([
      /* 0 */,
      /* 1 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu__;

      /***/ }),
      /* 2 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__;

      /***/ })
      /******/ ]);
      /************************************************************************/
      /******/ // The module cache
      /******/ var __webpack_module_cache__ = {};
      /******/ 
      /******/ // The require function
      /******/ function __webpack_require__(moduleId) {
      /******/ 	// Check if module is in cache
      /******/ 	var cachedModule = __webpack_module_cache__[moduleId];
      /******/ 	if (cachedModule !== undefined) {
      /******/ 		return cachedModule.exports;
      /******/ 	}
      /******/ 	// Create a new module (and put it into the cache)
      /******/ 	var module = __webpack_module_cache__[moduleId] = {
      /******/ 		// no module.id needed
      /******/ 		// no module.loaded needed
      /******/ 		exports: {}
      /******/ 	};
      /******/ 
      /******/ 	// Execute the module function
      /******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
      /******/ 
      /******/ 	// Return the exports of the module
      /******/ 	return module.exports;
      /******/ }
      /******/ 
      /************************************************************************/
      /******/ /* webpack/runtime/make namespace object */
      /******/ (() => {
      /******/ 	// define __esModule on exports
      /******/ 	__webpack_require__.r = (exports) => {
      /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
      /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
      /******/ 		}
      /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
      /******/ 	};
      /******/ })();
      /******/ 
      /************************************************************************/
      var __webpack_exports__ = {};
      // This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
      (() => {
      __webpack_require__.r(__webpack_exports__);
      /* harmony import */ var typegpu__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
      /* harmony import */ var typegpu_data__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(2);
              
              

              const counterBuffer = root
                  .createBuffer(typegpu_data__WEBPACK_IMPORTED_MODULE_1__.vec3f, typegpu_data__WEBPACK_IMPORTED_MODULE_1__.vec3f(0, 1, 0))
                  .$usage('storage');
              const counter = counterBuffer.as('mutable');

              const increment = typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].computeFn({ in: { num: typegpu_data__WEBPACK_IMPORTED_MODULE_1__.builtin.numWorkgroups }, workgroupSize: [1] })((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((input) => {
                  const tmp = counter.$.x;
                  counter.$.x = counter.$.y;
                  counter.$.y = __tsover_add(counter.$.y, tmp);
                  counter.$.z = __tsover_add(counter.$.z, typegpu_data__WEBPACK_IMPORTED_MODULE_1__.f32(input.num.x));
                  }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"tmp",[7,[7,"counter","$"],"x"]],[2,[7,[7,"counter","$"],"x"],"=",[7,[7,"counter","$"],"y"]],[2,[7,[7,"counter","$"],"y"],"+=","tmp"],[2,[7,[7,"counter","$"],"z"],"+=",[6,[7,"d","f32"],[[7,[7,"input","num"],"x"]]]]]],"externalNames":["counter","d"]},
                    externals: () => ({counter, d: typegpu_data__WEBPACK_IMPORTED_MODULE_1__}),
                  }) && $.f)({})));
          
      })();

      "
    `);
  });

  it('works for multiple functions, skips wgsl-implemented', async () => {
    const code = `\
        import tgpu from 'typegpu';

        const a = tgpu.computeFn({ workgroupSize: [1] })((input) => {
        const x = true;
        });

        const b = tgpu.fn([])(() => {
        const y = 2 + 2;
        });

        const cx = 2;
        const c = tgpu.fn([])(() => cx);

        const d = tgpu.fn([])('() {}');
    `;

    expect(await webpackTransform(code)).toMatchInlineSnapshot(`
      "import * as __WEBPACK_EXTERNAL_MODULE_typegpu__ from "typegpu";
      /******/ var __webpack_modules__ = ([
      /* 0 */,
      /* 1 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu__;

      /***/ })
      /******/ ]);
      /************************************************************************/
      /******/ // The module cache
      /******/ var __webpack_module_cache__ = {};
      /******/ 
      /******/ // The require function
      /******/ function __webpack_require__(moduleId) {
      /******/ 	// Check if module is in cache
      /******/ 	var cachedModule = __webpack_module_cache__[moduleId];
      /******/ 	if (cachedModule !== undefined) {
      /******/ 		return cachedModule.exports;
      /******/ 	}
      /******/ 	// Create a new module (and put it into the cache)
      /******/ 	var module = __webpack_module_cache__[moduleId] = {
      /******/ 		// no module.id needed
      /******/ 		// no module.loaded needed
      /******/ 		exports: {}
      /******/ 	};
      /******/ 
      /******/ 	// Execute the module function
      /******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
      /******/ 
      /******/ 	// Return the exports of the module
      /******/ 	return module.exports;
      /******/ }
      /******/ 
      /************************************************************************/
      /******/ /* webpack/runtime/make namespace object */
      /******/ (() => {
      /******/ 	// define __esModule on exports
      /******/ 	__webpack_require__.r = (exports) => {
      /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
      /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
      /******/ 		}
      /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
      /******/ 	};
      /******/ })();
      /******/ 
      /************************************************************************/
      var __webpack_exports__ = {};
      // This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
      (() => {
      __webpack_require__.r(__webpack_exports__);
      /* harmony import */ var typegpu__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
              

              const a = typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].computeFn({ workgroupSize: [1] })((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((input) => {
              const x = true;
              }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[{"type":"i","name":"input"}],"body":[0,[[13,"x",true]]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({})));

              const b = typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
              const y = __tsover_add(2, 2);
              }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[[13,"y",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({})));

              const cx = 2;
              const c = typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => cx), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[[10,"cx"]]],"externalNames":["cx"]},
                    externals: () => ({cx}),
                  }) && $.f)({})));

              const d = typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].fn([])('() {}');
          
      })();

      "
    `);
  });

  it('transpiles only function shell invocations', async () => {
    const code = `\
        import tgpu from 'typegpu';
        import * as d from 'typegpu/data';

        tgpu.x()(d.arrayOf(d.u32));
    `;

    expect(await webpackTransform(code)).toMatchInlineSnapshot(`
      "import * as __WEBPACK_EXTERNAL_MODULE_typegpu__ from "typegpu";
      import * as __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__ from "typegpu/data";
      /******/ var __webpack_modules__ = ([
      /* 0 */,
      /* 1 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu__;

      /***/ }),
      /* 2 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__;

      /***/ })
      /******/ ]);
      /************************************************************************/
      /******/ // The module cache
      /******/ var __webpack_module_cache__ = {};
      /******/ 
      /******/ // The require function
      /******/ function __webpack_require__(moduleId) {
      /******/ 	// Check if module is in cache
      /******/ 	var cachedModule = __webpack_module_cache__[moduleId];
      /******/ 	if (cachedModule !== undefined) {
      /******/ 		return cachedModule.exports;
      /******/ 	}
      /******/ 	// Create a new module (and put it into the cache)
      /******/ 	var module = __webpack_module_cache__[moduleId] = {
      /******/ 		// no module.id needed
      /******/ 		// no module.loaded needed
      /******/ 		exports: {}
      /******/ 	};
      /******/ 
      /******/ 	// Execute the module function
      /******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
      /******/ 
      /******/ 	// Return the exports of the module
      /******/ 	return module.exports;
      /******/ }
      /******/ 
      /************************************************************************/
      /******/ /* webpack/runtime/make namespace object */
      /******/ (() => {
      /******/ 	// define __esModule on exports
      /******/ 	__webpack_require__.r = (exports) => {
      /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
      /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
      /******/ 		}
      /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
      /******/ 	};
      /******/ })();
      /******/ 
      /************************************************************************/
      var __webpack_exports__ = {};
      // This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
      (() => {
      __webpack_require__.r(__webpack_exports__);
      /* harmony import */ var typegpu__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
      /* harmony import */ var typegpu_data__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(2);
              
              

              typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].x()(typegpu_data__WEBPACK_IMPORTED_MODULE_1__.arrayOf(typegpu_data__WEBPACK_IMPORTED_MODULE_1__.u32));
          
      })();

      "
    `);
  });

  it('correctly lists "this" in externals', async () => {
    const code = `
      import tgpu from 'typegpu';
      import * as d from 'typegpu/data';

      async function main() {
        const root = await tgpu.init();

        class MyController {
          myBuffer = root.createUniform(d.u32);
          myFn = tgpu.fn([], d.u32)(() => {
            return this.myBuffer.$;
          });
        }

        const myController = new MyController();

        console.log(tgpu.resolve([myController.myFn]));
      }`;

    expect(await webpackTransform(code)).toMatchInlineSnapshot(`
      "import * as __WEBPACK_EXTERNAL_MODULE_typegpu__ from "typegpu";
      import * as __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__ from "typegpu/data";
      /******/ var __webpack_modules__ = ([
      /* 0 */,
      /* 1 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu__;

      /***/ }),
      /* 2 */
      /***/ ((module) => {

      module.exports = __WEBPACK_EXTERNAL_MODULE_typegpu_data_889390c4__;

      /***/ })
      /******/ ]);
      /************************************************************************/
      /******/ // The module cache
      /******/ var __webpack_module_cache__ = {};
      /******/ 
      /******/ // The require function
      /******/ function __webpack_require__(moduleId) {
      /******/ 	// Check if module is in cache
      /******/ 	var cachedModule = __webpack_module_cache__[moduleId];
      /******/ 	if (cachedModule !== undefined) {
      /******/ 		return cachedModule.exports;
      /******/ 	}
      /******/ 	// Create a new module (and put it into the cache)
      /******/ 	var module = __webpack_module_cache__[moduleId] = {
      /******/ 		// no module.id needed
      /******/ 		// no module.loaded needed
      /******/ 		exports: {}
      /******/ 	};
      /******/ 
      /******/ 	// Execute the module function
      /******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
      /******/ 
      /******/ 	// Return the exports of the module
      /******/ 	return module.exports;
      /******/ }
      /******/ 
      /************************************************************************/
      /******/ /* webpack/runtime/make namespace object */
      /******/ (() => {
      /******/ 	// define __esModule on exports
      /******/ 	__webpack_require__.r = (exports) => {
      /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
      /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
      /******/ 		}
      /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
      /******/ 	};
      /******/ })();
      /******/ 
      /************************************************************************/
      var __webpack_exports__ = {};
      // This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
      (() => {
      __webpack_require__.r(__webpack_exports__);
      /* harmony import */ var typegpu__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
      /* harmony import */ var typegpu_data__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(2);

            
            

            async function main() {
              const root = await typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].init();

              class MyController {
                myBuffer = root.createUniform(typegpu_data__WEBPACK_IMPORTED_MODULE_1__.u32);
                myFn = typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].fn([], typegpu_data__WEBPACK_IMPORTED_MODULE_1__.u32)((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                  return this.myBuffer.$;
                }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[[10,[7,[7,"this","myBuffer"],"$"]]]],"externalNames":["this"]},
                    externals: () => ({"this": this}),
                  }) && $.f)({})));
              }

              const myController = new MyController();

              console.log(typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].resolve([myController.myFn]));
            }
      })();

      "
    `);
  });
});
