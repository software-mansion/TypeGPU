from __future__ import annotations

from hashlib import sha256

import numpy as np
import pytest

from depthart_pack.graph import (
    ConstantRecord,
    DispatchRecord,
    ExtractionError,
    NormalizedGraph,
    TensorRecord,
    ViewRecord,
)
from depthart_pack.lowering import (
    canonicalize_runtime_graph,
    fold_regular_conv_channel_affines,
    fuse_channel_affine_dispatches,
    fuse_regular_conv_activations,
    lower_dynamic_views,
)


def _tensor(tensor_id: str, shape: tuple[int, ...]) -> TensorRecord:
    return TensorRecord(tensor_id, shape, "f32", "nchw", "activation")


def _graph(
    tensors: dict[str, TensorRecord],
    views: list[ViewRecord],
    dispatches: list[DispatchRecord],
    *,
    input_id: str,
    output_id: str,
) -> NormalizedGraph:
    return NormalizedGraph(
        model="depthart-l",
        source_sha256="0" * 64,
        input_id=input_id,
        output_id=output_id,
        tensors=tensors,
        constants={},
        views=views,
        dispatches=dispatches,
        scans=(),
        constant_values={},
    )


def test_post_scan_layout_triplet_is_proven_and_rewired() -> None:
    source_shape = (1, 4, 2, 2)
    temporary_shape = (1, 2, 2, 4)
    tensors = {
        "source": _tensor("source", source_shape),
        "reshaped": _tensor("reshaped", temporary_shape),
        "cast": _tensor("cast", temporary_shape),
        "transposed": _tensor("transposed", source_shape),
        "output": _tensor("output", source_shape),
    }
    views = [
        ViewRecord(
            "reshape",
            "reshape-view",
            ("source",),
            ("reshaped",),
            (source_shape,),
            (temporary_shape,),
            {"allowzero": 0, "constantInputs": {"1": [1, 2, 2, 4]}},
        ),
        ViewRecord(
            "cast-view",
            "reinterpret-or-convert",
            ("reshaped",),
            ("cast",),
            (temporary_shape,),
            (temporary_shape,),
            {"to": 1},
        ),
        ViewRecord(
            "transpose",
            "transpose-view",
            ("cast",),
            ("transposed",),
            (temporary_shape,),
            (source_shape,),
            {"perm": [0, 3, 1, 2]},
        ),
    ]
    dispatch = DispatchRecord(
        "consumer",
        "activation",
        ("transposed",),
        ("output",),
        (source_shape,),
        {"kind": "relu"},
    )

    lowered = lower_dynamic_views(
        _graph(tensors, views, [dispatch], input_id="source", output_id="output")
    )

    assert not lowered.views
    assert lowered.dispatches[0].inputs == ("source",)
    assert set(lowered.tensors) == {"source", "output"}


def test_channel_views_become_explicit_block_aligned_copy_dispatches() -> None:
    full = (1, 8, 2, 2)
    half = (1, 4, 2, 2)
    tensors = {
        "input": _tensor("input", full),
        "low": _tensor("low", half),
        "high": _tensor("high", half),
        "output": _tensor("output", full),
    }
    views = [
        ViewRecord(
            "split",
            "virtual-split",
            ("input",),
            ("low", "high"),
            (full,),
            (half, half),
            {"axis": 1, "constantInputs": {"1": [4, 4]}},
        ),
        ViewRecord(
            "concat",
            "virtual-concat",
            ("low", "high"),
            ("output",),
            (half, half),
            (full,),
            {"axis": 1},
        ),
    ]

    lowered = lower_dynamic_views(
        _graph(tensors, views, [], input_id="input", output_id="output")
    )

    assert [dispatch.op for dispatch in lowered.dispatches] == [
        "channel-split",
        "channel-concat",
    ]
    assert lowered.dispatches[0].params == {
        "axis": 1,
        "splitChannels": [4, 4],
    }
    assert lowered.dispatches[1].params == {"axis": 1}


def test_channel_view_lowering_rejects_non_block_aligned_split() -> None:
    full = (1, 8, 2, 2)
    low = (1, 2, 2, 2)
    high = (1, 6, 2, 2)
    tensors = {
        "input": _tensor("input", full),
        "low": _tensor("low", low),
        "high": _tensor("high", high),
    }
    view = ViewRecord(
        "split",
        "virtual-split",
        ("input",),
        ("low", "high"),
        (full,),
        (low, high),
        {"axis": 1, "constantInputs": {"1": [2, 6]}},
    )

    with pytest.raises(ExtractionError, match="not HWC4 block-aligned"):
        lower_dynamic_views(
            _graph(tensors, [view], [], input_id="input", output_id="high")
        )


def _conv_params(*, activation: str = "none") -> dict[str, object]:
    return {
        "kernel": [1, 1],
        "stride": [1, 1],
        "padding": [0, 0, 0, 0],
        "groups": 1,
        "activation": activation,
        "weightPacking": "o4i4-yx",
        "biasPacking": "c4",
    }


@pytest.mark.parametrize("kind", ["gelu", "silu", "relu"])
def test_single_consumer_regular_conv_activation_is_fused(kind: str) -> None:
    shape = (1, 4, 2, 2)
    tensors = {
        "input": _tensor("input", shape),
        "weight": _tensor("weight", (4, 4, 1, 1)),
        "bias": _tensor("bias", (4,)),
        "conv-output": _tensor("conv-output", shape),
        "output": _tensor("output", shape),
    }
    convolution = DispatchRecord(
        "conv",
        "conv2d",
        ("input", "weight", "bias"),
        ("conv-output",),
        (shape,),
        _conv_params(),
    )
    activation = DispatchRecord(
        "activation",
        "activation",
        ("conv-output",),
        ("output",),
        (shape,),
        {"kind": kind},
    )

    fused = fuse_regular_conv_activations(
        _graph(
            tensors,
            [],
            [convolution, activation],
            input_id="input",
            output_id="output",
        )
    )

    assert len(fused.dispatches) == 1
    assert fused.dispatches[0].id == "conv"
    assert fused.dispatches[0].outputs == ("output",)
    assert fused.dispatches[0].params == _conv_params(activation=kind)
    assert "conv-output" not in fused.tensors
    assert set(fused.tensors) == {"input", "weight", "bias", "output"}


def test_conv_activation_fusion_preserves_fanout() -> None:
    shape = (1, 4, 2, 2)
    tensors = {
        tensor_id: _tensor(tensor_id, shape)
        for tensor_id in ("input", "conv-output", "output", "side-output")
    }
    tensors["weight"] = _tensor("weight", (4, 4, 1, 1))
    tensors["bias"] = _tensor("bias", (4,))
    dispatches = [
        DispatchRecord(
            "conv",
            "conv2d",
            ("input", "weight", "bias"),
            ("conv-output",),
            (shape,),
            _conv_params(),
        ),
        DispatchRecord(
            "activation",
            "activation",
            ("conv-output",),
            ("output",),
            (shape,),
            {"kind": "relu"},
        ),
        DispatchRecord(
            "side-activation",
            "activation",
            ("conv-output",),
            ("side-output",),
            (shape,),
            {"kind": "gelu"},
        ),
    ]

    result = fuse_regular_conv_activations(
        _graph(tensors, [], dispatches, input_id="input", output_id="output")
    )

    assert result.dispatches == dispatches
    assert result.dispatches[0].params["activation"] == "none"
    assert "conv-output" in result.tensors


def test_conv_activation_fusion_ignores_depthwise_and_already_fused_conv() -> None:
    shape = (1, 4, 2, 2)
    tensors = {
        tensor_id: _tensor(tensor_id, shape)
        for tensor_id in (
            "input",
            "depthwise-output",
            "middle",
            "conv-output",
            "output",
        )
    }
    tensors["weight"] = _tensor("weight", (4, 4, 1, 1))
    tensors["bias"] = _tensor("bias", (4,))
    dispatches = [
        DispatchRecord(
            "depthwise",
            "depthwise-conv2d",
            ("input", "weight", "bias"),
            ("depthwise-output",),
            (shape,),
            {**_conv_params(), "groups": 4, "weightPacking": "c4-yx"},
        ),
        DispatchRecord(
            "standalone",
            "activation",
            ("depthwise-output",),
            ("middle",),
            (shape,),
            {"kind": "relu"},
        ),
        DispatchRecord(
            "pre-fused",
            "conv2d",
            ("middle", "weight", "bias"),
            ("conv-output",),
            (shape,),
            _conv_params(activation="gelu"),
        ),
        DispatchRecord(
            "following",
            "activation",
            ("conv-output",),
            ("output",),
            (shape,),
            {"kind": "relu"},
        ),
    ]

    result = fuse_regular_conv_activations(
        _graph(tensors, [], dispatches, input_id="input", output_id="output")
    )

    assert result.dispatches == dispatches
    assert [dispatch.op for dispatch in result.dispatches].count("activation") == 2


def _constant_tensor(
    tensor_id: str, value: np.ndarray
) -> tuple[TensorRecord, ConstantRecord]:
    array = np.ascontiguousarray(value, dtype=np.float32)
    data = array.tobytes()
    return (
        TensorRecord(tensor_id, array.shape, "f32", "raw", "weight"),
        ConstantRecord(
            tensor_id,
            array.shape,
            "f32",
            len(data),
            sha256(data).hexdigest(),
        ),
    )


def test_conv_channel_scale_and_shift_fold_into_generated_fp32_constants() -> None:
    shape = (1, 4, 2, 2)
    values = {
        "weight": np.arange(16, dtype=np.float32).reshape(4, 4, 1, 1) / 7,
        "bias": np.asarray([1, 2, 3, 4], dtype=np.float32),
        "scale": np.asarray([0.5, -1, 2, 0.25], dtype=np.float32).reshape(4, 1, 1),
        "shift": np.asarray([3, 2, 1, -1], dtype=np.float32).reshape(4, 1, 1),
    }
    tensors = {
        tensor_id: _tensor(tensor_id, shape)
        for tensor_id in ("input", "conv-output", "mul-output", "output")
    }
    constants: dict[str, ConstantRecord] = {}
    for tensor_id, value in values.items():
        tensor, constant = _constant_tensor(tensor_id, value)
        tensors[tensor_id] = tensor
        constants[tensor_id] = constant
    graph = NormalizedGraph(
        model="depthart-l",
        source_sha256="0" * 64,
        input_id="input",
        output_id="output",
        tensors=tensors,
        constants=constants,
        views=[],
        dispatches=[
            DispatchRecord(
                "conv",
                "conv2d",
                ("input", "weight", "bias"),
                ("conv-output",),
                (shape,),
                _conv_params(),
            ),
            DispatchRecord(
                "scale",
                "binary",
                ("conv-output", "scale"),
                ("mul-output",),
                (shape,),
                {"kind": "mul", "broadcast": "channels"},
            ),
            DispatchRecord(
                "shift",
                "binary",
                ("mul-output", "shift"),
                ("output",),
                (shape,),
                {"kind": "add", "broadcast": "channels"},
            ),
        ],
        scans=(),
        constant_values=values,
    )

    folded = canonicalize_runtime_graph(fold_regular_conv_channel_affines(graph))

    assert len(folded.dispatches) == 1
    convolution = folded.dispatches[0]
    assert convolution.id == "conv"
    assert convolution.outputs == ("output",)
    assert convolution.inputs == (
        "input",
        "generated/channel-affine/0/weight",
        "generated/channel-affine/0/bias",
    )
    expected_scale = values["scale"].reshape(-1)
    expected_shift = values["shift"].reshape(-1)
    np.testing.assert_array_equal(
        folded.constant_values[convolution.inputs[1]],
        values["weight"] * expected_scale[:, None, None, None],
    )
    np.testing.assert_array_equal(
        folded.constant_values[convolution.inputs[2]],
        values["bias"] * expected_scale + expected_shift,
    )
    assert set(folded.constants) == set(convolution.inputs[1:])
    assert set(folded.tensors) == {"input", *convolution.inputs[1:], "output"}


def test_conv_channel_scale_folding_preserves_fanout() -> None:
    shape = (1, 4, 2, 2)
    values = {
        "weight": np.ones((4, 4, 1, 1), dtype=np.float32),
        "bias": np.zeros(4, dtype=np.float32),
        "scale": np.ones(4, dtype=np.float32),
    }
    tensors = {
        tensor_id: _tensor(tensor_id, shape)
        for tensor_id in ("input", "conv-output", "output", "side-output")
    }
    constants: dict[str, ConstantRecord] = {}
    for tensor_id, value in values.items():
        tensor, constant = _constant_tensor(tensor_id, value)
        tensors[tensor_id] = tensor
        constants[tensor_id] = constant
    dispatches = [
        DispatchRecord(
            "conv",
            "conv2d",
            ("input", "weight", "bias"),
            ("conv-output",),
            (shape,),
            _conv_params(),
        ),
        DispatchRecord(
            "scale",
            "binary",
            ("conv-output", "scale"),
            ("output",),
            (shape,),
            {"kind": "mul", "broadcast": "channels"},
        ),
        DispatchRecord(
            "side",
            "activation",
            ("conv-output",),
            ("side-output",),
            (shape,),
            {"kind": "relu"},
        ),
    ]
    graph = NormalizedGraph(
        model="depthart-l",
        source_sha256="0" * 64,
        input_id="input",
        output_id="output",
        tensors=tensors,
        constants=constants,
        views=[],
        dispatches=dispatches,
        scans=(),
        constant_values=values,
    )

    folded = fold_regular_conv_channel_affines(graph)

    assert folded.dispatches == dispatches
    assert set(folded.constant_values) == set(values)
    for tensor_id, value in values.items():
        np.testing.assert_array_equal(folded.constant_values[tensor_id], value)


def test_single_consumer_channel_mul_add_becomes_materialized_affine() -> None:
    shape = (1, 4, 2, 2)
    values = {
        "scale": np.asarray([1, 2, 3, 4], dtype=np.float32),
        "bias": np.asarray([-1, -2, -3, -4], dtype=np.float32),
    }
    tensors = {
        tensor_id: _tensor(tensor_id, shape)
        for tensor_id in ("input", "scaled", "output")
    }
    constants: dict[str, ConstantRecord] = {}
    for tensor_id, value in values.items():
        tensor, constant = _constant_tensor(tensor_id, value)
        tensors[tensor_id] = tensor
        constants[tensor_id] = constant
    graph = NormalizedGraph(
        model="depthart-l",
        source_sha256="0" * 64,
        input_id="input",
        output_id="output",
        tensors=tensors,
        constants=constants,
        views=[],
        dispatches=[
            DispatchRecord(
                "scale",
                "binary",
                ("input", "scale"),
                ("scaled",),
                (shape,),
                {"kind": "mul", "broadcast": "channels"},
            ),
            DispatchRecord(
                "bias",
                "binary",
                ("scaled", "bias"),
                ("output",),
                (shape,),
                {"kind": "add", "broadcast": "channels"},
            ),
        ],
        scans=(),
        constant_values=values,
    )

    fused = canonicalize_runtime_graph(fuse_channel_affine_dispatches(graph))

    assert fused.dispatches == [
        DispatchRecord(
            "scale",
            "channel-affine",
            ("input", "scale", "bias"),
            ("output",),
            (shape,),
            {"axis": 1},
        )
    ]
    assert "scaled" not in fused.tensors


def test_channel_affine_fusion_preserves_multiply_fanout() -> None:
    shape = (1, 4, 2, 2)
    values = {
        "scale": np.ones(4, dtype=np.float32),
        "bias": np.zeros(4, dtype=np.float32),
    }
    tensors = {
        tensor_id: _tensor(tensor_id, shape)
        for tensor_id in ("input", "scaled", "output", "side")
    }
    constants: dict[str, ConstantRecord] = {}
    for tensor_id, value in values.items():
        tensor, constant = _constant_tensor(tensor_id, value)
        tensors[tensor_id] = tensor
        constants[tensor_id] = constant
    dispatches = [
        DispatchRecord(
            "scale",
            "binary",
            ("input", "scale"),
            ("scaled",),
            (shape,),
            {"kind": "mul", "broadcast": "channels"},
        ),
        DispatchRecord(
            "bias",
            "binary",
            ("scaled", "bias"),
            ("output",),
            (shape,),
            {"kind": "add", "broadcast": "channels"},
        ),
        DispatchRecord(
            "side",
            "activation",
            ("scaled",),
            ("side",),
            (shape,),
            {"kind": "relu"},
        ),
    ]
    graph = NormalizedGraph(
        model="depthart-l",
        source_sha256="0" * 64,
        input_id="input",
        output_id="output",
        tensors=tensors,
        constants=constants,
        views=[],
        dispatches=dispatches,
        scans=(),
        constant_values=values,
    )

    fused = fuse_channel_affine_dispatches(graph)

    assert fused.dispatches == dispatches
    assert "scaled" in fused.tensors
