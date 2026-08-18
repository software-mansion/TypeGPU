"""Numerically explicit FP32 parameter folding used by the offline exporter."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

import numpy as np


class FoldError(ValueError):
    pass


def _fp32(value: np.ndarray, name: str) -> np.ndarray:
    array = np.asarray(value)
    if array.dtype != np.float32:
        raise FoldError(f"{name} must be float32, got {array.dtype}")
    if not np.all(np.isfinite(array)):
        raise FoldError(f"{name} contains NaN or infinity")
    return np.ascontiguousarray(array)


def batch_norm_affine(
    gamma: np.ndarray,
    beta: np.ndarray,
    running_mean: np.ndarray,
    running_variance: np.ndarray,
    epsilon: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Return channel scale/shift for inference-mode batch normalization."""

    gamma = _fp32(gamma, "gamma")
    beta = _fp32(beta, "beta")
    running_mean = _fp32(running_mean, "running_mean")
    running_variance = _fp32(running_variance, "running_variance")
    if gamma.ndim != 1 or any(
        value.shape != gamma.shape for value in (beta, running_mean, running_variance)
    ):
        raise FoldError("batch-normalization parameters must be equal-length vectors")
    if not np.isfinite(epsilon) or epsilon <= 0:
        raise FoldError(f"epsilon must be finite and positive, got {epsilon}")
    denominator = running_variance + np.float32(epsilon)
    if np.any(denominator <= 0):
        raise FoldError("running variance plus epsilon must be positive")
    scale = gamma / np.sqrt(denominator, dtype=np.float32)
    shift = beta - running_mean * scale
    return np.ascontiguousarray(scale), np.ascontiguousarray(shift)


def fold_batch_norm(
    weight: np.ndarray,
    bias: np.ndarray | None,
    gamma: np.ndarray,
    beta: np.ndarray,
    running_mean: np.ndarray,
    running_variance: np.ndarray,
    epsilon: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Fold an inference BN into an OIHW convolution in FP32."""

    weight = _fp32(weight, "weight")
    if weight.ndim != 4:
        raise FoldError(f"weight must be OIHW rank 4, got {weight.shape}")
    channels = weight.shape[0]
    if bias is None:
        bias_array = np.zeros(channels, dtype=np.float32)
    else:
        bias_array = _fp32(bias, "bias")
        if bias_array.shape != (channels,):
            raise FoldError(
                f"bias must have shape {(channels,)}, got {bias_array.shape}"
            )
    scale, shift = batch_norm_affine(
        gamma, beta, running_mean, running_variance, epsilon
    )
    if scale.shape != (channels,):
        raise FoldError(
            f"BN channel count {scale.shape[0]} does not match convolution outputs {channels}"
        )
    folded_weight = weight * scale[:, None, None, None]
    folded_bias = bias_array * scale + shift
    return (
        np.ascontiguousarray(folded_weight, dtype=np.float32),
        np.ascontiguousarray(folded_bias, dtype=np.float32),
    )


def center_pad_kernel(
    weight: np.ndarray, target_height: int, target_width: int
) -> np.ndarray:
    """Center a same-parity OIHW kernel in a larger zero kernel."""

    weight = _fp32(weight, "weight")
    if weight.ndim != 4:
        raise FoldError("kernel must be rank-4 OIHW")
    source_height, source_width = weight.shape[-2:]
    if target_height < source_height or target_width < source_width:
        raise FoldError("target kernel cannot be smaller than source")
    delta_height = target_height - source_height
    delta_width = target_width - source_width
    if delta_height % 2 or delta_width % 2:
        raise FoldError("source and target kernel sizes must have matching parity")
    result = np.zeros(
        (*weight.shape[:-2], target_height, target_width), dtype=np.float32
    )
    top = delta_height // 2
    left = delta_width // 2
    result[..., top : top + source_height, left : left + source_width] = weight
    return result


@dataclass(frozen=True)
class DepthwiseBranch:
    weight: np.ndarray
    bias: np.ndarray | None = None
    gamma: np.ndarray | None = None
    beta: np.ndarray | None = None
    running_mean: np.ndarray | None = None
    running_variance: np.ndarray | None = None
    epsilon: float = 1e-5


def reparameterize_depthwise(
    branches: Iterable[DepthwiseBranch],
    channels: int,
    *,
    identity: bool = False,
    target_kernel: tuple[int, int] | None = None,
    outer_bn: tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, float]
    | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Merge parallel depthwise branches and an optional identity branch.

    This is deliberately graph-agnostic: extraction identifies the official branch
    topology, while this routine supplies the audited FP32 arithmetic.
    """

    materialized = list(branches)
    if not materialized and not identity:
        raise FoldError("at least one branch or identity is required")
    if channels <= 0:
        raise FoldError("channels must be positive")
    sizes = [branch.weight.shape[-2:] for branch in materialized]
    if target_kernel is None:
        target_kernel = (
            max((height for height, _ in sizes), default=1),
            max((width for _, width in sizes), default=1),
        )
    combined_weight = np.zeros((channels, 1, *target_kernel), dtype=np.float32)
    combined_bias = np.zeros(channels, dtype=np.float32)

    for index, branch in enumerate(materialized):
        weight = _fp32(branch.weight, f"branch[{index}].weight")
        if weight.ndim != 4 or weight.shape[:2] != (channels, 1):
            raise FoldError(
                f"branch[{index}] must be depthwise [{channels},1,H,W], got {weight.shape}"
            )
        bias = branch.bias
        bn_values = (
            branch.gamma,
            branch.beta,
            branch.running_mean,
            branch.running_variance,
        )
        if any(value is not None for value in bn_values):
            if not all(value is not None for value in bn_values):
                raise FoldError(f"branch[{index}] has an incomplete BN")
            weight, folded_bias = fold_batch_norm(
                weight,
                bias,
                branch.gamma,  # type: ignore[arg-type]
                branch.beta,  # type: ignore[arg-type]
                branch.running_mean,  # type: ignore[arg-type]
                branch.running_variance,  # type: ignore[arg-type]
                branch.epsilon,
            )
        else:
            folded_bias = (
                np.zeros(channels, dtype=np.float32)
                if bias is None
                else _fp32(bias, f"branch[{index}].bias")
            )
            if folded_bias.shape != (channels,):
                raise FoldError(f"branch[{index}] bias shape is {folded_bias.shape}")
        combined_weight += center_pad_kernel(weight, *target_kernel)
        combined_bias += folded_bias

    if identity:
        center_y = target_kernel[0] // 2
        center_x = target_kernel[1] // 2
        if target_kernel[0] % 2 == 0 or target_kernel[1] % 2 == 0:
            raise FoldError("identity fusion requires odd target kernel sizes")
        combined_weight[:, 0, center_y, center_x] += np.float32(1)

    if outer_bn is not None:
        combined_weight, combined_bias = fold_batch_norm(
            combined_weight, combined_bias, *outer_bn
        )
    return combined_weight, combined_bias


def fold_layer_scale(
    weight: np.ndarray, bias: np.ndarray | None, scale: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Fold an output-channel layer-scale vector into OIHW weights and bias."""

    weight = _fp32(weight, "weight")
    scale = _fp32(scale, "scale")
    if weight.ndim != 4 or scale.shape != (weight.shape[0],):
        raise FoldError("layer scale must match the OIHW output dimension")
    if bias is None:
        bias = np.zeros(weight.shape[0], dtype=np.float32)
    else:
        bias = _fp32(bias, "bias")
    return (
        np.ascontiguousarray(weight * scale[:, None, None, None]),
        np.ascontiguousarray(bias * scale),
    )
