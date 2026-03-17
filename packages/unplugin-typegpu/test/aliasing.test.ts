import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform, webpackTransform } from './transform.ts';

describe('[BABEL] tgpu alias gathering', () => {
  it('works with default import named not tgpu', () => {
    const code = `\
      import hello from 'typegpu';

      const increment = hello.fn([])(() => {
        const x = 2+2;
      });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import hello from 'typegpu';
      const increment = hello.fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        const x = 2 + 2;
      }, {
        v: 1,
        name: void 0,
        ast: {"params":[],"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
        externals: () => {
          return {};
        }
      }) && $.f)({}));"
    `);
  });

  it('works with aliased tgpu import', () => {
    const code = `\
      import { tgpu as t } from 'typegpu';

      const increment = t.fn([])(() => {
        const x = 2+2;
      });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu as t } from 'typegpu';
      const increment = t.fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        const x = 2 + 2;
      }, {
        v: 1,
        name: void 0,
        ast: {"params":[],"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
        externals: () => {
          return {};
        }
      }) && $.f)({}));"
    `);
  });

  it('works with namespace import', () => {
    const code = `\
      import * as t from 'typegpu';

      const increment = t.tgpu.fn([])(() => {
        const x = 2+2;
      });
    `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import * as t from 'typegpu';
      const increment = t.tgpu.fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        const x = 2 + 2;
      }, {
        v: 1,
        name: void 0,
        ast: {"params":[],"body":[0,[[13,"x",[1,[5,"2"],"+",[5,"2"]]]]],"externalNames":[]},
        externals: () => {
          return {};
        }
      }) && $.f)({}));"
    `);
  });
});

describe('[ROLLUP] tgpu alias gathering', () => {
  it('works with default import named not tgpu', async () => {
    const code = `\
      import hello from 'typegpu';

      const increment = hello.fn([])(() => {
      });
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import hello from 'typegpu';

      hello.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
            }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({})));
      "
    `);
  });

  it('works with aliased tgpu import', async () => {
    const code = `\
      import { tgpu as t } from 'typegpu';

      const increment = t.fn([])(() => {
      });
    `;

    // aliasing removed by rollup, but technically it works
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import { tgpu } from 'typegpu';

      tgpu.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
            }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({})));
      "
    `);
  });

  it('works with namespace import', async () => {
    // TODO: Oh ohh, this breaks for some reason :(
    const code = `\
      import * as t from 'typegpu';

      const increment = t.tgpu.fn([])(() => {
      });
    `;

    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import * as t from 'typegpu';

      t.tgpu.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
            }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({})));
      "
    `);
  });
});

describe('[WEBPACK] tgpu alias gathering', () => {
  it('works with default import named not tgpu', async () => {
    const code = `\
      import hello from 'typegpu';

      const increment = hello.fn([])(() => {
      });

      console.log(increment);
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
            

            const increment = typegpu__WEBPACK_IMPORTED_MODULE_0__["default"].fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
            }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({})));

            console.log(increment);
          
      })();

      "
    `);
  });

  it('works with aliased tgpu import', async () => {
    const code = `\
      import { tgpu as t } from 'typegpu';

      const increment = t.fn([])(() => {
      });

      console.log(increment);
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
            

            const increment = typegpu__WEBPACK_IMPORTED_MODULE_0__.tgpu.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
            }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({})));

            console.log(increment);
          
      })();

      "
    `);
  });

  it('works with namespace import', async () => {
    const code = `\
      import * as t from 'typegpu';

      const increment = t.tgpu.fn([])(() => {
      });

      console.log(increment);
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
            

            const increment = typegpu__WEBPACK_IMPORTED_MODULE_0__.tgpu.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
            }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({})));

            console.log(increment);
          
      })();

      "
    `);
  });
});
