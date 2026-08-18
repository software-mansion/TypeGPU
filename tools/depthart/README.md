# DepthART bundle tooling

Offline converter for the pinned DepthART relative-depth 448 ONNX artifacts.
It folds a released inference graph into the small runtime ABI used by the
TypeGPU example, packs weights, plans activation slots, and writes a checksummed
`.depthart` bundle.

The small, base, and large sizes are one architecture at three widths. They
share an op set, a view-lowering contract, and a runtime operation set, and
differ only in channel widths, block counts, and the identity of their source
artifact. Everything that varies with size lives in the `OFFICIAL_VARIANTS`
table in `profile.py`, resolved from an artifact's `(byte length, SHA-256)`.

The environment is managed by `uv`:

```sh
cd tools/depthart
uv sync
uv run depthart-pack inspect /path/to/relative_s_448_default.onnx
uv run depthart-pack convert /path/to/relative_s_448_default.onnx model.depthart
uv run depthart-pack verify-bundle model.depthart
uv run pytest
```

## Export profiles

Only the maintained reference and shipped performance profiles remain:

- `f32-reference` is the default correctness artifact. It requires no WebGPU
  features, so an `s` bundle in this profile is the smallest artifact that runs
  without `shader-f16`.
- `balanced-fp16` is the measured mobile profile. It uses native FP16 only on
  validated encoder/decoder islands, retains three faster FP32 downsamplers,
  and keeps scan, normalization, public I/O, and sensitive decoder boundaries
  in FP32. It requires WebGPU `shader-f16`.

## Reproducing the released bundles

Every bundle is produced by the same command with the size, output name, and
profile substituted:

```sh
uv run depthart-pack convert \
  /path/to/relative_<size>_448_default.onnx \
  depthart-relative-<size>-448-<suffix>.depthart \
  --profile <profile> \
  --fold-channel-affine \
  --fuse-channel-affine
```

`<suffix>` is `balanced` for `balanced-fp16` and `f32` for `f32-reference`.

| size | profile | bytes | SHA-256 | CRC32 |
| --- | --- | --- | --- | --- |
| `s` | `balanced-fp16` | `13,662,992` | `e6d7b65bd2888771790d3cc3ad827133f0b014f05010347b6fc6fc891ff9e19c` | `831e711c` |
| `s` | `f32-reference` | `23,994,512` | `adc5352f2fc83d1fd7e740ed32b8a0bd7862cef463a430d23d6071990e822aef` | `5577424c` |
| `b` | `balanced-fp16` | `25,518,768` | `cf121c7df9ae5fa5b24a8ae910af8462f1be9bde8131a9e4e5604f902f12b46d` | `9239f8b8` |
| `b` | `f32-reference` | `45,445,776` | `a3d16e35ac91f753e7027bee7f4ae13b0007183df1a141947ce80b2d55a45a30` | `412b162f` |
| `l` | `balanced-fp16` | `71,566,624` | `2d39ab90a76039586c1475ec11a467cd789e455e320c56f2836a2390b28be33b` | `f3c13cf0` |
| `l` | `f32-reference` | `129,940,048` | `95ac37061bcfedbc2b2cc6ad2a14e5f5d99b312c0c47313a8b0f2e505b855098` | `2f1a2978` |

Graph size is a property of the artifact, not the profile:

| size | dispatches | tensors | activation slots |
| --- | --- | --- | --- |
| `s` | 230 | 517 | 11 |
| `b` | 234 | 527 | 11 |
| `l` | 250 | 567 | 11 |

The docs example downloads these bundles at runtime; they are not stored in
this repository.

## Fixed source and runtime contract

The converter accepts three official static ONNX exports and nothing else:

| size | filename | bytes | SHA-256 |
| --- | --- | --- | --- |
| `s` | `relative_s_448_default.onnx` | `24,544,478` | `4773e2648803d207c470c86633c3059fd792bc87c5fdffce817005f6711abf06` |
| `b` | `relative_b_448_default.onnx` | `46,137,401` | `33bd1369d7b2c00d1057f22f73e9ae3ea1e42b9f492d3884233ffc91d97fb6fd` |
| `l` | `relative_l_448_default.onnx` | `131,090,446` | `358079054bb10dd9caca164b7799e22598b3f54f2201a86bb9ed09cc891cb04f` |

All three are ONNX opset 17 with input `[1,3,448,448]` and five selective-scan
stages of sequence length 196, and share:

- model host revision: `483c4b9c59f476b7e37d879f44e13a1088249522`
- upstream project revision: `0384521b3bcb4c64adf03eeb5d55ebdb1cbdd84c`

An artifact whose identity matches no row is rejected before the protobuf is
parsed. Beyond identity, conversion fails closed if the graph shapes, node and
initializer counts, operation histogram, selective-scan contract, view
lowering, constant roles, or runtime operation set differ from the pinned
figures for that size. The runtime graph uses HWC4 activations and supports
these operations:

```text
conv2d, depthwise-conv2d, activation, binary, channel-affine,
avg-pool2d, resize2d, layer-norm, scan-project, selective-scan,
scan-merge, channel-split, channel-concat
```

The synthetic command emits a small deterministic all-ops fixture for parser
and dispatch construction checks:

```sh
uv run depthart-pack synthetic all-ops.depthart
```

## Tests

`uv run pytest` runs offline. The end-to-end conversion checks need the real
artifacts and skip without them. Point one environment variable per size at a
local copy to enable them:

```sh
DEPTHART_ONNX_S=/path/to/relative_s_448_default.onnx \
DEPTHART_ONNX_B=/path/to/relative_b_448_default.onnx \
DEPTHART_ONNX_L=/path/to/relative_l_448_default.onnx \
uv run pytest
```

`DEPTHART_ONNX` is still accepted as an alias for `DEPTHART_ONNX_L`.

## Numerical and legal notes

The model output is nonnegative affine-invariant relative disparity, not metric
depth. The optimized graph preserves FP32 selective-scan recurrence and
LayerNorm reductions. Offline convolution/activation and affine rewrites change
floating-point evaluation order, so every shipped artifact is pinned by hash and
validated against official outputs.

Only the large checkpoint publishes a parameter count, so that figure is
recorded for `l` alone and left unset for the other sizes rather than inferred
from the ONNX initializers.

## Output polarity

Relative disparity has no canonical sign, and the released sizes do not agree on
one. Upstream `relative_b_448_default.onnx` emits **inverted** disparity: near
surfaces take the low end of the range and far surfaces the high end, the
opposite of `s` and `l`. Each variant records its sign in the table, and the
manifest carries `output.polarity` only when it is `inverted`, so `s` and `l`
manifests are unchanged and older bundles stay valid with the field absent
meaning `direct`.

The inversion is a property of the published checkpoint, not of this converter.
Evidence, in case it is ever questioned again:

- Running the raw ONNX through onnxruntime, with only the custom `SelectiveScan`
  op supplied in NumPy and no part of this converter involved, reproduces it:
  `b` correlates with `l` at `r = -0.95` on one photograph and `-0.99` on
  another. The magnitude of that correlation is the point. Ordering is the whole
  content of relative disparity, so `b` agrees with `l` almost perfectly and
  only the sign differs.
- The final `depth_head.scratch.output_conv2.2` weights are bit-identical
  between the ONNX initializers and the converted bundle for every size, and
  `b`'s are the most positive of the three (6 of 16 negative, against 8 of 16
  for `s` and 7 of 16 for `l`), so the sign does not come from that layer.
- Converting `b` with and without `--fold-channel-affine --fuse-channel-affine`
  gives correlations equal to four decimals, and every channel-affine fold is
  bit-exact (`folded_weight == weight * scale` to `0.0`), so the affine
  rewrites do not carry it either.

Separately, `b` emits that disparity on a large constant pedestal: its final
bias is `+3.867` against weights of `±0.099`, and `84%` of the tensor entering
the last ReLU in `output_conv2.0` is clamped, against about `54%` for `s` and
`l`. The result is a compressed output range, which costs nothing once the
presenter percentile-normalizes each frame, but leaves less precision headroom
than the other sizes.

Hugging Face model metadata declares Apache-2.0 for the weights. The pinned
source repository contains no license file, so this implementation does not
copy or redistribute its source code. Keep the bundled `LICENSE`, `NOTICE`, and
provenance metadata with redistributed model artifacts.
