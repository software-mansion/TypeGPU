"""Model-specific normalization of the fixed DepthART 448 ONNX graphs.

This module is intentionally not a general ONNX compiler. It recognizes the
official graph's compute motifs and resolves shape plumbing offline. Extraction
keeps dynamic concat/split/layout operations as explicit view records; the
model-specific lowering pass either proves them storage-neutral or materializes
them as one of the frozen TypeGPU runtime operations.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import asdict, dataclass, field
from hashlib import sha256
from pathlib import Path
from typing import Any

import numpy as np
import onnx
from onnx import TensorProto, numpy_helper, shape_inference

from .fuse import batch_norm_affine, fold_batch_norm
from .profile import ProfileError, ScanProfile, inspect_onnx

RUNTIME_OPS = frozenset(
    {
        "conv2d",
        "depthwise-conv2d",
        "activation",
        "binary",
        "avg-pool2d",
        "resize2d",
        "layer-norm",
        "scan-project",
        "selective-scan",
        "scan-merge",
        "channel-split",
        "channel-concat",
        "channel-affine",
    }
)


class ExtractionError(ValueError):
    pass


@dataclass(frozen=True)
class TensorRecord:
    id: str
    shape: tuple[int, ...]
    dtype: str
    layout: str
    kind: str
    source_name: str | None = None


@dataclass(frozen=True)
class ConstantRecord:
    id: str
    shape: tuple[int, ...]
    dtype: str
    byte_length: int
    sha256: str
    generated: bool = False


@dataclass(frozen=True)
class ViewRecord:
    id: str
    kind: str
    inputs: tuple[str, ...]
    outputs: tuple[str, ...]
    input_shapes: tuple[tuple[int, ...], ...]
    output_shapes: tuple[tuple[int, ...], ...]
    params: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class DispatchRecord:
    id: str
    op: str
    inputs: tuple[str, ...]
    outputs: tuple[str, ...]
    output_shapes: tuple[tuple[int, ...], ...]
    params: dict[str, Any]


@dataclass
class NormalizedGraph:
    model: str
    source_sha256: str
    input_id: str
    output_id: str
    tensors: dict[str, TensorRecord]
    constants: dict[str, ConstantRecord]
    views: list[ViewRecord]
    dispatches: list[DispatchRecord]
    scans: tuple[ScanProfile, ...]
    constant_values: dict[str, np.ndarray] = field(repr=False)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "depthart.normalized-graph.v1",
            "model": self.model,
            "sourceSha256": self.source_sha256,
            "input": self.input_id,
            "output": self.output_id,
            "operationSet": sorted(RUNTIME_OPS),
            "tensorIndexing": {
                "activation4d": "ONNX NCHW logical shape; runtime materialization is NHWC/HWC4",
                "o4i4-yx": "[ob][ib][kernelY][kernelX][outputLane][inputLane]",
                "c4-yx": "[channelBlock][kernelY][kernelX][channelLane]",
                "scanDirections": [
                    "row-major forward",
                    "column-major forward",
                    "row-major reverse",
                    "column-major reverse",
                ],
            },
            "tensors": [asdict(value) for value in self.tensors.values()],
            "constants": [asdict(value) for value in self.constants.values()],
            "views": [asdict(value) for value in self.views],
            "dispatches": [asdict(value) for value in self.dispatches],
            "scans": [asdict(value) for value in self.scans],
        }


def _attribute(node: onnx.NodeProto, name: str, default: Any = None) -> Any:
    for attribute in node.attribute:
        if attribute.name == name:
            return onnx.helper.get_attribute_value(attribute)
    return default


def _dtype_name(dtype: np.dtype[Any]) -> str:
    if dtype == np.dtype(np.float32):
        return "f32"
    if dtype == np.dtype(np.float16):
        return "f16"
    if dtype == np.dtype(np.int64):
        return "i64"
    if dtype == np.dtype(np.int32):
        return "i32"
    if dtype == np.dtype(np.bool_):
        return "bool"
    raise ExtractionError(f"unsupported NumPy dtype {dtype}")


def _onnx_dtype_name(element_type: int) -> str:
    mapping = {
        TensorProto.FLOAT: "f32",
        TensorProto.FLOAT16: "f16",
        TensorProto.INT64: "i64",
        TensorProto.INT32: "i32",
        TensorProto.BOOL: "bool",
    }
    try:
        return mapping[element_type]
    except KeyError as error:
        raise ExtractionError(
            f"unsupported ONNX element type {element_type}"
        ) from error


def _value_shapes(model: onnx.ModelProto) -> dict[str, tuple[int | str | None, ...]]:
    result: dict[str, tuple[int | str | None, ...]] = {}
    for value in (*model.graph.input, *model.graph.value_info, *model.graph.output):
        dims: list[int | str | None] = []
        for dim in value.type.tensor_type.shape.dim:
            if dim.HasField("dim_value"):
                dims.append(int(dim.dim_value))
            elif dim.HasField("dim_param"):
                dims.append(dim.dim_param)
            else:
                dims.append(None)
        result[value.name] = tuple(dims)
    for tensor in model.graph.initializer:
        result[tensor.name] = tuple(int(dim) for dim in tensor.dims)
    return result


def _value_dtypes(model: onnx.ModelProto) -> dict[str, str]:
    result: dict[str, str] = {}
    for value in (*model.graph.input, *model.graph.value_info, *model.graph.output):
        result[value.name] = _onnx_dtype_name(int(value.type.tensor_type.elem_type))
    for tensor in model.graph.initializer:
        result[tensor.name] = _onnx_dtype_name(int(tensor.data_type))
    return result


class ConstantEvaluator:
    """Small, bounded evaluator for ONNX shape and parameter expressions."""

    def __init__(
        self,
        model: onnx.ModelProto,
        producers: Mapping[str, onnx.NodeProto],
        shapes: Mapping[str, tuple[int | str | None, ...]],
    ) -> None:
        self._values: dict[str, np.ndarray] = {
            tensor.name: np.array(numpy_helper.to_array(tensor), copy=True, order="C")
            for tensor in model.graph.initializer
        }
        self._producers = producers
        self._shapes = shapes
        self._active: set[str] = set()

    @property
    def values(self) -> dict[str, np.ndarray]:
        return self._values

    def get(self, name: str) -> np.ndarray | None:
        if not name:
            return None
        if name in self._values:
            return self._values[name]
        node = self._producers.get(name)
        if node is None or name in self._active:
            return None
        self._active.add(name)
        try:
            outputs = self._evaluate_node(node)
            if outputs is not None:
                for output_name, value in zip(node.output, outputs, strict=True):
                    self._values[output_name] = np.array(value, copy=True, order="C")
        finally:
            self._active.remove(name)
        return self._values.get(name)

    def require(self, name: str, context: str) -> np.ndarray:
        value = self.get(name)
        if value is None:
            raise ExtractionError(f"{context}: {name!r} is not an offline constant")
        return value

    def _inputs(self, node: onnx.NodeProto) -> list[np.ndarray] | None:
        values = [self.get(name) for name in node.input if name]
        return None if any(value is None for value in values) else values  # type: ignore[return-value]

    def _evaluate_node(self, node: onnx.NodeProto) -> list[np.ndarray] | None:
        if node.op_type == "Constant":
            value = _attribute(node, "value")
            if isinstance(value, onnx.TensorProto):
                return [numpy_helper.to_array(value)]
            for name in ("value_float", "value_int", "value_floats", "value_ints"):
                value = _attribute(node, name)
                if value is not None:
                    return [np.asarray(value)]
            return None
        if node.op_type == "Shape":
            shape = self._shapes.get(node.input[0])
            if shape is None or any(
                not isinstance(dim, int) or dim <= 0 for dim in shape
            ):
                return None
            start = int(_attribute(node, "start", 0))
            end = int(_attribute(node, "end", len(shape)))
            return [np.asarray(shape[start:end], dtype=np.int64)]

        if node.op_type not in {
            "Identity",
            "Cast",
            "Gather",
            "Unsqueeze",
            "Squeeze",
            "Concat",
            "Reshape",
            "Transpose",
            "Slice",
            "Add",
            "Sub",
            "Mul",
            "Div",
            "Exp",
            "Neg",
        }:
            return None

        values = self._inputs(node)
        if values is None:
            return None
        try:
            if node.op_type == "Identity":
                return [values[0]]
            if node.op_type == "Cast":
                target = int(_attribute(node, "to"))
                dtype = {
                    TensorProto.FLOAT: np.float32,
                    TensorProto.FLOAT16: np.float16,
                    TensorProto.INT64: np.int64,
                    TensorProto.INT32: np.int32,
                    TensorProto.BOOL: np.bool_,
                }.get(target)
                return None if dtype is None else [values[0].astype(dtype)]
            if node.op_type == "Gather":
                axis = int(_attribute(node, "axis", 0))
                return [np.take(values[0], values[1], axis=axis)]
            if node.op_type == "Unsqueeze":
                axes = (
                    values[1].astype(np.int64).reshape(-1)
                    if len(values) > 1
                    else _attribute(node, "axes")
                )
                result = values[0]
                for axis in sorted(int(value) for value in axes):
                    result = np.expand_dims(result, axis)
                return [result]
            if node.op_type == "Squeeze":
                axes = (
                    values[1].astype(np.int64).reshape(-1)
                    if len(values) > 1
                    else _attribute(node, "axes")
                )
                return [np.squeeze(values[0], axis=tuple(int(value) for value in axes))]
            if node.op_type == "Concat":
                return [np.concatenate(values, axis=int(_attribute(node, "axis", 0)))]
            if node.op_type == "Reshape":
                return [
                    np.reshape(
                        values[0], tuple(int(value) for value in values[1].reshape(-1))
                    )
                ]
            if node.op_type == "Transpose":
                permutation = _attribute(
                    node, "perm", tuple(reversed(range(values[0].ndim)))
                )
                return [
                    np.transpose(values[0], tuple(int(value) for value in permutation))
                ]
            if node.op_type == "Slice":
                starts = values[1].astype(np.int64).reshape(-1)
                ends = values[2].astype(np.int64).reshape(-1)
                axes = (
                    values[3].astype(np.int64).reshape(-1)
                    if len(values) >= 4
                    else np.arange(len(starts), dtype=np.int64)
                )
                steps = (
                    values[4].astype(np.int64).reshape(-1)
                    if len(values) >= 5
                    else np.ones(len(starts), dtype=np.int64)
                )
                slices: list[slice] = [slice(None)] * values[0].ndim
                for start, end, axis, step in zip(
                    starts, ends, axes, steps, strict=True
                ):
                    slices[int(axis)] = slice(int(start), int(end), int(step))
                return [values[0][tuple(slices)]]
            if node.op_type in {"Add", "Sub", "Mul", "Div"}:
                operation = {
                    "Add": np.add,
                    "Sub": np.subtract,
                    "Mul": np.multiply,
                    "Div": np.divide,
                }[node.op_type]
                return [operation(values[0], values[1])]
            if node.op_type == "Exp":
                return [np.exp(values[0])]
            if node.op_type == "Neg":
                return [-values[0]]
        except (IndexError, TypeError, ValueError):
            return None
        return None


class Extractor:
    def __init__(
        self,
        model: onnx.ModelProto,
        scans: tuple[ScanProfile, ...],
        digest: str,
        variant_model: str,
    ) -> None:
        self.model = model
        self.scans = scans
        self.digest = digest
        self.variant_model = variant_model
        self.nodes = list(model.graph.node)
        self.producers = {
            output: node for node in self.nodes for output in node.output if output
        }
        self.consumers: dict[str, list[onnx.NodeProto]] = {}
        for node in self.nodes:
            for input_name in node.input:
                if input_name:
                    self.consumers.setdefault(input_name, []).append(node)
        self.shapes = _value_shapes(model)
        self.dtypes = _value_dtypes(model)
        self.constants = ConstantEvaluator(model, self.producers, self.shapes)
        self.tensor_records: dict[str, TensorRecord] = {}
        self.constant_records: dict[str, ConstantRecord] = {}
        self.views: list[ViewRecord] = []
        self.dispatches: list[DispatchRecord] = []
        self.blocked: set[int] = set()
        self.synthetic_shapes: dict[str, tuple[int, ...]] = {}
        self.synthetic_dtypes: dict[str, str] = {}

    def _node_id(self, node: onnx.NodeProto) -> int:
        return id(node)

    def _static_shape(self, name: str, context: str) -> tuple[int, ...]:
        if name in self.synthetic_shapes:
            return self.synthetic_shapes[name]
        shape = self.shapes.get(name)
        if name == "depth":
            return (1, 1, 448, 448)
        if shape is None or any(not isinstance(dim, int) or dim <= 0 for dim in shape):
            raise ExtractionError(
                f"{context}: unresolved runtime shape for {name!r}: {shape}"
            )
        return tuple(int(dim) for dim in shape)

    def _dtype(self, name: str) -> str:
        if name in self.synthetic_dtypes:
            return self.synthetic_dtypes[name]
        try:
            return self.dtypes[name]
        except KeyError as error:
            value = self.constants.get(name)
            if value is None:
                raise ExtractionError(f"missing dtype for tensor {name!r}") from error
            return _dtype_name(value.dtype)

    def _layout(self, shape: tuple[int, ...], *, constant: bool = False) -> str:
        if constant:
            return "raw"
        if len(shape) == 4:
            return "nchw"
        if len(shape) == 3:
            return "nlc"
        return "raw"

    def _register_tensor(self, name: str, kind: str = "activation") -> None:
        if not name or name in self.tensor_records:
            return
        shape = self._static_shape(name, "tensor registration")
        constant = kind in {"constant", "weight"}
        self.tensor_records[name] = TensorRecord(
            id=name,
            shape=shape,
            dtype=self._dtype(name),
            layout=self._layout(shape, constant=constant),
            kind=kind,
            source_name=name if not name.startswith("__") else None,
        )

    def _register_constant(self, name: str, *, generated: bool = False) -> None:
        if name in self.constant_records:
            return
        value = self.constants.require(name, "constant registration")
        value = np.array(value, copy=True, order="C")
        if value.dtype.byteorder == ">":
            value = value.byteswap().view(value.dtype.newbyteorder("<"))
            self.constants.values[name] = value
        self.synthetic_shapes.setdefault(name, tuple(int(dim) for dim in value.shape))
        self.synthetic_dtypes.setdefault(name, _dtype_name(value.dtype))
        self._register_tensor(
            name, "weight" if value.dtype == np.float32 else "constant"
        )
        data = value.tobytes(order="C")
        self.constant_records[name] = ConstantRecord(
            id=name,
            shape=tuple(int(dim) for dim in value.shape),
            dtype=_dtype_name(value.dtype),
            byte_length=len(data),
            sha256=sha256(data).hexdigest(),
            generated=generated,
        )

    def _add_synthetic_constant(self, name: str, value: np.ndarray) -> None:
        self.constants.values[name] = np.ascontiguousarray(value, dtype=np.float32)
        self._register_constant(name, generated=True)

    def _dispatch(
        self,
        node_id: str,
        op: str,
        inputs: Iterable[str],
        outputs: Iterable[str],
        params: dict[str, Any],
        output_shapes: Iterable[tuple[int, ...]] | None = None,
    ) -> None:
        if op not in RUNTIME_OPS:
            raise ExtractionError(
                f"{node_id}: runtime op {op!r} is outside the frozen enum"
            )
        input_ids = tuple(value for value in inputs if value)
        output_ids = tuple(outputs)
        for input_id in input_ids:
            if self.constants.get(input_id) is not None:
                self._register_constant(input_id)
            else:
                self._register_tensor(input_id)
        if output_shapes is None:
            shapes = tuple(self._static_shape(value, node_id) for value in output_ids)
        else:
            shapes = tuple(output_shapes)
            for value, shape in zip(output_ids, shapes, strict=True):
                self.synthetic_shapes[value] = shape
                self.synthetic_dtypes.setdefault(value, "f32")
        for output_id in output_ids:
            self._register_tensor(output_id)
        self.dispatches.append(
            DispatchRecord(node_id, op, input_ids, output_ids, shapes, params)
        )

    def _ancestor_nodes_until(self, value: str, stops: set[str]) -> set[int]:
        result: set[int] = set()
        stack = [value]
        while stack:
            current = stack.pop()
            if current in stops or self.constants.get(current) is not None:
                continue
            producer = self.producers.get(current)
            if producer is None or self._node_id(producer) in result:
                continue
            result.add(self._node_id(producer))
            stack.extend(name for name in producer.input if name)
        return result

    def _find_scan_source(self, node: onnx.NodeProto) -> str:
        prefix = node.name.rsplit("op/", 1)[0] + "op/"
        candidates = [
            candidate
            for candidate in self.nodes
            if candidate.name.startswith(prefix) and candidate.op_type == "AveragePool"
        ]
        ancestors = self._ancestor_nodes_until(node.input[0], set())
        candidates = [
            candidate
            for candidate in candidates
            if self._node_id(candidate) in ancestors
        ]
        if len(candidates) == 1:
            return candidates[0].output[0]
        split_candidates = [
            candidate
            for candidate in self.nodes
            if candidate.name == f"{prefix}Split" and candidate.op_type == "Split"
        ]
        if len(split_candidates) == 1:
            return split_candidates[0].output[0]
        raise ExtractionError(
            f"{node.name}: cannot identify the low-frequency scan source"
        )

    def _find_scan_merge_input(self, node: onnx.NodeProto) -> tuple[str, set[int]]:
        visited: set[int] = set()
        queue = list(node.output)
        layer_norm: onnx.NodeProto | None = None
        while queue:
            value = queue.pop(0)
            for consumer in self.consumers.get(value, []):
                if consumer.op_type == "LayerNormalization":
                    layer_norm = consumer
                    queue.clear()
                    break
                node_id = self._node_id(consumer)
                if node_id not in visited:
                    visited.add(node_id)
                    queue.extend(output for output in consumer.output if output)
        if layer_norm is None:
            raise ExtractionError(
                f"{node.name}: merge path does not terminate in LayerNormalization"
            )
        # The first forward path can reach the final Add before its sibling branch;
        # walk backward from the exact LN input to capture the complete diamond.
        blocked = self._ancestor_nodes_until(layer_norm.input[0], set(node.output))
        return layer_norm.input[0], blocked

    def _prepare_scans(self) -> None:
        custom_nodes = [
            node
            for node in self.nodes
            if node.domain == "com.depthart" and node.op_type == "SelectiveScan"
        ]
        for index, (node, profile) in enumerate(
            zip(custom_nodes, self.scans, strict=True)
        ):
            source = self._find_scan_source(node)
            projection_ancestors = self._ancestor_nodes_until(node.input[0], {source})
            # Include the B/C and delta projection paths and constant A transform.
            for input_name in node.input[1:5]:
                projection_ancestors.update(
                    self._ancestor_nodes_until(input_name, {source})
                )
            merge_input, merge_nodes = self._find_scan_merge_input(node)
            self.blocked.update(projection_ancestors)
            self.blocked.update(merge_nodes)
            self.blocked.add(self._node_id(node))

            prefix = f"scan-{index}"
            delta = f"__{prefix}.delta"
            b = f"__{prefix}.B"
            c = f"__{prefix}.C"
            raw = f"__{prefix}.raw"
            x_proj = profile.x_proj_initializer
            dt_proj = profile.dt_proj_initializer
            a, d, delta_bias = node.input[2], node.input[5], node.input[6]
            for constant in (x_proj, dt_proj, a, d, delta_bias):
                self._register_constant(constant)
            for projection_id in (x_proj, dt_proj):
                record = self.tensor_records[projection_id]
                self.tensor_records[projection_id] = TensorRecord(
                    id=record.id,
                    shape=record.shape,
                    dtype=record.dtype,
                    layout="direction-o4i4",
                    kind=record.kind,
                    source_name=record.source_name,
                )

            self._dispatch(
                f"{prefix}/project",
                "scan-project",
                (source, x_proj, dt_proj),
                (delta, b, c),
                {
                    "directions": 4,
                    "stateSize": profile.state_size,
                    "dtRank": profile.dt_rank,
                    "lowChannels": profile.low_channels,
                    "sequence": {
                        "rowMajor": True,
                        "columnMajor": True,
                        "reverse": True,
                    },
                },
                (
                    profile.delta_shape,
                    profile.b_shape,
                    profile.c_shape,
                ),
            )
            self._dispatch(
                f"{prefix}/recurrence",
                "selective-scan",
                (source, delta, b, c, a, d, delta_bias),
                (raw,),
                {
                    "directions": 4,
                    "stateSize": profile.state_size,
                    "length": profile.length,
                    "deltaSoftplus": profile.delta_softplus,
                    "fp32Recurrence": True,
                },
                ((1, 4 * profile.low_channels, profile.length),),
            )
            self._dispatch(
                f"{prefix}/merge",
                "scan-merge",
                (raw,),
                (merge_input,),
                {
                    "directions": 4,
                    "transposeColumnMajor": True,
                    "reduction": "sum",
                    "normalization": "none",
                },
                ((1, profile.low_channels, 14, 14),),
            )

    def _constant_scalar(self, name: str) -> float | None:
        value = self.constants.get(name)
        if value is None or value.size != 1:
            return None
        return float(value.reshape(-1)[0])

    def _prepare_silu(self) -> None:
        for sigmoid in (node for node in self.nodes if node.op_type == "Sigmoid"):
            uses = self.consumers.get(sigmoid.output[0], [])
            if len(uses) != 1 or uses[0].op_type != "Mul":
                raise ExtractionError(
                    f"{sigmoid.name}: unsupported Sigmoid outside SiLU"
                )
            multiply = uses[0]
            source = sigmoid.input[0]
            if sorted(multiply.input) != sorted((source, sigmoid.output[0])):
                raise ExtractionError(f"{sigmoid.name}: malformed SiLU multiply")
            self.blocked.add(self._node_id(sigmoid))
            self.blocked.add(self._node_id(multiply))
            self._dispatch(
                multiply.name or f"silu-{len(self.dispatches)}",
                "activation",
                (source,),
                multiply.output,
                {"kind": "silu"},
            )

    def _prepare_gelu(self) -> None:
        for erf in (node for node in self.nodes if node.op_type == "Erf"):
            div = self.producers.get(erf.input[0])
            add_uses = self.consumers.get(erf.output[0], [])
            if (
                div is None
                or div.op_type != "Div"
                or len(add_uses) != 1
                or add_uses[0].op_type != "Add"
            ):
                raise ExtractionError(f"{erf.name}: unsupported Erf outside exact GELU")
            add = add_uses[0]
            first_mul_uses = self.consumers.get(add.output[0], [])
            if len(first_mul_uses) != 1 or first_mul_uses[0].op_type != "Mul":
                raise ExtractionError(f"{erf.name}: malformed GELU multiply")
            first_mul = first_mul_uses[0]
            final_uses = self.consumers.get(first_mul.output[0], [])
            if len(final_uses) != 1 or final_uses[0].op_type != "Mul":
                raise ExtractionError(f"{erf.name}: malformed final GELU multiply")
            final_mul = final_uses[0]
            source_candidates = [
                name for name in div.input if self._constant_scalar(name) is None
            ]
            sqrt_candidates = [self._constant_scalar(name) for name in div.input]
            source = source_candidates[0] if len(source_candidates) == 1 else ""
            constants = [value for value in sqrt_candidates if value is not None]
            add_constant = next(
                (
                    self._constant_scalar(name)
                    for name in add.input
                    if self._constant_scalar(name) is not None
                ),
                None,
            )
            final_constant = next(
                (
                    self._constant_scalar(name)
                    for name in final_mul.input
                    if self._constant_scalar(name) is not None
                ),
                None,
            )
            if (
                not source
                or source not in first_mul.input
                or len(constants) != 1
                or not np.isclose(constants[0], np.sqrt(2.0), rtol=1e-6)
                or add_constant is None
                or not np.isclose(add_constant, 1.0)
                or final_constant is None
                or not np.isclose(final_constant, 0.5)
            ):
                raise ExtractionError(
                    f"{erf.name}: GELU constants/topology do not match"
                )
            for pattern_node in (div, erf, add, first_mul, final_mul):
                self.blocked.add(self._node_id(pattern_node))
            self._dispatch(
                final_mul.name or f"gelu-{len(self.dispatches)}",
                "activation",
                (source,),
                final_mul.output,
                {"kind": "gelu"},
            )

    def _prepare_conv_bn(self) -> None:
        for conv in (node for node in self.nodes if node.op_type == "Conv"):
            uses = self.consumers.get(conv.output[0], [])
            if len(uses) != 1 or uses[0].op_type != "BatchNormalization":
                continue
            bn = uses[0]
            if len(conv.input) not in (2, 3) or len(bn.input) != 5:
                raise ExtractionError(f"{conv.name}: unexpected Conv/BN arity")
            weight = self.constants.require(conv.input[1], conv.name)
            bias = self.constants.get(conv.input[2]) if len(conv.input) == 3 else None
            epsilon = float(_attribute(bn, "epsilon", 1e-5))
            folded_weight, folded_bias = fold_batch_norm(
                weight,
                bias,
                *(self.constants.require(name, bn.name) for name in bn.input[1:5]),
                epsilon,
            )
            weight_id = f"__folded/{conv.name}/weight"
            bias_id = f"__folded/{conv.name}/bias"
            self._add_synthetic_constant(weight_id, folded_weight)
            self._add_synthetic_constant(bias_id, folded_bias)
            self.blocked.add(self._node_id(conv))
            self.blocked.add(self._node_id(bn))
            self._emit_conv(
                conv, output_id=bn.output[0], weight_id=weight_id, bias_id=bias_id
            )

    def _emit_conv(
        self,
        node: onnx.NodeProto,
        *,
        output_id: str | None = None,
        weight_id: str | None = None,
        bias_id: str | None = None,
    ) -> None:
        weight_id = weight_id or node.input[1]
        if bias_id is None and len(node.input) == 3:
            bias_id = node.input[2]
        weight_shape = self._static_shape(weight_id, node.name)
        if bias_id is None:
            # The runtime conv ABI always binds a C4 bias. DPT's biasless
            # projections share an explicit all-zero vector by output width.
            bias_id = f"__shared/zero-bias-c{weight_shape[0]}"
            if bias_id not in self.constant_records:
                self._add_synthetic_constant(
                    bias_id, np.zeros(weight_shape[0], dtype=np.float32)
                )
        self._register_constant(weight_id)
        self._register_constant(bias_id)
        groups = int(_attribute(node, "group", 1))
        depthwise = groups == weight_shape[0] and weight_shape[1] == 1
        pads = tuple(int(value) for value in _attribute(node, "pads", (0, 0, 0, 0)))
        strides = tuple(int(value) for value in _attribute(node, "strides", (1, 1)))
        dilations = tuple(int(value) for value in _attribute(node, "dilations", (1, 1)))
        if dilations != (1, 1):
            raise ExtractionError(f"{node.name}: dilation {dilations} is unsupported")
        op = "depthwise-conv2d" if depthwise else "conv2d"
        self._dispatch(
            node.name,
            op,
            (node.input[0], weight_id, bias_id),
            (output_id or node.output[0],),
            {
                "kernel": list(weight_shape[-2:]),
                "stride": list(strides),
                "padding": list(pads),
                "groups": groups,
                "activation": "none",
                "weightPacking": "c4-yx" if depthwise else "o4i4-yx",
                "biasPacking": "c4",
            },
        )

    def _emit_batch_norm(self, node: onnx.NodeProto) -> None:
        epsilon = float(_attribute(node, "epsilon", 1e-5))
        scale, shift = batch_norm_affine(
            *(self.constants.require(name, node.name) for name in node.input[1:5]),
            epsilon,
        )
        scale_id = f"__affine/{node.name}/scale"
        shift_id = f"__affine/{node.name}/shift"
        intermediate_id = f"__affine/{node.name}/scaled"
        self._add_synthetic_constant(scale_id, scale)
        self._add_synthetic_constant(shift_id, shift)
        shape = self._static_shape(node.input[0], node.name)
        self._dispatch(
            f"{node.name}/mul",
            "binary",
            (node.input[0], scale_id),
            (intermediate_id,),
            {"kind": "mul", "broadcast": "channels"},
            (shape,),
        )
        self._dispatch(
            f"{node.name}/add",
            "binary",
            (intermediate_id, shift_id),
            node.output,
            {"kind": "add", "broadcast": "channels"},
        )

    def _view_params(self, node: onnx.NodeProto) -> dict[str, Any]:
        params: dict[str, Any] = {}
        for attribute in node.attribute:
            value = onnx.helper.get_attribute_value(attribute)
            if isinstance(value, bytes):
                value = value.decode("utf-8")
            if isinstance(value, np.ndarray):
                value = value.tolist()
            if isinstance(value, tuple):
                value = list(value)
            params[attribute.name] = value
        constant_inputs: dict[str, Any] = {}
        for index, name in enumerate(node.input[1:], start=1):
            value = self.constants.get(name)
            if value is not None and value.size <= 64:
                constant_inputs[str(index)] = value.tolist()
        if constant_inputs:
            params["constantInputs"] = constant_inputs
        return params

    def _emit_view(self, node: onnx.NodeProto) -> None:
        if all(self.constants.get(output) is not None for output in node.output):
            return
        inputs = tuple(
            name for name in node.input if name and self.constants.get(name) is None
        )
        if not inputs:
            raise ExtractionError(f"{node.name}: dynamic view has no dynamic input")
        input_shapes = tuple(self._static_shape(name, node.name) for name in inputs)
        output_shapes = tuple(
            self._static_shape(name, node.name) for name in node.output
        )
        for name in inputs:
            self._register_tensor(name)
        for name in node.output:
            self._register_tensor(name)
        self.views.append(
            ViewRecord(
                id=node.name or f"view-{len(self.views)}",
                kind={
                    "Concat": "virtual-concat",
                    "Split": "virtual-split",
                    "Slice": "strided-view",
                    "Gather": "indexed-view",
                    "Reshape": "reshape-view",
                    "Transpose": "transpose-view",
                    "Unsqueeze": "reshape-view",
                    "Squeeze": "reshape-view",
                    "Cast": "reinterpret-or-convert",
                }[node.op_type],
                inputs=inputs,
                outputs=tuple(node.output),
                input_shapes=input_shapes,
                output_shapes=output_shapes,
                params=self._view_params(node),
            )
        )

    def _broadcast(self, left: str, right: str) -> str:
        left_shape = self._static_shape(left, "binary broadcast")
        right_shape = self._static_shape(right, "binary broadcast")
        if left_shape == right_shape:
            return "none"
        smaller = right_shape if len(right_shape) <= len(left_shape) else left_shape
        if int(np.prod(smaller, dtype=np.int64)) == 1:
            return "scalar"
        non_unit = [value for value in smaller if value != 1]
        if len(non_unit) == 1:
            return "channels"
        return "spatial"

    def _emit_resize(self, node: onnx.NodeProto) -> None:
        output_shape = self._static_shape(node.output[0], node.name)
        mode = _attribute(node, "mode", b"nearest")
        coordinate = _attribute(node, "coordinate_transformation_mode", b"half_pixel")
        nearest = _attribute(node, "nearest_mode", b"round_prefer_floor")
        mode = mode.decode() if isinstance(mode, bytes) else mode
        coordinate = (
            coordinate.decode() if isinstance(coordinate, bytes) else coordinate
        )
        nearest = nearest.decode() if isinstance(nearest, bytes) else nearest
        if mode == "linear":
            mode = "bilinear"
        if mode == "nearest" and coordinate == "asymmetric" and nearest == "floor":
            coordinate_mode = "asymmetric-floor"
        elif coordinate == "half_pixel":
            coordinate_mode = "half-pixel"
        elif coordinate == "align_corners":
            coordinate_mode = "align-corners"
        else:
            raise ExtractionError(
                f"{node.name}: unsupported resize coordinate modes {coordinate}/{nearest}"
            )
        self._dispatch(
            node.name,
            "resize2d",
            (node.input[0],),
            node.output,
            {
                "mode": mode,
                "coordinateMode": coordinate_mode,
                "size": list(output_shape[-2:]),
            },
        )

    def _emit_node(self, node: onnx.NodeProto) -> None:
        if node.output and all(
            self.constants.get(output) is not None for output in node.output
        ):
            for output in node.output:
                self._register_constant(output)
            return
        if node.op_type == "Conv":
            self._emit_conv(node)
        elif node.op_type == "BatchNormalization":
            self._emit_batch_norm(node)
        elif node.op_type == "Relu":
            self._dispatch(
                node.name, "activation", node.input, node.output, {"kind": "relu"}
            )
        elif node.op_type in {"Add", "Sub", "Mul"}:
            self._dispatch(
                node.name,
                "binary",
                node.input,
                node.output,
                {
                    "kind": node.op_type.lower(),
                    "broadcast": self._broadcast(*node.input),
                },
            )
        elif node.op_type == "AveragePool":
            pads = [int(value) for value in _attribute(node, "pads", (0, 0, 0, 0))]
            self._dispatch(
                node.name,
                "avg-pool2d",
                node.input,
                node.output,
                {
                    "kernel": [
                        int(value) for value in _attribute(node, "kernel_shape")
                    ],
                    "stride": [int(value) for value in _attribute(node, "strides")],
                    "padding": pads,
                    "countIncludePad": bool(_attribute(node, "count_include_pad", 0)),
                },
            )
        elif node.op_type == "Resize":
            self._emit_resize(node)
        elif node.op_type == "LayerNormalization":
            input_shape = self._static_shape(node.input[0], node.name)
            self._dispatch(
                node.name,
                "layer-norm",
                node.input,
                node.output,
                {
                    # ONNX normalizes the last axis of its temporary NLC view;
                    # runtime HWC4 tensors retain logical NCHW shape, so channel is 1.
                    "axis": 1
                    if len(input_shape) == 4
                    else int(_attribute(node, "axis", -1)),
                    "epsilon": float(_attribute(node, "epsilon", 1e-5)),
                },
                (input_shape,),
            )
        elif node.op_type in {
            "Cast",
            "Concat",
            "Gather",
            "Reshape",
            "Slice",
            "Split",
            "Transpose",
            "Unsqueeze",
            "Squeeze",
        }:
            self._emit_view(node)
        elif node.op_type in {"Constant", "Shape"}:
            for output in node.output:
                value = self.constants.get(output)
                if value is None:
                    raise ExtractionError(
                        f"{node.name}: shape/constant did not resolve offline"
                    )
        elif node.op_type in {"Div", "Erf", "Sigmoid", "Exp", "Neg", "Einsum"}:
            raise ExtractionError(
                f"{node.name}: unmatched compute motif {node.op_type}"
            )
        else:
            raise ExtractionError(
                f"{node.name}: unsupported ONNX operation {node.op_type}"
            )

    def run(self) -> NormalizedGraph:
        self._register_tensor("image", "input")
        # Motif preparation emits replacement dispatches and marks raw nodes.
        self._prepare_scans()
        self._prepare_silu()
        self._prepare_gelu()
        self._prepare_conv_bn()
        for node in self.nodes:
            if self._node_id(node) not in self.blocked:
                self._emit_node(node)
        self._register_tensor("depth", "output")

        # Preparation is motif-oriented; sort all dispatches back into source order
        # using name locality is unsafe, so preserve explicit dependency order with a
        # stable topological pass.
        self.dispatches = _topologically_order(self.dispatches, self.views)
        return NormalizedGraph(
            model=self.variant_model,
            source_sha256=self.digest,
            input_id="image",
            output_id="depth",
            tensors=self.tensor_records,
            constants=self.constant_records,
            views=self.views,
            dispatches=self.dispatches,
            scans=self.scans,
            constant_values={
                name: self.constants.values[name] for name in self.constant_records
            },
        )


def _topologically_order(
    dispatches: list[DispatchRecord], views: list[ViewRecord]
) -> list[DispatchRecord]:
    producers = {
        output: index
        for index, item in enumerate(dispatches)
        for output in item.outputs
    }
    view_sources = {output: view.inputs for view in views for output in view.outputs}

    def dependencies(tensor_id: str, active: frozenset[str] = frozenset()) -> set[int]:
        producer = producers.get(tensor_id)
        if producer is not None:
            return {producer}
        if tensor_id in active:
            raise ExtractionError(f"virtual view cycle at {tensor_id!r}")
        sources = view_sources.get(tensor_id, ())
        result: set[int] = set()
        for source in sources:
            result.update(dependencies(source, active | {tensor_id}))
        return result

    required = [
        set().union(*(dependencies(input_id) for input_id in item.inputs))
        for item in dispatches
    ]
    remaining = set(range(len(dispatches)))
    emitted: set[int] = set()
    result: list[DispatchRecord] = []
    while remaining:
        ready = [
            index for index in sorted(remaining) if required[index].issubset(emitted)
        ]
        if not ready:
            cycle = [dispatches[index].id for index in sorted(remaining)[:8]]
            raise ExtractionError(
                f"normalized dispatch graph contains a cycle: {cycle}"
            )
        for index in ready:
            result.append(dispatches[index])
            emitted.add(index)
            remaining.remove(index)
    return result


def extract_graph(
    path: str | Path,
    *,
    require_official: bool = True,
    check_finite: bool = True,
) -> NormalizedGraph:
    """Validate and normalize one of the supported fixed DepthART 448 graphs."""

    profile = inspect_onnx(
        path, require_official=require_official, check_finite=check_finite
    )
    model = onnx.load_model(path, load_external_data=False)
    try:
        inferred = shape_inference.infer_shapes(model, strict_mode=True, data_prop=True)
    except onnx.shape_inference.InferenceError as error:
        raise ProfileError(f"ONNX shape inference failed: {error}") from error
    return Extractor(inferred, profile.scans, profile.sha256, profile.model).run()
