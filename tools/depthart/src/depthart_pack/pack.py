"""Deterministic HWC4-family packing for WebGPU storage buffers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

Packing = Literal["hwc4", "o4i4-yx", "c4-yx", "c4", "direction-o4i4"]
Encoding = Literal["plain"]
PackingPrecision = Literal["f32", "f16-native"]


class PackingError(ValueError):
    pass


@dataclass(frozen=True)
class PackedTensor:
    data: bytes
    logical_shape: tuple[int, ...]
    storage_shape: tuple[int, ...]
    dtype: Literal["f32", "f16"]
    encoding: Encoding
    layout: Packing

    @property
    def byte_length(self) -> int:
        return len(self.data)


def _ceil4(value: int) -> int:
    return (value + 3) // 4


def _source(array: np.ndarray, rank: int, name: str) -> np.ndarray:
    result = np.asarray(array)
    if result.ndim != rank:
        raise PackingError(f"{name} must have rank {rank}, got {result.shape}")
    if result.dtype != np.float32:
        raise PackingError(f"{name} must be float32 before packing, got {result.dtype}")
    if any(dim <= 0 for dim in result.shape):
        raise PackingError(f"{name} has an empty dimension: {result.shape}")
    if not np.all(np.isfinite(result)):
        raise PackingError(f"{name} contains NaN or infinity")
    return np.ascontiguousarray(result)


def _encode(array: np.ndarray, precision: PackingPrecision) -> tuple[bytes, str, str]:
    if precision == "f32":
        encoded = np.asarray(array, dtype="<f4")
        return encoded.tobytes(order="C"), "f32", "plain"
    if precision == "f16-native":
        if np.any(np.abs(array) > np.finfo(np.float16).max):
            raise PackingError("f32 value is outside the finite f16 range")
        encoded = np.asarray(array, dtype="<f2")
        if encoded.size % 2:
            raise PackingError("f16 payload must contain an even number of values")
        return encoded.tobytes(order="C"), "f16", "plain"
    raise PackingError(f"unsupported precision {precision!r}")


def pack_hwc4(
    values: np.ndarray, *, precision: PackingPrecision = "f32"
) -> PackedTensor:
    """Pack source NHWC bytes while recording manifest-logical NCHW shape.

    TypeGPU's `hwc4` layout always describes the logical tensor as `[N,C,H,W]`;
    its storage is `[N,H,W,ceil(C/4),4]`. The input array is NHWC so callers do
    not pay an otherwise pointless transpose while preparing already-HWC data.
    `unpack_hwc4` returns NHWC again.
    """

    source = _source(values, 4, "activation")
    n, height, width, channels = source.shape
    packed = np.zeros((n, height, width, _ceil4(channels), 4), dtype=np.float32)
    packed.reshape(n, height, width, -1)[..., :channels] = source
    data, dtype, encoding = _encode(packed, precision)
    storage_shape = tuple(packed.shape)
    return PackedTensor(
        data,
        (n, channels, height, width),
        tuple(storage_shape),
        dtype,  # type: ignore[arg-type]
        encoding,  # type: ignore[arg-type]
        "hwc4",
    )


def unpack_hwc4(packed: PackedTensor) -> np.ndarray:
    if packed.layout != "hwc4" or len(packed.logical_shape) != 4:
        raise PackingError("expected an HWC4 activation")
    n, channels, height, width = packed.logical_shape
    dtype = "<f4" if packed.dtype == "f32" else "<f2"
    values = np.frombuffer(packed.data, dtype=dtype).astype(np.float32)
    values = values.reshape(n, height, width, _ceil4(channels), 4)
    return values.reshape(n, height, width, -1)[..., :channels].copy()


def pack_conv_o4i4(
    weight: np.ndarray, *, precision: PackingPrecision = "f32"
) -> PackedTensor:
    """Pack OIHW into `[O4,I4,KY,KX,oLane,iLane]`.

    The flattened index is
    `(((((ob * ceil(I/4) + ib) * KY + y) * KX + x) * 4 + ol) * 4 + il)`.
    """

    source = _source(weight, 4, "convolution weight")
    outputs, inputs, height, width = source.shape
    output_blocks = _ceil4(outputs)
    input_blocks = _ceil4(inputs)
    padded = np.zeros(
        (output_blocks * 4, input_blocks * 4, height, width), dtype=np.float32
    )
    padded[:outputs, :inputs] = source
    packed = np.ascontiguousarray(
        padded.reshape(output_blocks, 4, input_blocks, 4, height, width).transpose(
            0, 2, 4, 5, 1, 3
        )
    )
    data, dtype, encoding = _encode(packed, precision)
    storage_shape = tuple(packed.shape)
    return PackedTensor(
        data,
        tuple(source.shape),
        tuple(storage_shape),
        dtype,  # type: ignore[arg-type]
        encoding,  # type: ignore[arg-type]
        "o4i4-yx",
    )


def unpack_conv_o4i4(packed: PackedTensor) -> np.ndarray:
    if packed.layout != "o4i4-yx" or len(packed.logical_shape) != 4:
        raise PackingError("expected an O4I4 convolution weight")
    outputs, inputs, height, width = packed.logical_shape
    dtype = "<f4" if packed.dtype == "f32" else "<f2"
    values = np.frombuffer(packed.data, dtype=dtype).astype(np.float32)
    output_blocks = _ceil4(outputs)
    input_blocks = _ceil4(inputs)
    values = values.reshape(output_blocks, input_blocks, height, width, 4, 4)
    unpacked = values.transpose(0, 4, 1, 5, 2, 3).reshape(
        output_blocks * 4, input_blocks * 4, height, width
    )
    return np.ascontiguousarray(unpacked[:outputs, :inputs])


def pack_direction_o4i4(
    weight: np.ndarray, *, precision: PackingPrecision = "f32"
) -> PackedTensor:
    """Pack `[direction,output,input]` projection weights in O4I4 tiles."""

    source = _source(weight, 3, "direction projection weight")
    directions, outputs, inputs = source.shape
    output_blocks = _ceil4(outputs)
    input_blocks = _ceil4(inputs)
    padded = np.zeros(
        (directions, output_blocks * 4, input_blocks * 4), dtype=np.float32
    )
    padded[:, :outputs, :inputs] = source
    packed = np.ascontiguousarray(
        padded.reshape(directions, output_blocks, 4, input_blocks, 4).transpose(
            0, 1, 3, 2, 4
        )
    )
    data, dtype, encoding = _encode(packed, precision)
    storage_shape = tuple(packed.shape)
    return PackedTensor(
        data,
        tuple(source.shape),
        tuple(storage_shape),
        dtype,  # type: ignore[arg-type]
        encoding,  # type: ignore[arg-type]
        "direction-o4i4",
    )


def unpack_direction_o4i4(packed: PackedTensor) -> np.ndarray:
    if packed.layout != "direction-o4i4" or len(packed.logical_shape) != 3:
        raise PackingError("expected a direction O4I4 projection weight")
    directions, outputs, inputs = packed.logical_shape
    dtype = "<f4" if packed.dtype == "f32" else "<f2"
    values = np.frombuffer(packed.data, dtype=dtype).astype(np.float32)
    output_blocks = _ceil4(outputs)
    input_blocks = _ceil4(inputs)
    values = values.reshape(directions, output_blocks, input_blocks, 4, 4)
    unpacked = values.transpose(0, 1, 3, 2, 4).reshape(
        directions, output_blocks * 4, input_blocks * 4
    )
    return np.ascontiguousarray(unpacked[:, :outputs, :inputs])


def pack_depthwise_c4yx(
    weight: np.ndarray, *, precision: PackingPrecision = "f32"
) -> PackedTensor:
    """Pack depthwise `[C,1,KY,KX]` as `[ceil(C/4),KY,KX,4]`."""

    source = _source(weight, 4, "depthwise weight")
    channels, multiplier, height, width = source.shape
    if multiplier != 1:
        raise PackingError(f"depthwise multiplier must be 1, got {multiplier}")
    channel_blocks = _ceil4(channels)
    padded = np.zeros((channel_blocks * 4, height, width), dtype=np.float32)
    padded[:channels] = source[:, 0]
    packed = np.ascontiguousarray(
        padded.reshape(channel_blocks, 4, height, width).transpose(0, 2, 3, 1)
    )
    data, dtype, encoding = _encode(packed, precision)
    storage_shape = tuple(packed.shape)
    return PackedTensor(
        data,
        tuple(source.shape),
        tuple(storage_shape),
        dtype,  # type: ignore[arg-type]
        encoding,  # type: ignore[arg-type]
        "c4-yx",
    )


def unpack_depthwise_c4yx(packed: PackedTensor) -> np.ndarray:
    if packed.layout != "c4-yx" or len(packed.logical_shape) != 4:
        raise PackingError("expected a C4YX depthwise weight")
    channels, _, height, width = packed.logical_shape
    dtype = "<f4" if packed.dtype == "f32" else "<f2"
    values = np.frombuffer(packed.data, dtype=dtype).astype(np.float32)
    channel_blocks = _ceil4(channels)
    values = values.reshape(channel_blocks, height, width, 4)
    unpacked = values.transpose(0, 3, 1, 2).reshape(channel_blocks * 4, height, width)
    return np.ascontiguousarray(unpacked[:channels, None])


def pack_c4(values: np.ndarray, *, precision: PackingPrecision = "f32") -> PackedTensor:
    """Pack a channel vector `[C]` as `[ceil(C/4),4]`."""

    source = _source(values, 1, "channel vector")
    channels = source.shape[0]
    packed = np.zeros((_ceil4(channels), 4), dtype=np.float32)
    packed.reshape(-1)[:channels] = source
    data, dtype, encoding = _encode(packed, precision)
    storage_shape = tuple(packed.shape)
    return PackedTensor(
        data,
        tuple(source.shape),
        tuple(storage_shape),
        dtype,  # type: ignore[arg-type]
        encoding,  # type: ignore[arg-type]
        "c4",
    )


def unpack_c4(packed: PackedTensor) -> np.ndarray:
    if packed.layout != "c4" or len(packed.logical_shape) != 1:
        raise PackingError("expected a C4 vector")
    dtype = "<f4" if packed.dtype == "f32" else "<f2"
    values = np.frombuffer(packed.data, dtype=dtype).astype(np.float32)
    return values[: packed.logical_shape[0]].copy()
