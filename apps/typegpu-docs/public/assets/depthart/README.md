# DepthART Relative-Depth Model (TypeGPU)

This directory carries the license and attribution documentation for the
third-party machine learning model used by the TypeGPU monocular light
injection example.

## What is this?

- **Model**: DepthART, relative-depth 448 checkpoint
- **Authors**: Feng Xue, Wu Chen, Mingshuai Zhao, Guofeng Zhong, Anlong
  Ming, Haozhe Wang, Dianqiao Lei, Zhaowen Lin, Haiyang Zhang, Nicu Sebe
- **License**: Apache License, Version 2.0 — see [`LICENSE`](./LICENSE)
- **Attribution & modifications**: see [`NOTICE`](./NOTICE)
- **Upstream project**: [github.com/xuefeng-cvr/DepthART](https://github.com/xuefeng-cvr/DepthART)
- **Model host**: [huggingface.co/Fengxue93/DepthART](https://huggingface.co/Fengxue93/DepthART)

## Weights

The converted `.depthart` bundles are hosted externally and downloaded by
the example at runtime; they are not stored in this repository. Unlike a
pure repackaging, the conversion changes numeric behavior; see
[`NOTICE`](./NOTICE).

The converter that produces the bundles, and the exact commands and
checksums needed to reproduce them, are in `tools/depthart`.

## Files

- `LICENSE` — Apache License, Version 2.0.
- `NOTICE` — attribution and modification notices required by Apache 2.0
  Section 4.

## Important

This model is **not** part of TypeGPU itself. TypeGPU is licensed under
the MIT License, but this asset is licensed under Apache 2.0 and any
redistribution must preserve the contents of `LICENSE` and `NOTICE`.
