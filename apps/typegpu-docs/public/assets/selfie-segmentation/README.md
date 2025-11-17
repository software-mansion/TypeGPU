# MediaPipe Selfie Segmentation Model (TypeGPU)

This directory contains a third-party machine learning model used by
the TypeGPU selfie segmentation example.

## What is this?

- **Model**: MediaPipe Selfie Segmentation (general, 256×256)
- **Author**: Google LLC
- **License**: Apache License, Version 2.0 — see [`LICENSE`](./LICENSE)
- **Attribution & modifications**: see [`NOTICE`](./NOTICE)
- **Original model card**: [link](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf)

## Files

- `selfie_segmenter.ssbin` — model weights repackaged into the `.ssbin`
  binary format used by TypeGPU. The weights and architecture are
  identical to the original; only the container format differs.
- `LICENSE` — Apache License, Version 2.0 (the license under which the
  original model is distributed).
- `NOTICE` — attribution and modification notices required by Apache 2.0
  Section 4.

## Important

This model is **not** part of TypeGPU itself. TypeGPU is licensed under
the MIT License, but this asset is licensed under Apache 2.0 and any
redistribution must preserve the contents of `LICENSE` and `NOTICE`.
