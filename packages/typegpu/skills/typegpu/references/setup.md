# TypeGPU Project Setup

Docs: `https://docs.swmansion.com/TypeGPU/tooling/typegpu-cli.md`, `https://docs.swmansion.com/TypeGPU/tooling/unplugin-typegpu.md`, `https://docs.swmansion.com/TypeGPU/tooling/eslint-plugin-typegpu.md`.

## Fastest path: TypeGPU CLI

For a **new project** or when **adding TypeGPU to an existing one**, use the CLI. It installs the packages, wires the build plugin and types, and writes agent instructions:

```sh
npx typegpu@latest                 # scaffold a new project (interactive)
npx typegpu@latest my-app --yes    # non-interactive, defaults
npx typegpu@latest my-app --yes --template vite-react --addons @typegpu/sdf,@typegpu/noise
npx typegpu@latest --enhance       # add TypeGPU to the current (Vite) project; -e for short
npx typegpu@latest --enhance --yes --addons @typegpu/noise
```

- Templates: `vite-bare` (default), `vite-complex`, `vite-react`, `nextjs-bare`, `waku-bare`, `expo-bare`. Every template ships `unplugin-typegpu` (the Vite plugin; the Babel plugin for Next.js and Expo), `@webgpu/types`, `tsover` as `typescript`, `eslint-plugin-typegpu` through oxlint, `types`/`check`/`fix` scripts, and VS Code and Zed settings that select the workspace TypeScript.
- Add-ons: `@typegpu/color`, `@typegpu/noise`, `@typegpu/radiance-cascades`, `@typegpu/react`, `@typegpu/sdf`, `@typegpu/three`.
- `--yes` on a new project skips dependency installation (run the package manager's install afterwards). `--enhance --yes` installs the packages right away.
- Both flows write a TypeGPU block into `AGENTS.md` (and `CLAUDE.md`, as `@AGENTS.md` or a copy of the block) pointing agents at `node_modules/typegpu/skills/typegpu/SKILL.md`, and install this skill with `skills add software-mansion/TypeGPU#v<version> -s typegpu` through the package manager. Interactive runs ask first.
- `--enhance` supports Vite projects: it adds `@webgpu/types` to `tsconfig.app.json` or `tsconfig.json`, the plugin to the Vite config (creating `vite.config.ts` if missing), and `typegpu` plus add-ons. It does not set up `tsover` or the lint plugin; add them by hand (sections 4 and 5).
- Pass `--package-manager npm|pnpm|pnpm@6|yarn|yarn@berry|bun` when detection fails.

To port existing WGSL files, `npx tgpu-gen path/to/shader.wgsl` generates matching TypeGPU definitions (<https://docs.swmansion.com/TypeGPU/tooling/tgpu-gen.md>).

The manual steps below show what the CLI sets up and how to repair a broken setup.

## 1. Install TypeGPU

```sh
npm install typegpu
```

## 2. WebGPU types

```sh
npm install --save-dev @webgpu/types
```

```json
{
  "compilerOptions": {
    "types": ["@webgpu/types"]
  }
}
```

---

## 3. Build plugin - `unplugin-typegpu` (required for `'use gpu'`)

The `'use gpu'` directive and JS/TS shader functions need the build plugin.

```sh
npm install --save-dev unplugin-typegpu
```

### Vite

```js title="vite.config.js"
import { defineConfig } from 'vite';
import typegpu from 'unplugin-typegpu/vite';

export default defineConfig({
  plugins: [typegpu()],
});
```

Frameworks built on Vite take the same plugin in their Vite options (Waku: `vite: { plugins: [typegpu()] }` in `waku.config.ts`).

### Babel (React Native / Expo, Next.js)

```js title="babel.config.js"
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'], // 'next/babel' for Next.js
    plugins: ['unplugin-typegpu/babel'],
  };
};
```

### Node.js, Deno and Bun (no bundler)

Node.js 22.15+ and Deno 2.8+ transform shaders through synchronous module hooks, installed from a preload module:

```js title="preload.mjs"
import install from 'unplugin-typegpu/node'; // 'unplugin-typegpu/deno' is the same function

const hooks = install(); // accepts the plugin options below; hooks.deregister() removes them
```

```sh
node --import ./preload.mjs main.ts
deno run --import ./preload.mjs main.ts
```

Only modules loaded after `install()` are transformed. When calling it in the entry module instead, load the app with `await import('./main.ts')`. Node needs a separate JSX loader for `.jsx`/`.tsx`.

Bun: `await plugin(typegpu())` with `import typegpu from 'unplugin-typegpu/bun'` in a `--preload` module, or `plugins: [typegpu()]` in `Bun.build`. The Bun plugin takes a single RegExp `include` and no `exclude`.

Other entry points: `unplugin-typegpu/esbuild`, `/rollup`, `/rolldown`, `/rspack`, `/webpack`, `/farm`. Vite, Rollup and Babel are the ones maintained and tested by the TypeGPU team.

### Plugin options

```ts
typegpu({
  include?: FilterPattern,       // default: .js .ts .jsx .tsx .mjs .mts (the Node/Deno hooks add .cjs .cts)
  exclude?: FilterPattern,
  enforce?: 'pre' | 'post',
  autoNamingEnabled?: boolean,   // default: true - names resources from their variable names
  earlyPruning?: boolean,        // default: true - skips files without typegpu/tgpu/'use gpu'
  forceTgpuAlias?: string,       // only if the tgpu import is aliased unusually
})
```

Auto-naming makes generated WGSL and errors use the `const` names, so explicit `.$name()` calls are unnecessary.

---

## 4. Operator overloading - `tsover` (the default TypeGPU way)

`tsover` is a TypeScript fork that adds operator overloading to the type checker (`+ - * / %` on vectors and matrices). Without it the code still runs, but the IDE and `tsc` report `d.vec3f() * 2` as a type error. **Treat it as part of the standard setup**: operators are the idiomatic TypeGPU style. Fall back to `std.add`/`.mul()` only if the user declines or the project's tooling rules it out.

`unplugin-typegpu` already lowers operators inside `'use gpu'` functions; `tsover` supplies the types, and its `'use tsover'` directive extends operators to CPU-side code.

### Install

Alias `typescript` to `tsover` with the same major.minor as the project's TypeScript (`tsover@6.0.x` is TypeScript 6.0, `tsover@5.9.x` is 5.9), and force the alias for tools that depend on `typescript`:

```json
{
  "devDependencies": {
    "typescript": "npm:tsover@^6.0.2"
  },
  "overrides": { "typescript": "npm:tsover@^6.0.2" },
  "pnpm": { "overrides": { "typescript": "npm:tsover@^6.0.2" } },
  "resolutions": { "typescript": "npm:tsover@^6.0.2" }
}
```

`overrides` is for npm, `pnpm.overrides` for pnpm, `resolutions` for Yarn; keep the one that matches. Expo projects also need `"expo": { "install": { "exclude": ["typescript"] } }` so `expo install` doesn't replace it.

### Enable in code

No `tsconfig.json` changes. Inside `'use gpu'` functions operators work as-is. For CPU-side code, add `'use tsover'` at file or function scope; outside both directives tsover reports operators on vectors and matrices with a warning:

```ts
'use tsover'; // file-level; or place inside a single function
const c = a + b; // d.v2f + d.v2f
```

### Bundler plugin (only for CPU-side operators)

Code under `'use tsover'` also needs the tsover bundler plugin to run correctly. Skip it when operators appear only in `'use gpu'` functions.

```js title="vite.config.js"
import tsover from 'tsover/plugin/vite';
// plugins: [typegpu(), tsover()]
```

Also available: `tsover/plugin/rollup`, `/esbuild`, `/rspack`, `/webpack`.

### IDE: use the workspace TypeScript

VS Code / Cursor / Windsurf: command palette -> **TypeScript: Select TypeScript Version** -> **Use Workspace Version**, or `.vscode/settings.json`:

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

Zed: `.zed/settings.json` -> `lsp.vtsls.settings.typescript.tsdk: "node_modules/typescript/lib"`.

---

## 5. Lint plugin - `eslint-plugin-typegpu`

Flags common pitfalls and unsupported syntax in `'use gpu'` functions. Use it unless told otherwise or the project's linter is incompatible, and include a `lint` script in `package.json`.

```sh
npm install --save-dev eslint-plugin-typegpu
```

Rules (`recommended` severity; `all` sets every rule to `error`): `typegpu/no-math` (warn), `typegpu/no-integer-division` (warn), `typegpu/no-invalid-assignment`, `typegpu/no-uninitialized-variables`, `typegpu/no-unsupported-syntax`, `typegpu/no-unwrapped-objects` (error).

### ESLint (`eslint.config.js`)

```ts
import { defineConfig } from 'eslint/config';
import typegpu from 'eslint-plugin-typegpu';

export default defineConfig([typegpu.configs.recommended]); // or typegpu.configs.all
```

### Oxlint (`oxlint.config.ts`)

```ts
import { defineConfig } from 'oxlint';
import typegpu from 'eslint-plugin-typegpu';

export default defineConfig({
  jsPlugins: ['eslint-plugin-typegpu'],
  rules: {
    ...typegpu.configs.recommended.rules,
  },
});
```

`.oxlintrc.json` cannot spread a config: list the rules (`"typegpu/no-math": "warn"`, ...) next to `"jsPlugins": ["eslint-plugin-typegpu"]`.

---

## Troubleshooting

**`Missing metadata for tgpu.fn function body (either missing 'use gpu' directive, or misconfigured unplugin-typegpu)`, or `Function '...' is not marked with the 'use gpu' directive and cannot be used in a shader`** - the plugin isn't transforming that file, or the function lacks the directive. Check, in order:
1. The function body starts with `'use gpu'`.
2. The plugin is in the config your bundler actually reads (`unplugin-typegpu/vite` in the Vite config, `'unplugin-typegpu/babel'` in `babel.config.js`, the preload module on Node/Deno/Bun).
3. The file matches `include` (`.cjs`/`.cts` are not in the bundler default).
4. The dev server was restarted after adding the plugin; on React Native, clear the Metro cache (`npx expo start --clear`).
5. If the `tgpu` import is aliased unusually, set `forceTgpuAlias`.

**IDE flags `vec * scalar` as a type error while the code runs** - the editor isn't using `tsover`: select the workspace TypeScript version; for CPU-side code check the `'use tsover'` directive.

**`WebGPU is not supported by this browser.` or `Could not find a compatible GPU`** - thrown by `tgpu.init` when `navigator.gpu` is missing or no adapter is returned. Show a fallback message; don't retry in a loop.

---

## Roots

```ts
import { tgpu, d, std, common } from 'typegpu';

const root = await tgpu.init();                 // request a GPU device
const root = tgpu.initFromDevice({ device });   // or wrap an existing GPUDevice
```

Create one root at app startup and pass it to the code that allocates resources. Resources from different roots can't interact. `root.device` is the underlying `GPUDevice` (read `root.device.limits` for limits).

`root.destroy()` releases the root's internal caches and, for a root from `tgpu.init`, destroys the device. It does not destroy buffers, textures or other resources created through the root: call their `.destroy()`, or rely on the device being destroyed.

## Canvas

```ts
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const autoResizer = common.attachAutoResizer({
  root,
  canvas,
  onResize() {
    render(); // resizing clears the canvas; redraw and resize resolution-dependent resources here
  },
});

autoResizer.detach(); // when the canvas is no longer used
```

- `configureContext` accepts `HTMLCanvasElement | OffscreenCanvas` and `GPUCanvasConfiguration` fields; `format` defaults to `navigator.gpu.getPreferredCanvasFormat()`. Pass the context as a color attachment view (`pipeline.withColorAttachment({ view: context })`).
- `common.attachAutoResizer` keeps `canvas.width`/`height` equal to the canvas' physical pixel size (via `ResizeObserver`, device-pixel box where supported), clamped to `maxTextureDimension2D`. `onResize` runs after each resize, so render once there for static scenes; an animated loop just keeps drawing. Use it instead of hand-written `devicePixelRatio` resize code. It takes an `HTMLCanvasElement` only.
- In React, use `useConfigureContext` from `@typegpu/react` instead (see `references/react.md`).

---

## GPU features and limits (`tgpu.init` options)

Optional device capabilities are requested at init; `d.f16`/`vec*h` need `shader-f16`, subgroup ops need `subgroups`, GPU timing needs `timestamp-query`:

```ts
const root = await tgpu.init({
  adapter: { powerPreference: 'high-performance' },  // GPURequestAdapterOptions
  device: {                                          // GPUDeviceDescriptor plus optionalFeatures
    requiredFeatures: ['shader-f16'],       // init throws if unavailable
    optionalFeatures: ['timestamp-query'],  // requested when available, a warning otherwise
    requiredLimits: { maxStorageBuffersPerShaderStage: 10 },
  },
});

root.enabledFeatures.has('timestamp-query');                 // ReadonlySet<GPUFeatureName>
root.enabledWgslLanguageFeatures.has('immediate_address_space'); // navigator.gpu.wgslLanguageFeatures
```

**Every `requiredFeatures` entry shrinks the set of devices the app runs on**: init fails outright on hardware without it. Require a feature only when that trade-off is deliberate. Otherwise request it via `optionalFeatures` and write both paths, branching on a captured `root.enabledFeatures.has(...)` result. The result is comptime-known, so only the taken branch is emitted:

```ts
const hasF16 = root.enabledFeatures.has('shader-f16');

const shade = (x: number) => {
  'use gpu';
  if (hasF16) {
    return fastF16Path(x);   // only the taken branch survives in WGSL
  }
  return f32Path(x);
};
```

Pipelines emit `enable f16;` (and the other WGSL extensions) for the features the device has. A shader defined without a root can branch on `std.extensionEnabled('f16')` instead (see `references/std.md`).
