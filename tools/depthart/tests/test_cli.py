from __future__ import annotations

import pytest

from depthart_pack.cli import parser
from depthart_pack.exporter import BALANCED_FP16_PROFILE, F32_REFERENCE_PROFILE


def test_export_profiles_are_explicit() -> None:
    default = parser().parse_args(["convert", "model.onnx", "model.depthart"])
    assert default.profile == F32_REFERENCE_PROFILE

    balanced = parser().parse_args(
        [
            "convert",
            "model.onnx",
            "model.depthart",
            "--profile",
            BALANCED_FP16_PROFILE,
            "--fold-channel-affine",
            "--fuse-channel-affine",
        ]
    )
    assert balanced.profile == BALANCED_FP16_PROFILE
    assert balanced.fold_channel_affine and balanced.fuse_channel_affine

    with pytest.raises(SystemExit):
        parser().parse_args(
            ["convert", "model.onnx", "model.depthart", "--profile", "abandoned"]
        )
