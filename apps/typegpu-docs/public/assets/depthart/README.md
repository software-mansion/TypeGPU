# DepthART Relative-Depth Model (TypeGPU)

License and attribution for the third-party model used by the TypeGPU
monocular light injection example.

- **Model**: DepthART, relative-depth 448 checkpoint
- **Authors**: Feng Xue, Wu Chen, Mingshuai Zhao, Guofeng Zhong, Anlong
  Ming, Haozhe Wang, Dianqiao Lei, Zhaowen Lin, Haiyang Zhang, Nicu Sebe
- **License**: Apache License, Version 2.0, see [`LICENSE`](./LICENSE)
- **Attribution and modifications**: see [`NOTICE`](./NOTICE)
- **Upstream project**: [github.com/xuefeng-cvr/DepthART](https://github.com/xuefeng-cvr/DepthART)
- **Model host**: [huggingface.co/Fengxue93/DepthART](https://huggingface.co/Fengxue93/DepthART)

The converted `.depthart` bundles live at
[reczkok/depthart-typegpu](https://huggingface.co/reczkok/depthart-typegpu) and
are downloaded at runtime, not stored here. The conversion changes numeric
behavior, see [`NOTICE`](./NOTICE). The converter and the commands that
reproduce each bundle are in `tools/depthart`.

This model is **not** part of TypeGPU. TypeGPU is MIT licensed; this asset is
Apache 2.0, and any redistribution must preserve `LICENSE` and `NOTICE`.
