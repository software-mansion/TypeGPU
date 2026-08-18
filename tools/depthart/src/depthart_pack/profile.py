"""Strict identity and structural checks for the official DepthART ONNX exports."""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable, Mapping
from dataclasses import asdict, dataclass
from hashlib import sha256
from pathlib import Path
from typing import Any, Literal

import numpy as np
import onnx
from onnx import TensorProto, numpy_helper, shape_inference


class ProfileError(ValueError):
    """The input artifact is not one of the supported official models."""


@dataclass(frozen=True)
class OfficialArtifact:
    filename: str
    byte_length: int
    sha256: str
    hub_revision: str
    source_revision: str


@dataclass(frozen=True)
class ScanContract:
    """One SelectiveScan node's pinned location and recurrence widths."""

    node_name: str
    low_channels: int
    dt_rank: int
    state_size: int
    length: int


OutputPolarity = Literal["direct", "inverted"]


@dataclass(frozen=True)
class OfficialVariant:
    """One released DepthART size and the structural figures that vary with it."""

    graph_model: str
    bundle_model: str
    artifact: OfficialArtifact
    node_count: int
    initializer_count: int
    initializer_element_count: int
    op_counts: Mapping[str, int]
    scans: tuple[ScanContract, ...]
    reparameterized_depthwise_motifs: int
    # Sign the released checkpoint emits relative disparity in, not a conversion choice.
    output_polarity: OutputPolarity = "direct"
    # Only published for the large checkpoint; no ONNX export carries the figure.
    checkpoint_parameter_count: int | None = None


UNOFFICIAL_MODEL = "depthart-unofficial"
"""Model name given to a graph whose artifact identity was not recognized."""

_HUB_REVISION = "483c4b9c59f476b7e37d879f44e13a1088249522"
_SOURCE_REVISION = "0384521b3bcb4c64adf03eeb5d55ebdb1cbdd84c"

_SCAN_DIRECTIONS = 4

_SHARED_OP_COUNTS = {
    "AveragePool": 4,
    "Cast": 11,
    "Concat": 63,
    "Einsum": 10,
    "Exp": 5,
    "Gather": 38,
    "LayerNormalization": 5,
    "Neg": 5,
    "Relu": 16,
    "Reshape": 40,
    "Resize": 13,
    "Shape": 46,
    "Sigmoid": 5,
    "Slice": 58,
    "Split": 10,
    "Sub": 4,
    "Transpose": 20,
    "Unsqueeze": 92,
    "com.depthart::SelectiveScan": 5,
}


def _op_counts(
    *,
    add: int,
    batch_normalization: int,
    constant: int,
    conv: int,
    div: int,
    erf: int,
    mul: int,
) -> dict[str, int]:
    """Full histogram for one size; the graphs vary only in these seven ops."""

    return dict(
        sorted(
            {
                **_SHARED_OP_COUNTS,
                "Add": add,
                "BatchNormalization": batch_normalization,
                "Constant": constant,
                "Conv": conv,
                "Div": div,
                "Erf": erf,
                "Mul": mul,
            }.items()
        )
    )


OFFICIAL_VARIANTS = (
    OfficialVariant(
        graph_model="depthart-s",
        bundle_model="depthart-relative-s-448",
        artifact=OfficialArtifact(
            filename="relative_s_448_default.onnx",
            byte_length=24_544_478,
            sha256="4773e2648803d207c470c86633c3059fd792bc87c5fdffce817005f6711abf06",
            hub_revision=_HUB_REVISION,
            source_revision=_SOURCE_REVISION,
        ),
        node_count=1392,
        initializer_count=739,
        initializer_element_count=6_042_245,
        op_counts=_op_counts(
            add=135,
            batch_normalization=123,
            constant=423,
            conv=144,
            div=23,
            erf=23,
            mul=71,
        ),
        scans=(
            ScanContract(
                "/pretrained/network.0/network.0.2/op/SelectiveScan", 12, 3, 8, 196
            ),
            ScanContract(
                "/pretrained/network.2/network.2.2/op/SelectiveScan", 32, 4, 8, 196
            ),
            ScanContract(
                "/pretrained/network.4/network.4.4/op/SelectiveScan", 84, 11, 8, 196
            ),
            ScanContract(
                "/pretrained/network.4/network.4.8/op/SelectiveScan", 84, 11, 8, 196
            ),
            ScanContract(
                "/pretrained/network.6/network.6.5/op/SelectiveScan", 168, 14, 8, 196
            ),
        ),
        reparameterized_depthwise_motifs=31,
    ),
    OfficialVariant(
        graph_model="depthart-b",
        bundle_model="depthart-relative-b-448",
        artifact=OfficialArtifact(
            filename="relative_b_448_default.onnx",
            byte_length=46_137_401,
            sha256="33bd1369d7b2c00d1057f22f73e9ae3ea1e42b9f492d3884233ffc91d97fb6fd",
            hub_revision=_HUB_REVISION,
            source_revision=_SOURCE_REVISION,
        ),
        node_count=1412,
        initializer_count=761,
        initializer_element_count=11_438_757,
        op_counts=_op_counts(
            add=139,
            batch_normalization=127,
            constant=426,
            conv=148,
            div=24,
            erf=24,
            mul=74,
        ),
        scans=(
            ScanContract(
                "/pretrained/network.0/network.0.3/op/SelectiveScan", 12, 3, 8, 196
            ),
            ScanContract(
                "/pretrained/network.2/network.2.2/op/SelectiveScan", 48, 6, 8, 196
            ),
            ScanContract(
                "/pretrained/network.4/network.4.5/op/SelectiveScan", 96, 12, 8, 196
            ),
            ScanContract(
                "/pretrained/network.4/network.4.9/op/SelectiveScan", 96, 12, 8, 196
            ),
            ScanContract(
                "/pretrained/network.6/network.6.4/op/SelectiveScan", 288, 24, 8, 196
            ),
        ),
        reparameterized_depthwise_motifs=32,
        output_polarity="inverted",
    ),
    OfficialVariant(
        graph_model="depthart-l",
        bundle_model="depthart-relative-l-448",
        artifact=OfficialArtifact(
            filename="relative_l_448_default.onnx",
            byte_length=131_090_446,
            sha256="358079054bb10dd9caca164b7799e22598b3f54f2201a86bb9ed09cc891cb04f",
            hub_revision=_HUB_REVISION,
            source_revision=_SOURCE_REVISION,
        ),
        node_count=1492,
        initializer_count=849,
        initializer_element_count=32_669_905,
        op_counts=_op_counts(
            add=155,
            batch_normalization=143,
            constant=438,
            conv=164,
            div=28,
            erf=28,
            mul=86,
        ),
        scans=(
            ScanContract(
                "/pretrained/network.0/network.0.3/op/SelectiveScan", 16, 4, 8, 196
            ),
            ScanContract(
                "/pretrained/network.2/network.2.3/op/SelectiveScan", 64, 8, 8, 196
            ),
            ScanContract(
                "/pretrained/network.4/network.4.6/op/SelectiveScan", 192, 24, 8, 196
            ),
            ScanContract(
                "/pretrained/network.4/network.4.11/op/SelectiveScan", 192, 24, 8, 196
            ),
            ScanContract(
                "/pretrained/network.6/network.6.5/op/SelectiveScan", 384, 32, 8, 196
            ),
        ),
        reparameterized_depthwise_motifs=36,
        checkpoint_parameter_count=32_612_689,
    ),
)


def variant_for_artifact(byte_length: int, digest: str) -> OfficialVariant | None:
    """Resolve a released size by artifact identity, or `None` when unrecognized."""

    for variant in OFFICIAL_VARIANTS:
        if (
            variant.artifact.byte_length == byte_length
            and variant.artifact.sha256 == digest
        ):
            return variant
    return None


def variant_for_model(model: str) -> OfficialVariant:
    """Resolve the released size a normalized graph was extracted from."""

    for variant in OFFICIAL_VARIANTS:
        if variant.graph_model == model:
            return variant
    raise ProfileError(f"unsupported DepthART variant {model!r}")


def _pinned_identities() -> str:
    return "; ".join(
        f"{variant.artifact.filename} ({variant.artifact.byte_length} bytes, "
        f"sha256 {variant.artifact.sha256})"
        for variant in OFFICIAL_VARIANTS
    )


@dataclass(frozen=True)
class TensorShape:
    name: str
    element_type: int
    dims: tuple[int | str | None, ...]


@dataclass(frozen=True)
class ScanProfile:
    name: str
    low_channels: int
    directions: int
    state_size: int
    dt_rank: int
    length: int
    u_shape: tuple[int, ...]
    delta_shape: tuple[int, ...]
    a_shape: tuple[int, ...]
    b_shape: tuple[int, ...]
    c_shape: tuple[int, ...]
    d_shape: tuple[int, ...]
    bias_shape: tuple[int, ...]
    x_proj_initializer: str
    dt_proj_initializer: str
    delta_softplus: bool
    out_float: bool


@dataclass(frozen=True)
class OnnxProfile:
    path: str
    model: str
    byte_length: int
    sha256: str
    ir_version: int
    opsets: dict[str, int]
    node_count: int
    initializer_count: int
    initializer_element_count: int
    checkpoint_parameter_count: int | None
    op_counts: dict[str, int]
    inputs: tuple[TensorShape, ...]
    outputs: tuple[TensorShape, ...]
    scans: tuple[ScanProfile, ...]
    official: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def sha256_file(path: str | Path, *, block_size: int = 4 * 1024 * 1024) -> str:
    digest = sha256()
    with Path(path).open("rb") as stream:
        while block := stream.read(block_size):
            digest.update(block)
    return digest.hexdigest()


def _attribute(node: onnx.NodeProto, name: str) -> Any:
    for attr in node.attribute:
        if attr.name == name:
            return onnx.helper.get_attribute_value(attr)
    raise ProfileError(f"{node.name or node.op_type}: missing attribute {name!r}")


def _shape_from_value(value: onnx.ValueInfoProto) -> TensorShape:
    tensor_type = value.type.tensor_type
    dims: list[int | str | None] = []
    for dim in tensor_type.shape.dim:
        if dim.HasField("dim_value"):
            dims.append(int(dim.dim_value))
        elif dim.HasField("dim_param"):
            dims.append(dim.dim_param)
        else:
            dims.append(None)
    return TensorShape(value.name, int(tensor_type.elem_type), tuple(dims))


def _shape_table(model: onnx.ModelProto) -> dict[str, tuple[int | str | None, ...]]:
    table: dict[str, tuple[int | str | None, ...]] = {}
    values = (*model.graph.input, *model.graph.value_info, *model.graph.output)
    for value in values:
        table[value.name] = _shape_from_value(value).dims
    for tensor in model.graph.initializer:
        table[tensor.name] = tuple(int(dim) for dim in tensor.dims)
    return table


def _static_shape(
    table: dict[str, tuple[int | str | None, ...]], name: str, *, context: str
) -> tuple[int, ...]:
    shape = table.get(name)
    if shape is None or any(not isinstance(dim, int) or dim <= 0 for dim in shape):
        raise ProfileError(
            f"{context}: tensor {name!r} lacks a positive static shape: {shape}"
        )
    return tuple(int(dim) for dim in shape)


def _op_key(node: onnx.NodeProto) -> str:
    return f"{node.domain}::{node.op_type}" if node.domain else node.op_type


def _find_stage_initializer(
    initializers: dict[str, onnx.TensorProto], node_name: str, suffix: str
) -> str:
    # The official export preserves these two semantic parameter names.
    match = re.search(r"/network\.(\d+\.\d+)/op/SelectiveScan$", node_name)
    if match is None:
        raise ProfileError(f"unknown scan location: {node_name}")
    expected_name = f"pretrained.network.{match.group(1)}.op.{suffix}"
    candidates = [name for name in initializers if name == expected_name]
    if len(candidates) != 1:
        raise ProfileError(
            f"{node_name}: expected one {suffix} initializer, found {len(candidates)}: {candidates}"
        )
    return candidates[0]


def _reject_external_data(initializers: Iterable[onnx.TensorProto]) -> None:
    external = [
        tensor.name
        for tensor in initializers
        if tensor.data_location == TensorProto.EXTERNAL or tensor.external_data
    ]
    if external:
        raise ProfileError(f"external tensor data is not supported: {external[:5]}")


def _check_initializer_finiteness(initializers: Iterable[onnx.TensorProto]) -> None:
    for tensor in initializers:
        if tensor.data_type not in {
            TensorProto.FLOAT,
            TensorProto.DOUBLE,
            TensorProto.FLOAT16,
            TensorProto.BFLOAT16,
        }:
            continue
        values = numpy_helper.to_array(tensor)
        if not np.all(np.isfinite(values)):
            raise ProfileError(f"initializer {tensor.name!r} contains NaN or infinity")


def _scan_nodes(model: onnx.ModelProto) -> list[onnx.NodeProto]:
    return [
        node
        for node in model.graph.node
        if node.domain == "com.depthart" and node.op_type == "SelectiveScan"
    ]


def _derive_scan_contract(
    node: onnx.NodeProto,
    initializers: dict[str, onnx.TensorProto],
    shapes: dict[str, tuple[int | str | None, ...]],
) -> ScanContract:
    """Read one scan's widths off the graph so pinning is an equality check."""

    if len(node.input) != 7 or len(node.output) != 1:
        raise ProfileError(f"{node.name}: expected 7 inputs and 1 output")
    u_shape = _static_shape(shapes, node.input[0], context=node.name)
    b_shape = _static_shape(shapes, node.input[3], context=node.name)
    if len(u_shape) != 3 or len(b_shape) != 4 or b_shape[1] != _SCAN_DIRECTIONS:
        raise ProfileError(f"{node.name}: unsupported scan operand ranks")
    if u_shape[1] % _SCAN_DIRECTIONS:
        raise ProfileError(f"{node.name}: scan channels are not direction aligned")
    state_size = b_shape[2]
    x_projection = _find_stage_initializer(initializers, node.name, "x_proj_weight")
    x_shape = tuple(int(dim) for dim in initializers[x_projection].dims)
    if len(x_shape) != 3:
        raise ProfileError(f"{node.name}: unexpected x projection rank {x_shape}")
    dt_rank = x_shape[1] - 2 * state_size
    if dt_rank <= 0:
        raise ProfileError(f"{node.name}: non-positive scan rank from {x_shape}")
    return ScanContract(
        node_name=node.name,
        low_channels=u_shape[1] // _SCAN_DIRECTIONS,
        dt_rank=dt_rank,
        state_size=state_size,
        length=b_shape[3],
    )


def _profile_scans(
    model: onnx.ModelProto,
    shapes: dict[str, tuple[int | str | None, ...]],
    expected: tuple[ScanContract, ...] | None,
) -> tuple[ScanProfile, ...]:
    initializers = {tensor.name: tensor for tensor in model.graph.initializer}
    nodes = _scan_nodes(model)
    contracts = tuple(
        _derive_scan_contract(node, initializers, shapes) for node in nodes
    )
    if expected is not None and contracts != expected:
        raise ProfileError(
            f"SelectiveScan nodes do not match the pinned graph: {contracts!r}"
        )

    result: list[ScanProfile] = []
    for node, contract in zip(nodes, contracts, strict=True):
        expected_low = contract.low_channels
        expected_rank = contract.dt_rank
        expected_state = contract.state_size
        expected_length = contract.length
        input_shapes = [
            _static_shape(shapes, name, context=node.name) for name in node.input
        ]
        u_shape, delta_shape, a_shape, b_shape, c_shape, d_shape, bias_shape = (
            input_shapes
        )
        directions = _SCAN_DIRECTIONS
        expected_shapes = {
            "u": (1, directions * expected_low, expected_length),
            "delta": (1, directions * expected_low, expected_length),
            "A": (directions * expected_low, expected_state),
            "B": (1, directions, expected_state, expected_length),
            "C": (1, directions, expected_state, expected_length),
            "D": (directions * expected_low,),
            "bias": (directions * expected_low,),
        }
        actual = dict(
            zip(
                expected_shapes,
                (u_shape, delta_shape, a_shape, b_shape, c_shape, d_shape, bias_shape),
                strict=True,
            )
        )
        mismatches = {
            key: (actual[key], wanted)
            for key, wanted in expected_shapes.items()
            if actual[key] != wanted
        }
        if mismatches:
            raise ProfileError(f"{node.name}: unexpected scan shapes: {mismatches}")

        x_proj = _find_stage_initializer(initializers, node.name, "x_proj_weight")
        dt_proj = _find_stage_initializer(initializers, node.name, "dt_projs_weight")
        x_shape = tuple(int(dim) for dim in initializers[x_proj].dims)
        dt_shape = tuple(int(dim) for dim in initializers[dt_proj].dims)
        if x_shape != (directions, expected_rank + 2 * expected_state, expected_low):
            raise ProfileError(f"{node.name}: unexpected x projection shape {x_shape}")
        if dt_shape != (directions, expected_low, expected_rank):
            raise ProfileError(
                f"{node.name}: unexpected dt projection shape {dt_shape}"
            )

        result.append(
            ScanProfile(
                name=node.name,
                low_channels=expected_low,
                directions=directions,
                state_size=expected_state,
                dt_rank=expected_rank,
                length=expected_length,
                u_shape=u_shape,
                delta_shape=delta_shape,
                a_shape=a_shape,
                b_shape=b_shape,
                c_shape=c_shape,
                d_shape=d_shape,
                bias_shape=bias_shape,
                x_proj_initializer=x_proj,
                dt_proj_initializer=dt_proj,
                delta_softplus=bool(_attribute(node, "delta_softplus")),
                out_float=bool(_attribute(node, "out_float")),
            )
        )
    return tuple(result)


def inspect_onnx(
    path: str | Path,
    *,
    require_official: bool = True,
    check_finite: bool = True,
) -> OnnxProfile:
    """Load and validate one of the pinned official DepthART 448 artifacts.

    Identity is checked before protobuf parsing. Structural checks are deliberately
    redundant with the digest check so a future explicitly permitted artifact cannot
    silently change the runtime contract.
    """

    model_path = Path(path)
    byte_length = model_path.stat().st_size
    digest = sha256_file(model_path)
    variant = variant_for_artifact(byte_length, digest)
    if require_official and variant is None:
        raise ProfileError(
            f"artifact identity mismatch: expected one of {_pinned_identities()}; "
            f"got {byte_length} bytes and sha256 {digest}"
        )

    model = onnx.load_model(model_path, load_external_data=False)
    _reject_external_data(model.graph.initializer)
    onnx.checker.check_model(model, full_check=True)
    inferred = shape_inference.infer_shapes(model, strict_mode=True, data_prop=True)
    if check_finite:
        _check_initializer_finiteness(inferred.graph.initializer)

    opsets = {entry.domain: int(entry.version) for entry in inferred.opset_import}
    counts = Counter(_op_key(node) for node in inferred.graph.node)
    if variant is not None:
        if model.ir_version != 8:
            raise ProfileError(f"expected ONNX IR 8, got {model.ir_version}")
        if opsets != {"": 17, "com.depthart": 1}:
            raise ProfileError(f"unexpected opsets: {opsets}")
        if len(inferred.graph.node) != variant.node_count:
            raise ProfileError(
                f"expected {variant.node_count} nodes, got {len(inferred.graph.node)}"
            )
        if len(inferred.graph.initializer) != variant.initializer_count:
            raise ProfileError(
                f"expected {variant.initializer_count} initializers, got "
                f"{len(inferred.graph.initializer)}"
            )
        if dict(counts) != dict(variant.op_counts):
            raise ProfileError(f"unexpected operation histogram: {dict(counts)}")

    inputs = tuple(_shape_from_value(value) for value in inferred.graph.input)
    outputs = tuple(_shape_from_value(value) for value in inferred.graph.output)
    if variant is not None:
        if (
            len(inputs) != 1
            or inputs[0].name != "image"
            or inputs[0].dims != (1, 3, 448, 448)
        ):
            raise ProfileError(f"unexpected model input: {inputs}")
        if len(outputs) != 1 or outputs[0].name != "depth":
            raise ProfileError(f"unexpected model output: {outputs}")
        output_dims = outputs[0].dims
        if len(output_dims) != 4 or output_dims[:2] != (1, 1):
            raise ProfileError(f"unexpected model output shape: {output_dims}")

    initializer_elements = sum(
        int(np.prod(tensor.dims, dtype=np.int64))
        for tensor in inferred.graph.initializer
    )
    if (
        variant is not None
        and initializer_elements != variant.initializer_element_count
    ):
        raise ProfileError(
            f"expected {variant.initializer_element_count} ONNX initializer "
            f"elements, got {initializer_elements}"
        )
    return OnnxProfile(
        path=str(model_path.resolve()),
        model=variant.graph_model if variant is not None else UNOFFICIAL_MODEL,
        byte_length=byte_length,
        sha256=digest,
        ir_version=int(model.ir_version),
        opsets=opsets,
        node_count=len(inferred.graph.node),
        initializer_count=len(inferred.graph.initializer),
        initializer_element_count=initializer_elements,
        checkpoint_parameter_count=(
            variant.checkpoint_parameter_count if variant is not None else None
        ),
        op_counts=dict(sorted(counts.items())),
        inputs=inputs,
        outputs=outputs,
        scans=_profile_scans(
            inferred,
            _shape_table(inferred),
            variant.scans if variant is not None else None,
        ),
        official=variant is not None,
    )
