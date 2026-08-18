"""Strict official bundle emission for the fixed DepthART 448 graphs."""

from __future__ import annotations

import math
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import numpy as np

from .bundle import BundleWriter, PayloadSection, align_up
from .graph import DispatchRecord, ExtractionError, NormalizedGraph, extract_graph
from .liveness import intervals_from_dispatches, plan_slots
from .lowering import prepare_runtime_graph
from .pack import (
    PackedTensor,
    PackingPrecision,
    pack_c4,
    pack_conv_o4i4,
    pack_depthwise_c4yx,
    pack_direction_o4i4,
)
from .profile import OfficialVariant, variant_for_model

WEIGHT_TENSOR_ALIGNMENT = 16
WEIGHT_SECTION_TARGET_BYTES = 64 * 1024 * 1024
KERNEL_WORKGROUP_SIZE = 64
F32_REFERENCE_PROFILE = "f32-reference"
BALANCED_FP16_PROFILE = "balanced-fp16"
FP32_DOWNSAMPLERS = frozenset(
    {
        "/pretrained/network.1/proj/c/Conv",
        "/pretrained/network.3/proj/c/Conv",
        "/pretrained/network.5/proj/c/Conv",
    }
)
EXPORT_PROFILES = (
    F32_REFERENCE_PROFILE,
    BALANCED_FP16_PROFILE,
)

RoleKind = Literal["o4i4-yx", "c4-yx", "c4", "direction-o4i4", "raw"]
DynamicPrecision = Literal["f32", "f16-native"]


@dataclass(frozen=True)
class ConstantRole:
    kind: RoleKind
    logical_shape: tuple[int, ...]


@dataclass(frozen=True)
class PackedConstant:
    source_id: str
    manifest_id: str
    data: bytes
    logical_shape: tuple[int, ...]
    storage_shape: tuple[int, ...]
    dtype: str
    encoding: str
    layout: str


@dataclass(frozen=True)
class OfficialBundlePlan:
    manifest: dict[str, Any]
    sections: tuple[PayloadSection, ...]


def _head_conv_is_half(dispatch_id: str) -> bool:
    return (
        "/resConfUnit" in dispatch_id
        or dispatch_id == "/depth_head/output_conv1/Conv"
        or dispatch_id.startswith("/depth_head/output_conv2/")
    )


def _shape(graph: NormalizedGraph, tensor_id: str) -> tuple[int, ...]:
    try:
        return graph.tensors[tensor_id].shape
    except KeyError as error:
        raise ExtractionError(f"missing tensor metadata for {tensor_id!r}") from error


def _role(
    roles: dict[str, ConstantRole],
    tensor_id: str,
    kind: RoleKind,
    logical_shape: tuple[int, ...],
    context: str,
) -> None:
    if tensor_id not in roles:
        roles[tensor_id] = ConstantRole(kind, logical_shape)
        return
    expected = ConstantRole(kind, logical_shape)
    if roles[tensor_id] != expected:
        raise ExtractionError(
            f"{context}: constant {tensor_id!r} has incompatible roles "
            f"{roles[tensor_id]} and {expected}"
        )


def classify_constant_roles(graph: NormalizedGraph) -> dict[str, ConstantRole]:
    """Assign every live constant one exact runtime packing and logical shape."""

    roles: dict[str, ConstantRole] = {}
    for dispatch in graph.dispatches:
        if dispatch.op == "conv2d":
            output_channels = _shape(graph, dispatch.outputs[0])[1]
            input_channels = _shape(graph, dispatch.inputs[0])[1]
            kernel_y, kernel_x = dispatch.params["kernel"]
            _role(
                roles,
                dispatch.inputs[1],
                "o4i4-yx",
                (output_channels, input_channels, kernel_y, kernel_x),
                dispatch.id,
            )
            _role(
                roles,
                dispatch.inputs[2],
                "c4",
                (output_channels,),
                dispatch.id,
            )
        elif dispatch.op == "depthwise-conv2d":
            channels = _shape(graph, dispatch.inputs[0])[1]
            kernel_y, kernel_x = dispatch.params["kernel"]
            _role(
                roles,
                dispatch.inputs[1],
                "c4-yx",
                (channels, 1, kernel_y, kernel_x),
                dispatch.id,
            )
            _role(roles, dispatch.inputs[2], "c4", (channels,), dispatch.id)
        elif dispatch.op == "binary" and dispatch.inputs[1] in graph.constants:
            channels = _shape(graph, dispatch.inputs[0])[1]
            expected = {
                "scalar": 1,
                "channels": channels,
            }.get(dispatch.params["broadcast"])
            if expected is None:
                raise ExtractionError(
                    f"{dispatch.id}: section-backed binary RHS has unsupported "
                    f"broadcast {dispatch.params['broadcast']!r}"
                )
            _role(roles, dispatch.inputs[1], "c4", (expected,), dispatch.id)
        elif dispatch.op in {"channel-affine", "layer-norm"}:
            channels = _shape(graph, dispatch.inputs[0])[1]
            _role(roles, dispatch.inputs[1], "c4", (channels,), dispatch.id)
            _role(roles, dispatch.inputs[2], "c4", (channels,), dispatch.id)
        elif dispatch.op == "scan-project":
            channels = dispatch.params["lowChannels"]
            rank = dispatch.params["dtRank"]
            _role(
                roles,
                dispatch.inputs[1],
                "direction-o4i4",
                (4, rank + 16, channels),
                dispatch.id,
            )
            _role(
                roles,
                dispatch.inputs[2],
                "direction-o4i4",
                (4, channels, rank),
                dispatch.id,
            )
        elif dispatch.op == "selective-scan":
            for tensor_id in dispatch.inputs[4:]:
                _role(roles, tensor_id, "raw", _shape(graph, tensor_id), dispatch.id)

    missing = set(graph.constants) - set(roles)
    unknown = set(roles) - set(graph.constants)
    if missing or unknown:
        raise ExtractionError(
            f"constant role coverage mismatch: missing={sorted(missing)}, "
            f"unknown={sorted(unknown)}"
        )
    return roles


def _packed_constant(
    graph: NormalizedGraph,
    source_id: str,
    manifest_id: str,
    role: ConstantRole,
    precision: PackingPrecision,
) -> PackedConstant:
    values = np.asarray(graph.constant_values[source_id])
    if values.dtype != np.float32 or not np.all(np.isfinite(values)):
        raise ExtractionError(f"constant {source_id!r} is not finite FP32")
    if values.size != math.prod(role.logical_shape):
        raise ExtractionError(
            f"constant {source_id!r} has {values.size} values, expected "
            f"{math.prod(role.logical_shape)} for {role.kind}"
        )

    packed: PackedTensor | None = None
    reshaped = np.ascontiguousarray(
        values.reshape(role.logical_shape), dtype=np.float32
    )
    if role.kind == "o4i4-yx":
        packed = pack_conv_o4i4(reshaped, precision=precision)
    elif role.kind == "c4-yx":
        packed = pack_depthwise_c4yx(reshaped, precision=precision)
    elif role.kind == "c4":
        packed = pack_c4(reshaped.reshape(-1), precision=precision)
    elif role.kind == "direction-o4i4":
        packed = pack_direction_o4i4(reshaped, precision=precision)

    if packed is not None:
        if packed.logical_shape != role.logical_shape:
            raise ExtractionError(
                f"constant {source_id!r} packing changed logical shape from "
                f"{role.logical_shape} to {packed.logical_shape}"
            )
        return PackedConstant(
            source_id,
            manifest_id,
            packed.data,
            packed.logical_shape,
            packed.storage_shape,
            packed.dtype,
            packed.encoding,
            packed.layout,
        )

    if precision != "f32":
        raise ExtractionError(
            f"constant {source_id!r} with raw packing cannot use {precision}"
        )
    data = np.asarray(reshaped, dtype="<f4").tobytes(order="C")
    return PackedConstant(
        source_id,
        manifest_id,
        data,
        role.logical_shape,
        role.logical_shape,
        "f32",
        "plain",
        "raw",
    )


def _constant_precisions(
    graph: NormalizedGraph, profile: str
) -> dict[str, PackingPrecision]:
    """Select the exact per-constant storage precision for an export profile."""

    if profile not in EXPORT_PROFILES:
        raise ExtractionError(
            f"unsupported export profile {profile!r}; expected one of {EXPORT_PROFILES}"
        )
    result: dict[str, PackingPrecision] = {
        tensor_id: "f32" for tensor_id in graph.constants
    }
    if profile == F32_REFERENCE_PROFILE:
        return result

    decisions: dict[str, PackingPrecision] = {}
    retained_fast_downsamplers: set[str] = set()
    for dispatch in graph.dispatches:
        if dispatch.op not in {"conv2d", "depthwise-conv2d"}:
            continue
        if dispatch.id in FP32_DOWNSAMPLERS:
            if (
                dispatch.op != "conv2d"
                or dispatch.params.get("kernel") != [3, 3]
                or dispatch.params.get("stride") != [2, 2]
                or not dispatch.id.startswith("/pretrained/")
            ):
                raise ExtractionError(
                    f"{dispatch.id}: balanced downsampler contract changed"
                )
            requested = "f32"
            retained_fast_downsamplers.add(dispatch.id)
        elif dispatch.id.startswith("/depth_head/"):
            requested = "f16" if _head_conv_is_half(dispatch.id) else "f32"
        elif (dispatch.op == "conv2d" and dispatch.id.startswith("/pretrained/")) or (
            dispatch.op == "depthwise-conv2d"
            and dispatch.id.startswith("generated/reparam/")
        ):
            requested = "f16"
        else:
            raise ExtractionError(
                f"{dispatch.id}: cannot classify convolution as encoder or DPT head"
            )
        weight_id = dispatch.inputs[1]
        if weight_id not in result:
            raise ExtractionError(
                f"{dispatch.id}: convolution weight {weight_id!r} is not constant"
            )
        previous = decisions.get(weight_id)
        if previous is not None and previous != requested:
            raise ExtractionError(
                f"{dispatch.id}: weight {weight_id!r} is shared across precision stages"
            )
        decisions[weight_id] = requested

    if retained_fast_downsamplers != FP32_DOWNSAMPLERS:
        raise ExtractionError(
            f"{profile} downsampler inventory changed: "
            f"found={sorted(retained_fast_downsamplers)}"
        )

    selected = {
        tensor_id for tensor_id, precision in decisions.items() if precision == "f16"
    }
    if not selected:
        raise ExtractionError(f"{profile} selected no half-precision weights")
    for tensor_id in selected:
        result[tensor_id] = "f16-native"
    return result


def _constant_groups(graph: NormalizedGraph) -> tuple[tuple[str, ...], ...]:
    pair_by_member: dict[str, tuple[str, str]] = {}
    for dispatch in graph.dispatches:
        if dispatch.op != "scan-project":
            continue
        pair = (dispatch.inputs[1], dispatch.inputs[2])
        for tensor_id in pair:
            if tensor_id in pair_by_member:
                raise ExtractionError(
                    f"scan projection constant {tensor_id!r} belongs to multiple pairs"
                )
            pair_by_member[tensor_id] = pair

    consumed: set[str] = set()
    groups: list[tuple[str, ...]] = []
    for tensor_id in sorted(graph.constants):
        if tensor_id in consumed:
            continue
        group = pair_by_member.get(tensor_id, (tensor_id,))
        if any(member in consumed for member in group):
            raise ExtractionError(f"overlapping constant group {group}")
        consumed.update(group)
        groups.append(group)
    if consumed != set(graph.constants):
        raise ExtractionError("constant groups do not cover every live weight")
    return tuple(groups)


def _packed_sections(
    graph: NormalizedGraph,
    roles: dict[str, ConstantRole],
    tensor_ids: dict[str, str],
    precisions: dict[str, PackingPrecision],
) -> tuple[tuple[PayloadSection, ...], dict[str, dict[str, Any]]]:
    sections: list[PayloadSection] = []
    tensor_records: dict[str, dict[str, Any]] = {}
    current = bytearray()
    section_index = 0

    def section_id() -> str:
        return f"weights-{section_index:03d}"

    def finish_section() -> None:
        nonlocal current, section_index
        if not current:
            return
        sections.append(PayloadSection(section_id(), bytes(current)))
        current = bytearray()
        section_index += 1

    for group in _constant_groups(graph):
        packed_group = [
            _packed_constant(
                graph,
                source_id,
                tensor_ids[source_id],
                roles[source_id],
                precisions[source_id],
            )
            for source_id in group
        ]
        trial_end = len(current)
        for packed in packed_group:
            trial_end = align_up(trial_end, WEIGHT_TENSOR_ALIGNMENT) + len(packed.data)
        if current and trial_end > WEIGHT_SECTION_TARGET_BYTES:
            finish_section()
            trial_end = 0
            for packed in packed_group:
                trial_end = align_up(trial_end, WEIGHT_TENSOR_ALIGNMENT) + len(
                    packed.data
                )
        if trial_end > WEIGHT_SECTION_TARGET_BYTES:
            raise ExtractionError(
                f"atomic constant group {group} needs {trial_end} bytes, exceeding the "
                f"{WEIGHT_SECTION_TARGET_BYTES}-byte section target"
            )

        for packed in packed_group:
            offset = align_up(len(current), WEIGHT_TENSOR_ALIGNMENT)
            current.extend(bytes(offset - len(current)))
            current.extend(packed.data)
            tensor_records[packed.source_id] = {
                "id": packed.manifest_id,
                "shape": list(packed.logical_shape),
                "storageShape": list(packed.storage_shape),
                "dtype": packed.dtype,
                "encoding": packed.encoding,
                "layout": packed.layout,
                "byteLength": len(packed.data),
                "storage": {
                    "kind": "section",
                    "sectionId": section_id(),
                    "byteOffset": offset,
                },
            }
    finish_section()
    if not sections:
        raise ExtractionError("official graph produced no weight sections")

    for dispatch in graph.dispatches:
        if dispatch.op != "scan-project":
            continue
        left = tensor_records[dispatch.inputs[1]]["storage"]["sectionId"]
        right = tensor_records[dispatch.inputs[2]]["storage"]["sectionId"]
        if left != right:
            raise ExtractionError(f"{dispatch.id}: projection pair crosses sections")
    return tuple(sections), tensor_records


def _raw_dynamic_tensors(graph: NormalizedGraph) -> set[str]:
    result: set[str] = set()
    for dispatch in graph.dispatches:
        if dispatch.op in {"scan-project", "selective-scan"}:
            result.update(dispatch.outputs)
    return result


def _dynamic_precisions(
    graph: NormalizedGraph,
    profile: str,
    raw_tensors: set[str],
) -> dict[str, DynamicPrecision]:
    """Select conservative native-half activation islands.

    Convolutions are explicit conversion boundaries: their kernels can load one
    activation dtype and store another. Elementwise/pool dispatches cannot hide an
    implicit conversion, so their dynamic inputs and outputs are unioned into one
    storage-dtype component. Numerically sensitive scan/LN paths, materialized
    channel copies, resize, the DPT head, and public I/O protect an entire component
    as FP32. This leaves only encoder-local HWC4 intermediates eligible for native
    half storage; raw scan tensors always remain FP32.
    """

    dynamic = set(graph.tensors) - set(graph.constants)
    result: dict[str, DynamicPrecision] = {tensor_id: "f32" for tensor_id in dynamic}
    if profile != BALANCED_FP16_PROFILE:
        return result

    hwc4 = dynamic - raw_tensors
    parent = {tensor_id: tensor_id for tensor_id in hwc4}

    def find(tensor_id: str) -> str:
        root = tensor_id
        while parent[root] != root:
            root = parent[root]
        while parent[tensor_id] != tensor_id:
            next_id = parent[tensor_id]
            parent[tensor_id] = root
            tensor_id = next_id
        return root

    def union(left: str, right: str) -> None:
        left_root = find(left)
        right_root = find(right)
        if left_root == right_root:
            return
        # Stable roots keep the selection deterministic across Python versions.
        low, high = sorted((left_root, right_root))
        parent[high] = low

    protected = {graph.input_id, graph.output_id}
    protected_ops = {
        "resize2d",
        "layer-norm",
        "scan-project",
        "selective-scan",
        "scan-merge",
        "channel-split",
        "channel-concat",
        "channel-affine",
    }
    homogeneous_ops = {"activation", "binary", "avg-pool2d"}
    conversion_ops = {"conv2d", "depthwise-conv2d"}
    for dispatch in graph.dispatches:
        activation_ids = [
            tensor_id
            for tensor_id in (*dispatch.inputs, *dispatch.outputs)
            if tensor_id in hwc4
        ]
        head_f32_conversion = (
            dispatch.id.startswith("/depth_head/")
            and dispatch.op in conversion_ops
            and not _head_conv_is_half(dispatch.id)
        )
        if (
            head_f32_conversion
            or dispatch.op in protected_ops
            or (dispatch.id in FP32_DOWNSAMPLERS)
        ):
            protected.update(activation_ids)
        elif dispatch.op in homogeneous_ops:
            for tensor_id in activation_ids[1:]:
                union(activation_ids[0], tensor_id)
        elif dispatch.op not in conversion_ops:
            raise ExtractionError(
                f"{dispatch.id}: no native-f16 activation policy for {dispatch.op!r}"
            )

    protected_roots = {find(tensor_id) for tensor_id in protected if tensor_id in hwc4}
    selected = {
        tensor_id for tensor_id in hwc4 if find(tensor_id) not in protected_roots
    }
    if not selected:
        raise ExtractionError("balanced-fp16 selected no activation tensors")
    for tensor_id in selected:
        result[tensor_id] = "f16-native"
    return result


def _dynamic_tensor_metadata(
    graph: NormalizedGraph,
    source_id: str,
    manifest_id: str,
    raw_tensors: set[str],
    precision: DynamicPrecision,
) -> dict[str, Any]:
    record = graph.tensors[source_id]
    if record.dtype != "f32":
        raise ExtractionError(f"activation {source_id!r} is not FP32")
    shape = record.shape
    if source_id in raw_tensors:
        storage_shape = shape
        layout = "raw"
    else:
        if len(shape) != 4 or shape[0] != 1:
            raise ExtractionError(
                f"activation {source_id!r} is not batch-one NCHW: {shape}"
            )
        _, channels, height, width = shape
        storage_shape = (1, height, width, (channels + 3) // 4, 4)
        layout = "hwc4"
    if source_id in raw_tensors and precision != "f32":
        raise ExtractionError(f"raw activation {source_id!r} cannot use {precision}")
    dtype = "f16" if precision == "f16-native" else "f32"
    return {
        "id": manifest_id,
        "shape": list(shape),
        "storageShape": list(storage_shape),
        "dtype": dtype,
        "encoding": "plain",
        "layout": layout,
        "byteLength": math.prod(storage_shape) * (2 if dtype == "f16" else 4),
    }


def _activation_units(shape: tuple[int, ...], context: str) -> int:
    if len(shape) != 4 or shape[0] != 1:
        raise ExtractionError(f"{context}: expected batch-one NCHW, got {shape}")
    _, channels, height, width = shape
    return height * width * ((channels + 3) // 4)


def _workgroups(graph: NormalizedGraph, dispatch: DispatchRecord) -> list[int]:
    if dispatch.op in {
        "conv2d",
        "depthwise-conv2d",
        "activation",
        "binary",
        "avg-pool2d",
        "resize2d",
        "scan-merge",
        "channel-concat",
        "channel-affine",
    }:
        items = _activation_units(_shape(graph, dispatch.outputs[0]), dispatch.id)
    elif dispatch.op == "channel-split":
        items = _activation_units(_shape(graph, dispatch.inputs[0]), dispatch.id)
    elif dispatch.op == "layer-norm":
        shape = _shape(graph, dispatch.outputs[0])
        items = shape[0] * shape[2] * shape[3]
    elif dispatch.op == "scan-project":
        shape = _shape(graph, dispatch.inputs[0])
        items = 4 * shape[2] * shape[3]
    elif dispatch.op == "selective-scan":
        shape = _shape(graph, dispatch.inputs[0])
        items = 4 * shape[1]
    else:
        raise ExtractionError(f"{dispatch.id}: no workgroup rule for {dispatch.op!r}")
    return [(items + KERNEL_WORKGROUP_SIZE - 1) // KERNEL_WORKGROUP_SIZE, 1, 1]


def _tensor_id_map(graph: NormalizedGraph) -> dict[str, str]:
    result = {
        graph.input_id: "input.rgb",
        graph.output_id: "output.relative-disparity",
    }
    for index, tensor_id in enumerate(sorted(graph.constants)):
        result[tensor_id] = f"constant-{index:04d}"
    activations = sorted(
        set(graph.tensors) - set(graph.constants) - {graph.input_id, graph.output_id}
    )
    for index, tensor_id in enumerate(activations):
        result[tensor_id] = f"activation-{index:04d}"
    if set(result) != set(graph.tensors) or len(set(result.values())) != len(result):
        raise ExtractionError("canonical tensor IDs do not cover the runtime graph")
    return result


def source_artifact_reference(variant: OfficialVariant) -> str:
    return f"onnx/{variant.artifact.filename}@{variant.artifact.hub_revision}"


def plan_official_bundle(
    graph: NormalizedGraph,
    *,
    source_artifact: str | None = None,
    profile: str = F32_REFERENCE_PROFILE,
) -> OfficialBundlePlan:
    """Pack a prepared official graph and create its strict v1 manifest."""

    if graph.views:
        raise ExtractionError("official bundle planning requires a view-free graph")
    variant = variant_for_model(graph.model)
    if graph.source_sha256 != variant.artifact.sha256:
        raise ExtractionError(
            f"official bundle planning requires the pinned {variant.artifact.filename} "
            "artifact"
        )
    if source_artifact is None:
        source_artifact = source_artifact_reference(variant)

    tensor_ids = _tensor_id_map(graph)
    roles = classify_constant_roles(graph)
    precisions = _constant_precisions(graph, profile)
    sections, constant_records = _packed_sections(graph, roles, tensor_ids, precisions)
    raw_tensors = _raw_dynamic_tensors(graph)
    dynamic_precisions = _dynamic_precisions(graph, profile, raw_tensors)
    dynamic_metadata = {
        tensor_id: _dynamic_tensor_metadata(
            graph,
            tensor_id,
            tensor_ids[tensor_id],
            raw_tensors,
            dynamic_precisions[tensor_id],
        )
        for tensor_id in graph.tensors
        if tensor_id not in graph.constants
    }

    dispatches: list[dict[str, Any]] = []
    for index, dispatch in enumerate(graph.dispatches):
        dispatches.append(
            {
                "id": f"dispatch-{index:04d}",
                "op": dispatch.op,
                "inputs": [tensor_ids[tensor_id] for tensor_id in dispatch.inputs],
                "outputs": [tensor_ids[tensor_id] for tensor_id in dispatch.outputs],
                "workgroups": _workgroups(graph, dispatch),
                "params": deepcopy(dispatch.params),
            }
        )

    input_id = tensor_ids[graph.input_id]
    output_id = tensor_ids[graph.output_id]
    byte_lengths = {
        metadata["id"]: int(metadata["byteLength"])
        for metadata in dynamic_metadata.values()
    }
    intervals = intervals_from_dispatches(
        dispatches,
        byte_lengths,
        persistent_tensors={
            input_id,
            output_id,
            *(tensor_ids[tensor_id] for tensor_id in graph.constants),
        },
    )
    has_channel_affine_fold = any(
        tensor_id.startswith("generated/channel-affine/")
        for tensor_id in graph.constants
    )
    slot_plan = plan_slots(
        intervals,
        grow_free_slots=(profile == BALANCED_FP16_PROFILE or has_channel_affine_fold),
    )
    assignment_by_tensor = {
        assignment.tensor_id: assignment.slot_id for assignment in slot_plan.assignments
    }

    input_metadata = dynamic_metadata[graph.input_id]
    input_metadata["storage"] = {"kind": "input"}
    output_metadata = dynamic_metadata[graph.output_id]
    output_metadata["storage"] = {"kind": "output"}
    internal_records: list[dict[str, Any]] = []
    for source_id in sorted(set(dynamic_metadata) - {graph.input_id, graph.output_id}):
        metadata = dynamic_metadata[source_id]
        try:
            slot_id = assignment_by_tensor[metadata["id"]]
        except KeyError as error:
            raise ExtractionError(
                f"activation {source_id!r} has no liveness slot"
            ) from error
        metadata["storage"] = {"kind": "slot", "slotId": slot_id}
        internal_records.append(metadata)

    output_record: dict[str, Any] = {
        "kind": "relative-disparity",
        "tensorId": output_id,
        "resize": "bilinear-align-corners",
    }
    if variant.output_polarity != "direct":
        output_record["polarity"] = variant.output_polarity

    manifest: dict[str, Any] = {
        "schema": "depthart.bundle.v1",
        "model": variant.bundle_model,
        "precision": {
            F32_REFERENCE_PROFILE: "f32-reference",
            BALANCED_FP16_PROFILE: "fp16-native",
        }[profile],
        "provenance": {
            "sourceRepository": "https://github.com/xuefeng-cvr/DepthART",
            "sourceRevision": variant.artifact.source_revision,
            "sourceArtifact": source_artifact,
            "sourceSha256": graph.source_sha256,
            "license": (
                "Apache-2.0 model metadata; pinned source repository has no license file"
            ),
            "converter": "depthart-pack/0.1.0",
        },
        "requiredFeatures": (
            ["shader-f16"] if profile == BALANCED_FP16_PROFILE else []
        ),
        "optionalFeatures": (
            ["subgroups", "packed-4x8-integer-dot-product"]
            if profile == BALANCED_FP16_PROFILE
            else ["shader-f16", "subgroups", "packed-4x8-integer-dot-product"]
        ),
        "input": {
            "kind": "srgb-image",
            "tensorId": input_id,
            "colorSpace": "rgb",
            "resize": "cubic-warp",
            "mean": [0.485, 0.456, 0.406],
            "std": [0.229, 0.224, 0.225],
        },
        "output": output_record,
        "tensors": [
            input_metadata,
            *(constant_records[tensor_id] for tensor_id in sorted(graph.constants)),
            *internal_records,
            output_metadata,
        ],
        "slots": [
            {
                "id": slot.id,
                "byteLength": slot.byte_length,
                "alignment": slot.alignment,
            }
            for slot in slot_plan.slots
        ],
        "dispatches": dispatches,
        "weightSections": [],
    }
    return OfficialBundlePlan(manifest, sections)


def build_official_bundle(
    path: str | Path,
    *,
    check_finite: bool = True,
    profile: str = F32_REFERENCE_PROFILE,
    fold_channel_affine: bool = False,
    fuse_channel_affine: bool = False,
) -> bytes:
    """Validate, lower, pack, serialize, and independently parse an official ONNX."""

    model_path = Path(path)
    graph = prepare_runtime_graph(
        extract_graph(model_path, require_official=True, check_finite=check_finite),
        fold_channel_affine=fold_channel_affine,
        fuse_channel_affine=fuse_channel_affine,
    )
    plan = plan_official_bundle(graph, profile=profile)
    writer = BundleWriter(plan.manifest)
    for section in plan.sections:
        writer.add_section(
            section.id,
            section.data,
            kind=section.kind,
            alignment=section.alignment,
        )
    return writer.build(validate=True)
