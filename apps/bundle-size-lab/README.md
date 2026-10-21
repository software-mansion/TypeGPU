# bundle-size-lab (not for merging)

The measurements behind the v3 function metadata format and `unstable_stripJsImpl`.
Kept here for inspection.

## Apps

`examples/` holds standalone Vite apps made from the four docs examples with the most
`'use gpu'` functions: `monocular-light-injection`, `selfie-segmentation`, `os-awards` and
`jelly-slider`. Each is built into a single minified JS chunk (Vite 8, `target: 'esnext'`).
`examples/tests/revive-check` calls `'use gpu'` functions on the CPU and prints their WGSL, to
compare builds with and without `unstable_stripJsImpl`.

Build variants (env vars read by `vite.config.ts`):

| Variable | Effect |
|---|---|
| `STRIP=1` | `unstable_stripJsImpl` |
| `OBFUSCATE=1` | `unstable_obfuscate` (and auto-naming off) |
| `NONAME=1` | auto-naming off |
| `MINIFY=1` | `unstable_minify` in every `tgpu.init` |

## Scripts

- `measure.ts`: builds every app in every variant, and reports raw/gzip/brotli size, bytes per
  part of the metadata, and bytes per source (from sourcemaps).
  `DIST`, `RESULTS` and `VARIANTS` select where builds and results go, and which variants run.
  `results-{main,pr2,pr3,pr4}.json` were produced by running it with the repo checked out at
  `main` and at each PR of the stack.
- `formats.ts`: re-encodes the metadata of every function in a built bundle in a number of
  candidate formats, and measures the resulting bundles. Also ablations (no AST, no externals,
  no metadata at all). The rewritten bundles only exist to be measured; the runtime code a
  format needs is accounted for separately.
- `decoders.ts` + `bench.ts`: cold-start benchmark of the formats. For each app, all of its
  metadata (with the JS implementations) is emitted as a standalone script per format. Every
  measurement is a fresh Node process that compiles and runs the script, then reads every
  function's metadata the way `getFunctionMetadata` does. Each format is checked to decode to
  the same AST first.
- `evaluate.ts`: time to import whole production bundles, in fresh Node processes, interleaving
  two builds. Without WebGPU each app stops at `tgpu.init()`, after all module-level code ran.
- `serve.ts`: serves this directory, plus the docs' public assets under `/TypeGPU/`. It records
  the code of every shader module (`window.__wgslCode`), which is how the generated WGSL was
  compared between builds in Chromium.

## Results

- [`results-*.json`](.): bundle sizes per stack point.
- [`formats-results-dist-pr3.json`](formats-results-dist-pr3.json),
  [`formats-results-dist-pr4.json`](formats-results-dist-pr4.json): candidate formats.
- [`bench-results-dist-pr3-baseline.json`](bench-results-dist-pr3-baseline.json): cold-start
  benchmark.
- [`evaluate-dist-pr2-vs-dist-pr3-baseline.json`](evaluate-dist-pr2-vs-dist-pr3-baseline.json):
  whole-bundle evaluation, v2 vs v3, with an identical-build control
  ([`evaluate-dist-pr3-vs-dist-pr3-baseline.json`](evaluate-dist-pr3-vs-dist-pr3-baseline.json)).

## Reproducing

```sh
pnpm install
cd apps/bundle-size-lab
# with the repo at the commit to measure
DIST=dist-pr3 RESULTS=results-pr3.json VARIANTS=baseline,obfuscate+minify node measure.ts
DIST=dist-pr3 BUILDS=baseline,obfuscate+minify node formats.ts
DIST=dist-pr3 node --expose-gc bench.ts 21
# after building two commits into dist-pr2 and dist-pr3
DIST_A=dist-pr2 DIST_B=dist-pr3 node evaluate.ts 31
```
