import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform, webpackTransform } from './transform.ts';

describe('[BABEL] parser options', () => {
  it('with no include option, import determines whether to run the plugin', () => {
    const codeWithImport = `\
      import tgpu from 'typegpu';
      
      const increment = tgpu.fn([])(() => {
        const x = 2+2;
      });
    `;

    expect(
      babelTransform(codeWithImport, { include: [/virtual:/] }),
    ).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';
      const increment = tgpu.fn([])(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
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

    const codeWithoutImport = `\
      const increment = tgpu.fn([])(() => {
        const x = 2+2;
      });
    `;

    expect(
      babelTransform(codeWithoutImport, { include: [/virtual:/] }),
    ).toMatchInlineSnapshot(`
      "const increment = tgpu.fn([])(() => {
        const x = 2 + 2;
      });"
    `);
  });
});

describe('[ROLLUP] tgpu alias gathering', async () => {
  it('with no include option, import determines whether to run the plugin', async () => {
    const codeWithImport = `\
      import tgpu from 'typegpu';
      
      const increment = tgpu.fn([])(() => {
      });

      console.log(increment);
  `;

    expect(
      await rollupTransform(codeWithImport, { include: [/virtual:/] }),
    ).toMatchInlineSnapshot(`
      "import tgpu from 'typegpu';

      const increment = tgpu.fn([])((($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
            }), {
                    v: 1,
                    name: undefined,
                    ast: {"params":[],"body":[0,[]],"externalNames":[]},
                    externals: () => ({}),
                  }) && $.f)({})));

            console.log(increment);
      "
    `);

    const codeWithoutImport = `\
      const increment = tgpu.fn([])(() => {
        const x = 2+2;
      });

      console.log(increment);
    `;

    expect(
      await rollupTransform(codeWithoutImport, { include: [/virtual:/] }),
    ).toMatchInlineSnapshot(`
      "const increment = tgpu.fn([])(() => {
            });

            console.log(increment);
      "
    `);
  });
});

describe('[WEBPACK] parser options', () => {
  it('with import, plugin transforms the file', async () => {
    const codeWithImport = `\
      import tgpu from 'typegpu';

      const increment = tgpu.fn([])(() => {
      });

      console.log(increment);
    `;

    expect(await webpackTransform(codeWithImport)).toMatchInlineSnapshot(`
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

    const codeWithoutImport = `\
      const increment = tgpu.fn([])(() => {
        const x = 2+2;
      });

      console.log(increment);
    `;

    expect(await webpackTransform(codeWithoutImport)).toMatchInlineSnapshot(`
      "      const increment = tgpu.fn([])(() => {
              const x = 2+2;
            });

            console.log(increment);
          
      "
    `);
  });
});
