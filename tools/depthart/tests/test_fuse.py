from __future__ import annotations

import numpy as np
import pytest

from depthart_pack.fuse import (
    DepthwiseBranch,
    FoldError,
    batch_norm_affine,
    fold_batch_norm,
    reparameterize_depthwise,
)


def test_batch_norm_fold_matches_reference() -> None:
    rng = np.random.default_rng(7)
    weight = rng.normal(size=(5, 3, 3, 3)).astype(np.float32)
    bias = rng.normal(size=5).astype(np.float32)
    gamma = rng.normal(size=5).astype(np.float32)
    beta = rng.normal(size=5).astype(np.float32)
    mean = rng.normal(size=5).astype(np.float32)
    variance = rng.uniform(0.1, 2, size=5).astype(np.float32)
    folded_weight, folded_bias = fold_batch_norm(
        weight, bias, gamma, beta, mean, variance, 1e-5
    )
    convolution_sample = rng.normal(size=5).astype(np.float32)
    scale, shift = batch_norm_affine(gamma, beta, mean, variance, 1e-5)

    reference = (convolution_sample + bias) * scale + shift
    folded = (
        convolution_sample * (folded_weight[:, 0, 0, 0] / weight[:, 0, 0, 0])
        + folded_bias
    )
    np.testing.assert_allclose(folded, reference, rtol=2e-6, atol=2e-6)


def test_depthwise_reparameterization_centers_branches_and_identity() -> None:
    branch3 = np.ones((2, 1, 3, 3), dtype=np.float32)
    branch1 = np.full((2, 1, 1, 1), 2, dtype=np.float32)
    weight, bias = reparameterize_depthwise(
        [DepthwiseBranch(branch3), DepthwiseBranch(branch1)], 2, identity=True
    )

    expected = branch3.copy()
    expected[:, 0, 1, 1] += 3
    np.testing.assert_array_equal(weight, expected)
    np.testing.assert_array_equal(bias, np.zeros(2, dtype=np.float32))


def test_folding_requires_fp32() -> None:
    with pytest.raises(FoldError, match="float32"):
        fold_batch_norm(
            np.ones((1, 1, 1, 1), dtype=np.float64),
            None,
            *(np.ones(1, dtype=np.float32) for _ in range(4)),
            1e-5,
        )
