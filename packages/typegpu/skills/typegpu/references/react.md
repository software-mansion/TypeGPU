# `@typegpu/react` - React and React Native Bindings

Hooks for creating and managing TypeGPU resources in React components. The same import works on web and React Native; the package's `react-native` export condition selects the RN build (see [React Native](#react-native)). Docs: <https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-react.md>.

```sh
npm install @typegpu/react
```

## Minimal complete example

```tsx
import { useMemo } from 'react';
import { d, common } from 'typegpu';
import { useConfigureContext, useFrame, useRoot, useUniform } from '@typegpu/react';

function MyEffect() {
  const root = useRoot();
  const time = useUniform(d.f32);

  const renderPipeline = useMemo(
    () =>
      root.createRenderPipeline({
        vertex: common.fullScreenTriangle,
        fragment: ({ uv }) => {
          'use gpu';
          return d.vec4f((uv * 5 + time.$) % 1, 0, 1);
        },
      }),
    [root, time],
  );

  const { ref, ctxRef } = useConfigureContext();

  useFrame(({ elapsedSeconds }) => {
    const ctx = ctxRef.current;
    if (!ctx) {
      return;
    }
    time.write(elapsedSeconds);
    renderPipeline.withColorAttachment({ view: ctx }).draw(3);
  });

  return <canvas ref={ref} />;
}
```

## Hook reference

| Hook | Purpose |
|---|---|
| `useRoot()` | Root from the nearest `<Root>` provider (a global root if none). Suspends until initialized; throws on init failure. `useRootOrError()` returns `{ status, value \| reason }` instead of throwing; `useRootWithStatus()` neither suspends nor throws. |
| `<Root root? options? disableWorklets?>` | Context provider; all descendants share one `TgpuRoot`. Without `root`, creates one with `tgpu.init(options)`. Put a `<Suspense>` (or `<ClientOnly>`) between it and the hook users; it warns otherwise. |
| `useConfigureContext(opts?)` | Returns `{ ref, ctxRef }`: pass `ref` to the `<canvas>`, use `ctxRef.current` as the attachment view. Options below. |
| `useFrame(cb)` | Runs `cb` every frame (rAF) with `{ deltaSeconds, elapsedSeconds }`. The latest closure is always used; no `useCallback` needed. |
| `useUniform(schema, opts?)` | Uniform buffer binding tied to the component lifetime; update with `.write()`. Options: `initial` (value, or a function that writes the still-mapped buffer), `onInit(resource)`. |
| `useMutable(schema, opts?)` | Same, `var<storage, read_write>`. |
| `useReadonly(schema, opts?)` | Same, `var<storage, read>`. |
| `useMirroredUniform(schema, value)` | Uniform re-written whenever `value` changes identity across renders. Returns a read-only handle: `.$` in shaders, no `.write()`. For values living in React state or props (theme, settings). |
| `useBuffer(schema, opts?)` | Raw `TgpuBuffer`; same options. |
| `useBindGroup(layout, entries)` | Bind group; entries as in `root.createBindGroup`. Re-created on every render. |
| `<ClientOnly fallback?>` | SSR guard: mounts children only after hydration, inside `<Suspense>`. |

Resources are re-created when the schema changes structurally or the root changes, and destroyed on unmount.

Guidance:

- **Memoize pipelines** with `useMemo` and `[root, ...capturedResources]` deps. Pipeline creation resolves the shader.
- **Per-frame values go through `.write()` inside `useFrame`**, never through React state (state updates re-render).
- Updated every frame → `useUniform` + `.write()`. Derived from React data → `useMirroredUniform`.
- A frame with several pipelines records into one `root.createCommandEncoder()` and submits once; see `references/encoders.md`.

## `useConfigureContext` options

Accepts `GPUCanvasConfiguration` fields except `device`; `format` defaults to the preferred canvas format. Plus:

| Option | Default | Effect |
|---|---|---|
| `autoResize` | `true` | Keeps `canvas.width/height` at the canvas's device-pixel size. Web: `ResizeObserver` (device-pixel box when available). React Native: sized once on attach (`clientWidth × PixelRatio`); later layout changes are not tracked. |
| `onResize(width, height)` | | Called once the canvas is available, then on every size change. Resizing clears the canvas, so redraw here when not drawing every frame. |

```tsx
const { ref, ctxRef } = useConfigureContext({
  onResize: () => {
    const ctx = ctxRef.current;
    if (!ctx) {
      return;
    }
    renderPipeline.withColorAttachment({ view: ctx }).draw(3);
    ctx.present?.(); // React Native only; undefined on the web
  },
});
```

## React Native

WebGPU on React Native comes from `react-native-webgpu` (a peer dependency; the RN build imports it, which installs `navigator.gpu`). Setup: <https://docs.swmansion.com/TypeGPU/integration/react-native.md>.

```sh
npm i react-native-webgpu typegpu @typegpu/react
npm i --save-dev unplugin-typegpu @webgpu/types
```

- Pass `ref` to `<Canvas>` from `react-native-webgpu` instead of `<canvas>`: `<Canvas ref={ref} style={{ flex: 1 }} />`.
- Call `ctx.present?.()` after submitting the frame's draws, every frame and in `onResize`; RN canvas contexts need an explicit present, on whichever runtime rendered.
- `autoResize` sizes the canvas once, on attach; see the options table above.
- Not supported in Expo Go; run `npx expo prebuild` and a development build.

### Worklets (UI-thread render loops)

With `react-native-worklets` installed, `useFrame` callbacks run on the UI thread, unaffected by RN-thread load. Docs: <https://docs.swmansion.com/TypeGPU/integration/react-native/worklets.md>. Babel config (after the usual RN/WebGPU setup):

```js
const workletsPluginOptions = {
  bundleMode: true,
  importForwarding: {
    moduleNames: ['typegpu'],
    relativePaths: ['my-app/components'], // dirs with module-scope shader definitions
  },
};

// plugins: ['unplugin-typegpu/babel', ['react-native-worklets/plugin', workletsPluginOptions]]
```

Clear the Metro cache after changing the babel config (`npx expo start --clear`).

`@typegpu/react` detects `react-native-worklets` at runtime; no extra imports. A version without `runOnUISync`, `createShareable` and `registerCustomSerializable` is ignored and frames run on the RN thread. While active:

- **Every `useFrame` callback starts with the `'worklet'` directive** and runs on the UI thread; a plain callback throws. `<Root disableWorklets>` runs plain callbacks on the RN thread instead (fixed on mount).
- `ctxRef.current` is readable only inside the worklet; reading it on the RN thread (e.g. in `onResize`) throws.

```tsx
useFrame(({ elapsedSeconds }) => {
  'worklet';
  const ctx = ctxRef.current;
  if (!ctx) {
    return;
  }
  color.write(d.vec3f(0.5 + Math.sin(elapsedSeconds) * 0.5, 0.447, 0.941));
  pipeline.withColorAttachment({ view: ctx }).draw(3);
  ctx.present?.();
});
```

### Two threads, one device

Dawn devices are not thread-safe by default. When the JS thread also touches the device while a worklet frame loop submits (writing buffers from event handlers, `useMirroredUniform` re-writes, reads, its own submits), request Dawn's `'implicit-device-synchronization'` feature; without it iOS aborts in Metal asserts or produces torn frames and impossible validation errors. It is a feature, not a toggle. `tgpu.init` drops an unsupported optional feature with a warning, so verify after creation:

```tsx
const options = {
  device: { optionalFeatures: ['implicit-device-synchronization' as GPUFeatureName] },
};

<Root options={options}>{/* ... */}</Root>;

// inside a component
const root = useRoot();
const synchronized = root.device.features.has('implicit-device-synchronization');
```

Define `options` at module scope (it is read once, on mount). Use `requiredFeatures` instead to fail when the adapter lacks it. Cost: one uncontended mutex per API call.

### Rules of transfer

Resources captured by a worklet are transferred to the UI runtime on first use; both runtimes share the same GPU objects, and the same resource transfers to the same object.

- **Transfers**: buffers (incl. `createUniform`/`createMutable`/`createReadonly`), textures and texture views, samplers, bind groups and layouts, vertex layouts, query sets, pipelines, roots, slots, accessors, consts.
- **Runtime-local**: shader definitions (`tgpu.fn`, entry functions, `tgpu.comptime`) and standalone schemas or vector instances. Keep definitions at module scope in files covered by `importForwarding`; worklets re-import them natively.
- **A pipeline carrying an attachment, pass or encoder throws on transfer.** Transfer the bare pipeline and call `withColorAttachment` inside the worklet, as above.
- **Callbacks stored by a transferred resource** (e.g. `withPerformanceCallback`) must be `'worklet'` functions.
- **Pipelines created on the UI thread need an explicit `targets: { format }`**; `navigator.gpu.getPreferredCanvasFormat()` is unavailable on worklet runtimes. Memoize them.
- Query sets: `resolve()` and `read()` on one runtime. Shader logs print only on the runtime that resolved the pipeline.
