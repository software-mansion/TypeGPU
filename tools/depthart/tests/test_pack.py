from __future__ import annotations

import numpy as np
import pytest

from depthart_pack.pack import (
    PackingError,
    pack_c4,
    pack_conv_o4i4,
    pack_depthwise_c4yx,
    pack_direction_o4i4,
    pack_hwc4,
    unpack_c4,
    unpack_conv_o4i4,
    unpack_depthwise_c4yx,
    unpack_direction_o4i4,
    unpack_hwc4,
)


@pytest.mark.parametrize("precision", ["f32", "f16-native"])
def test_hwc4_uses_nchw_logical_shape_and_nhwc_storage(precision: str) -> None:
    source_nhwc = np.arange(2 * 3 * 5 * 6, dtype=np.float32).reshape(2, 3, 5, 6) / 17
    packed = pack_hwc4(source_nhwc, precision=precision)  # type: ignore[arg-type]

    assert packed.logical_shape == (2, 6, 3, 5)
    assert packed.storage_shape == (2, 3, 5, 2, 4)
    assert packed.encoding == "plain"
    tolerance = 0 if precision == "f32" else 5e-3
    np.testing.assert_allclose(
        unpack_hwc4(packed), source_nhwc, rtol=tolerance, atol=tolerance
    )


@pytest.mark.parametrize("precision", ["f32", "f16-native"])
def test_regular_conv_o4i4_round_trip(precision: str) -> None:
    source = np.arange(5 * 3 * 3 * 1, dtype=np.float32).reshape(5, 3, 3, 1) / 19
    packed = pack_conv_o4i4(source, precision=precision)  # type: ignore[arg-type]

    assert packed.logical_shape == (5, 3, 3, 1)
    assert packed.layout == "o4i4-yx"
    tolerance = 0 if precision == "f32" else 1e-3
    np.testing.assert_allclose(
        unpack_conv_o4i4(packed), source, rtol=tolerance, atol=tolerance
    )


@pytest.mark.parametrize("precision", ["f32", "f16-native"])
def test_depthwise_and_channel_vector_round_trip(precision: str) -> None:
    depthwise = np.arange(7 * 3 * 3, dtype=np.float32).reshape(7, 1, 3, 3) / 13
    vector = np.linspace(-1, 1, 7, dtype=np.float32)
    packed_depthwise = pack_depthwise_c4yx(depthwise, precision=precision)  # type: ignore[arg-type]
    packed_vector = pack_c4(vector, precision=precision)  # type: ignore[arg-type]
    tolerance = 0 if precision == "f32" else 2e-3

    np.testing.assert_allclose(
        unpack_depthwise_c4yx(packed_depthwise),
        depthwise,
        rtol=tolerance,
        atol=tolerance,
    )
    np.testing.assert_allclose(
        unpack_c4(packed_vector), vector, rtol=tolerance, atol=tolerance
    )


@pytest.mark.parametrize("precision", ["f32", "f16-native"])
def test_direction_projection_o4i4_round_trip(precision: str) -> None:
    source = np.arange(4 * 17 * 5, dtype=np.float32).reshape(4, 17, 5) / 31
    packed = pack_direction_o4i4(source, precision=precision)  # type: ignore[arg-type]
    assert packed.logical_shape == (4, 17, 5)
    assert packed.layout == "direction-o4i4"
    tolerance = 0 if precision == "f32" else 3e-3
    np.testing.assert_allclose(
        unpack_direction_o4i4(packed), source, rtol=tolerance, atol=tolerance
    )


def test_pack_rejects_nonfinite_or_wrong_dtype() -> None:
    with pytest.raises(PackingError, match="float32"):
        pack_c4(np.ones(4, dtype=np.float64))
    with pytest.raises(PackingError, match="NaN or infinity"):
        pack_c4(np.asarray([0, np.inf], dtype=np.float32))
    with pytest.raises(PackingError, match="finite f16 range"):
        pack_c4(
            np.asarray([0, 70_000, 0, 0], dtype=np.float32),
            precision="f16-native",
        )
