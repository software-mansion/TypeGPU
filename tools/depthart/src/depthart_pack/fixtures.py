"""Small deterministic v1 bundle exercising every frozen runtime operation."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from hashlib import sha256
from pathlib import Path
from typing import Any

import numpy as np

from .bundle import BundleError, BundleWriter, align_up
from .exporter import (
    BALANCED_FP16_PROFILE,
    EXPORT_PROFILES,
    F32_REFERENCE_PROFILE,
)
from .pack import pack_c4, pack_conv_o4i4, pack_depthwise_c4yx, pack_direction_o4i4


def _hwc4_tensor(
    tensor_id: str,
    channels: int,
    height: int,
    width: int,
    storage: dict[str, Any],
    *,
    dtype: str = "f32",
) -> dict[str, Any]:
    channel_blocks = (channels + 3) // 4
    storage_shape = [1, height, width, channel_blocks, 4]
    return {
        "id": tensor_id,
        "shape": [1, channels, height, width],
        "storageShape": storage_shape,
        "dtype": dtype,
        "encoding": "plain",
        "layout": "hwc4",
        "byteLength": int(np.prod(storage_shape, dtype=np.int64))
        * (2 if dtype == "f16" else 4),
        "storage": storage,
    }


def _raw_tensor(
    tensor_id: str, shape: list[int], storage: dict[str, Any]
) -> dict[str, Any]:
    return {
        "id": tensor_id,
        "shape": shape,
        "storageShape": shape,
        "dtype": "f32",
        "encoding": "plain",
        "layout": "raw",
        "byteLength": int(np.prod(shape, dtype=np.int64)) * 4,
        "storage": storage,
    }


@dataclass
class _SectionBuilder:
    section_id: str
    data: bytearray = field(default_factory=bytearray)
    tensors: list[dict[str, Any]] = field(default_factory=list)

    def add(
        self,
        tensor_id: str,
        data: bytes,
        *,
        shape: tuple[int, ...],
        storage_shape: tuple[int, ...],
        layout: str,
        dtype: str = "f32",
        encoding: str = "plain",
        alignment: int = 16,
    ) -> str:
        offset = align_up(len(self.data), alignment)
        self.data.extend(bytes(offset - len(self.data)))
        self.data.extend(data)
        self.tensors.append(
            {
                "id": tensor_id,
                "shape": list(shape),
                "storageShape": list(storage_shape),
                "dtype": dtype,
                "encoding": encoding,
                "layout": layout,
                "byteLength": len(data),
                "storage": {
                    "kind": "section",
                    "sectionId": self.section_id,
                    "byteOffset": offset,
                },
            }
        )
        return tensor_id

    def add_array(
        self,
        tensor_id: str,
        values: np.ndarray,
        *,
        shape: tuple[int, ...] | None = None,
        storage_shape: tuple[int, ...] | None = None,
        layout: str = "raw",
    ) -> str:
        array = np.asarray(values, dtype="<f4")
        return self.add(
            tensor_id,
            array.tobytes(order="C"),
            shape=shape or tuple(array.shape),
            storage_shape=storage_shape or tuple(array.shape),
            layout=layout,
        )


def synthetic_manifest_and_section(
    *, profile: str = F32_REFERENCE_PROFILE
) -> tuple[dict[str, Any], bytes]:
    """Return a small payload whose graph constructs every kernel variant.

    I/O retains the fixed public 448 contract, while the compute-heavy internal
    chain runs at 14x14 with four channels and a 196-element scan.
    """

    if profile not in EXPORT_PROFILES:
        raise BundleError(
            f"unsupported synthetic profile {profile!r}; expected one of {EXPORT_PROFILES}"
        )
    encoder_weight_precision = {
        F32_REFERENCE_PROFILE: "f32",
        BALANCED_FP16_PROFILE: "f16-native",
    }[profile]
    section = _SectionBuilder("synthetic-weights")
    stem_values = np.zeros((4, 3, 1, 1), dtype=np.float32)
    stem_values[0, 0, 0, 0] = 1
    stem_values[1, 1, 0, 0] = 1
    stem_values[2, 2, 0, 0] = 1
    stem_values[3, :, 0, 0] = np.float32(1 / 3)
    stem_weight = pack_conv_o4i4(stem_values, precision=encoder_weight_precision)
    section.add(
        "stem.weight",
        stem_weight.data,
        shape=stem_weight.logical_shape,
        storage_shape=stem_weight.storage_shape,
        layout=stem_weight.layout,
        dtype=stem_weight.dtype,
        encoding=stem_weight.encoding,
    )
    stem_bias = pack_c4(np.zeros(4, dtype=np.float32))
    section.add(
        "stem.bias",
        stem_bias.data,
        shape=stem_bias.logical_shape,
        storage_shape=stem_bias.storage_shape,
        layout=stem_bias.layout,
    )
    depthwise_values = np.zeros((4, 1, 3, 3), dtype=np.float32)
    depthwise_values[:, 0, 1, 1] = 1
    depthwise_weight = pack_depthwise_c4yx(
        depthwise_values, precision=encoder_weight_precision
    )
    section.add(
        "dw.weight",
        depthwise_weight.data,
        shape=depthwise_weight.logical_shape,
        storage_shape=depthwise_weight.storage_shape,
        layout=depthwise_weight.layout,
        dtype=depthwise_weight.dtype,
        encoding=depthwise_weight.encoding,
    )
    section.add(
        "dw.bias",
        stem_bias.data,
        shape=stem_bias.logical_shape,
        storage_shape=stem_bias.storage_shape,
        layout=stem_bias.layout,
    )
    section.add(
        "binary.channels",
        pack_c4(np.asarray([0.1, -0.1, 0.2, -0.2], dtype=np.float32)).data,
        shape=(4,),
        storage_shape=(1, 4),
        layout="c4",
    )
    expand_values = np.zeros((8, 4, 1, 1), dtype=np.float32)
    for channel in range(4):
        expand_values[channel, channel, 0, 0] = 1
    expand_weight = pack_conv_o4i4(expand_values, precision=encoder_weight_precision)
    section.add(
        "channel.expand.weight",
        expand_weight.data,
        shape=expand_weight.logical_shape,
        storage_shape=expand_weight.storage_shape,
        layout=expand_weight.layout,
        dtype=expand_weight.dtype,
        encoding=expand_weight.encoding,
    )
    expand_bias = pack_c4(np.zeros(8, dtype=np.float32))
    section.add(
        "channel.expand.bias",
        expand_bias.data,
        shape=expand_bias.logical_shape,
        storage_shape=expand_bias.storage_shape,
        layout=expand_bias.layout,
    )
    contract_values = np.zeros((4, 8, 1, 1), dtype=np.float32)
    for channel in range(4):
        contract_values[channel, channel, 0, 0] = 1
    contract_weight = pack_conv_o4i4(
        contract_values, precision=encoder_weight_precision
    )
    section.add(
        "channel.contract.weight",
        contract_weight.data,
        shape=contract_weight.logical_shape,
        storage_shape=contract_weight.storage_shape,
        layout=contract_weight.layout,
        dtype=contract_weight.dtype,
        encoding=contract_weight.encoding,
    )
    section.add(
        "channel.contract.bias",
        stem_bias.data,
        shape=stem_bias.logical_shape,
        storage_shape=stem_bias.storage_shape,
        layout=stem_bias.layout,
    )
    affine_scale = pack_c4(np.asarray([1.0, 0.75, 1.25, 0.5], dtype=np.float32))
    section.add(
        "affine.scale",
        affine_scale.data,
        shape=affine_scale.logical_shape,
        storage_shape=affine_scale.storage_shape,
        layout=affine_scale.layout,
    )
    affine_bias = pack_c4(np.asarray([0.05, -0.05, 0.1, -0.1], dtype=np.float32))
    section.add(
        "affine.bias",
        affine_bias.data,
        shape=affine_bias.logical_shape,
        storage_shape=affine_bias.storage_shape,
        layout=affine_bias.layout,
    )
    section.add(
        "norm.gamma",
        pack_c4(np.ones(4, dtype=np.float32)).data,
        shape=(4,),
        storage_shape=(1, 4),
        layout="c4",
    )
    section.add(
        "norm.beta",
        stem_bias.data,
        shape=(4,),
        storage_shape=(1, 4),
        layout="c4",
    )

    # direction-o4i4 capacity is D * ceil4(O) * ceil4(I).
    x_projection = np.zeros((4, 17, 4), dtype=np.float32)
    for direction in range(4):
        x_projection[direction, 0, 0] = np.float32(0.1)  # dt-rank 0 <- channel 0
        x_projection[direction, 1, 1] = np.float32(0.1)  # B state 0 <- channel 1
        x_projection[direction, 9, 2] = np.float32(0.1)  # C state 0 <- channel 2
    packed_x_projection = pack_direction_o4i4(x_projection)
    section.add(
        "scan.x-projection",
        packed_x_projection.data,
        shape=packed_x_projection.logical_shape,
        storage_shape=packed_x_projection.storage_shape,
        layout=packed_x_projection.layout,
    )
    dt_projection = np.full((4, 4, 1), np.float32(0.05), dtype=np.float32)
    packed_dt_projection = pack_direction_o4i4(dt_projection)
    section.add(
        "scan.dt-projection",
        packed_dt_projection.data,
        shape=packed_dt_projection.logical_shape,
        storage_shape=packed_dt_projection.storage_shape,
        layout=packed_dt_projection.layout,
    )
    section.add_array("scan.A", -np.ones((16, 8), dtype=np.float32))
    section.add_array("scan.D", np.ones(16, dtype=np.float32))
    section.add_array("scan.delta-bias", np.zeros(16, dtype=np.float32))

    head_values = np.zeros((1, 4, 1, 1), dtype=np.float32)
    head_values[0, 0, 0, 0] = 1
    head_weight = pack_conv_o4i4(head_values)
    section.add(
        "head.weight",
        head_weight.data,
        shape=head_weight.logical_shape,
        storage_shape=head_weight.storage_shape,
        layout=head_weight.layout,
    )
    head_bias = pack_c4(np.zeros(1, dtype=np.float32))
    section.add(
        "head.bias",
        head_bias.data,
        shape=head_bias.logical_shape,
        storage_shape=head_bias.storage_shape,
        layout=head_bias.layout,
    )

    tensors: list[dict[str, Any]] = [
        _hwc4_tensor("input.rgb", 3, 448, 448, {"kind": "input"}),
        *section.tensors,
    ]
    slots: list[dict[str, Any]] = []

    def slot_tensor(tensor: dict[str, Any]) -> None:
        slot_id = f"slot-{len(slots):02d}"
        tensor["storage"] = {"kind": "slot", "slotId": slot_id}
        slots.append(
            {
                "id": slot_id,
                "byteLength": align_up(int(tensor["byteLength"]), 256),
                "alignment": 256,
            }
        )
        tensors.append(tensor)

    slot_tensor(_hwc4_tensor("pool.output", 3, 14, 14, {}))
    encoder_activation_dtype = "f16" if profile == BALANCED_FP16_PROFILE else "f32"
    slot_tensor(
        _hwc4_tensor("stem.output", 4, 14, 14, {}, dtype=encoder_activation_dtype)
    )
    slot_tensor(
        _hwc4_tensor("dw.output", 4, 14, 14, {}, dtype=encoder_activation_dtype)
    )
    slot_tensor(
        _hwc4_tensor("activation.output", 4, 14, 14, {}, dtype=encoder_activation_dtype)
    )
    slot_tensor(
        _hwc4_tensor("binary.output", 4, 14, 14, {}, dtype=encoder_activation_dtype)
    )
    slot_tensor(_hwc4_tensor("channel.expanded", 8, 14, 14, {}))
    slot_tensor(_hwc4_tensor("channel.low", 4, 14, 14, {}))
    slot_tensor(_hwc4_tensor("channel.high", 4, 14, 14, {}))
    slot_tensor(_hwc4_tensor("channel.concatenated", 8, 14, 14, {}))
    slot_tensor(_hwc4_tensor("channel.contracted", 4, 14, 14, {}))
    slot_tensor(_hwc4_tensor("affine.output", 4, 14, 14, {}))
    slot_tensor(_hwc4_tensor("norm.output", 4, 14, 14, {}))
    slot_tensor(_raw_tensor("scan.delta", [1, 16, 196], {}))
    slot_tensor(_raw_tensor("scan.B", [1, 4, 8, 196], {}))
    slot_tensor(_raw_tensor("scan.C", [1, 4, 8, 196], {}))
    slot_tensor(_raw_tensor("scan.directional", [1, 16, 196], {}))
    slot_tensor(_hwc4_tensor("scan.merged", 4, 14, 14, {}))
    slot_tensor(_hwc4_tensor("head.output", 1, 14, 14, {}))
    tensors.append(
        _hwc4_tensor("output.raw-disparity", 1, 448, 448, {"kind": "output"})
    )

    def one_dimensional(items: int) -> list[int]:
        return [(items + 63) // 64, 1, 1]

    dispatches = [
        {
            "id": "pool.14x14",
            "op": "avg-pool2d",
            "inputs": ["input.rgb"],
            "outputs": ["pool.output"],
            "workgroups": one_dimensional(196),
            "params": {
                "kernel": [32, 32],
                "stride": [32, 32],
                "padding": [0, 0, 0, 0],
                "countIncludePad": True,
            },
        },
        {
            "id": "stem.conv",
            "op": "conv2d",
            "inputs": ["pool.output", "stem.weight", "stem.bias"],
            "outputs": ["stem.output"],
            "workgroups": one_dimensional(196),
            "params": {
                "kernel": [1, 1],
                "stride": [1, 1],
                "padding": [0, 0, 0, 0],
                "groups": 1,
                "activation": "none",
                "weightPacking": "o4i4-yx",
                "biasPacking": "c4",
            },
        },
        {
            "id": "stem.depthwise",
            "op": "depthwise-conv2d",
            "inputs": ["stem.output", "dw.weight", "dw.bias"],
            "outputs": ["dw.output"],
            "workgroups": one_dimensional(196),
            "params": {
                "kernel": [3, 3],
                "stride": [1, 1],
                "padding": [1, 1, 1, 1],
                "groups": 4,
                "activation": "none",
                "weightPacking": "c4-yx",
                "biasPacking": "c4",
            },
        },
        {
            "id": "stem.gelu",
            "op": "activation",
            "inputs": ["dw.output"],
            "outputs": ["activation.output"],
            "workgroups": one_dimensional(196),
            "params": {"kind": "gelu"},
        },
        {
            "id": "stem.channel-add",
            "op": "binary",
            "inputs": ["activation.output", "binary.channels"],
            "outputs": ["binary.output"],
            "workgroups": one_dimensional(196),
            "params": {"kind": "add", "broadcast": "channels"},
        },
        {
            "id": "channel.expand",
            "op": "conv2d",
            "inputs": [
                "binary.output",
                "channel.expand.weight",
                "channel.expand.bias",
            ],
            "outputs": ["channel.expanded"],
            "workgroups": one_dimensional(2 * 196),
            "params": {
                "kernel": [1, 1],
                "stride": [1, 1],
                "padding": [0, 0, 0, 0],
                "groups": 1,
                "activation": "none",
                "weightPacking": "o4i4-yx",
                "biasPacking": "c4",
            },
        },
        {
            "id": "channel.split",
            "op": "channel-split",
            "inputs": ["channel.expanded"],
            "outputs": ["channel.low", "channel.high"],
            "workgroups": one_dimensional(2 * 196),
            "params": {"axis": 1, "splitChannels": [4, 4]},
        },
        {
            "id": "channel.concat",
            "op": "channel-concat",
            "inputs": ["channel.low", "channel.high"],
            "outputs": ["channel.concatenated"],
            "workgroups": one_dimensional(2 * 196),
            "params": {"axis": 1},
        },
        {
            "id": "channel.contract",
            "op": "conv2d",
            "inputs": [
                "channel.concatenated",
                "channel.contract.weight",
                "channel.contract.bias",
            ],
            "outputs": ["channel.contracted"],
            "workgroups": one_dimensional(196),
            "params": {
                "kernel": [1, 1],
                "stride": [1, 1],
                "padding": [0, 0, 0, 0],
                "groups": 1,
                "activation": "none",
                "weightPacking": "o4i4-yx",
                "biasPacking": "c4",
            },
        },
        {
            "id": "stage.channel-affine",
            "op": "channel-affine",
            "inputs": ["channel.contracted", "affine.scale", "affine.bias"],
            "outputs": ["affine.output"],
            "workgroups": one_dimensional(196),
            "params": {"axis": 1},
        },
        {
            "id": "scan.layer-norm",
            "op": "layer-norm",
            "inputs": ["affine.output", "norm.gamma", "norm.beta"],
            "outputs": ["norm.output"],
            "workgroups": one_dimensional(196),
            "params": {"axis": 1, "epsilon": 1e-5},
        },
        {
            "id": "scan.project",
            "op": "scan-project",
            "inputs": ["norm.output", "scan.x-projection", "scan.dt-projection"],
            "outputs": ["scan.delta", "scan.B", "scan.C"],
            "workgroups": one_dimensional(4 * 196),
            "params": {
                "directions": 4,
                "stateSize": 8,
                "dtRank": 1,
                "lowChannels": 4,
                "sequence": {"rowMajor": True, "columnMajor": True, "reverse": True},
            },
        },
        {
            "id": "scan.recurrence",
            "op": "selective-scan",
            "inputs": [
                "norm.output",
                "scan.delta",
                "scan.B",
                "scan.C",
                "scan.A",
                "scan.D",
                "scan.delta-bias",
            ],
            "outputs": ["scan.directional"],
            "workgroups": one_dimensional(16),
            "params": {
                "directions": 4,
                "stateSize": 8,
                "length": 196,
                "deltaSoftplus": True,
                "fp32Recurrence": True,
            },
        },
        {
            "id": "scan.merge",
            "op": "scan-merge",
            "inputs": ["scan.directional"],
            "outputs": ["scan.merged"],
            "workgroups": one_dimensional(196),
            "params": {
                "directions": 4,
                "transposeColumnMajor": True,
                "reduction": "sum",
                "normalization": "none",
            },
        },
        {
            "id": "head.conv",
            "op": "conv2d",
            "inputs": ["scan.merged", "head.weight", "head.bias"],
            "outputs": ["head.output"],
            "workgroups": one_dimensional(196),
            "params": {
                "kernel": [1, 1],
                "stride": [1, 1],
                "padding": [0, 0, 0, 0],
                "groups": 1,
                "activation": "relu",
                "weightPacking": "o4i4-yx",
                "biasPacking": "c4",
            },
        },
        {
            "id": "head.resize",
            "op": "resize2d",
            "inputs": ["head.output"],
            "outputs": ["output.raw-disparity"],
            "workgroups": one_dimensional(448 * 448),
            "params": {
                "mode": "bilinear",
                "coordinateMode": "align-corners",
                "size": [448, 448],
            },
        },
    ]

    provenance_digest = sha256(
        b"depthart-pack synthetic all-ops fixture v1.2"
    ).hexdigest()
    manifest: dict[str, Any] = {
        "schema": "depthart.bundle.v1",
        "model": "depthart-relative-l-448",
        "precision": {
            F32_REFERENCE_PROFILE: "f32-reference",
            BALANCED_FP16_PROFILE: "fp16-native",
        }[profile],
        "provenance": {
            "sourceRepository": "https://github.com/xuefeng-cvr/DepthART",
            "sourceRevision": "0384521b3bcb4c64adf03eeb5d55ebdb1cbdd84c",
            "sourceArtifact": "synthetic-all-ops-fixture",
            "sourceSha256": provenance_digest,
            "license": "Apache-2.0 model metadata; synthetic values generated by depthart-pack",
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
            "kind": "normalized-rgb-tensor",
            "tensorId": "input.rgb",
            "colorSpace": "rgb",
            "resize": "cubic-warp",
            "mean": [0.485, 0.456, 0.406],
            "std": [0.229, 0.224, 0.225],
        },
        "output": {
            "kind": "relative-disparity",
            "tensorId": "output.raw-disparity",
            "resize": "bilinear-align-corners",
        },
        "tensors": tensors,
        "slots": slots,
        "dispatches": dispatches,
        "weightSections": [],
    }
    return manifest, bytes(section.data)


def build_synthetic_bundle(*, profile: str = F32_REFERENCE_PROFILE) -> bytes:
    manifest, section = synthetic_manifest_and_section(profile=profile)
    writer = BundleWriter(manifest)
    writer.add_section("synthetic-weights", section, kind="weights", alignment=256)
    return writer.build()


def synthetic_cpu_probe_14() -> np.ndarray:
    """The guaranteed D-skip contribution for an artificial 14x14 RGB gradient.

    The fixture also has small nonzero delta/B/C projections, which deliberately
    exercise recurrent state. This probe isolates the `D=1` path and stops before
    recurrence/final resize; it catches a zeroed or channel-averaging fixture
    without pretending to be a bit-exact scan oracle.
    """

    coordinate = np.linspace(-1, 1, 14, dtype=np.float32)
    yy, xx = np.meshgrid(coordinate, coordinate, indexing="ij")
    rgb = np.stack((xx, yy, (xx + yy) * np.float32(0.5)), axis=-1)
    stem = np.concatenate((rgb, np.mean(rgb, axis=-1, keepdims=True)), axis=-1)
    gelu = (
        np.float32(0.5)
        * stem
        * (
            np.float32(1)
            + np.vectorize(math.erf, otypes=[np.float32])(
                stem / np.float32(math.sqrt(2))
            )
        )
    )
    shifted = gelu + np.asarray([0.1, -0.1, 0.2, -0.2], dtype=np.float32)
    affine = shifted * np.asarray([1.0, 0.75, 1.25, 0.5], dtype=np.float32)
    affine += np.asarray([0.05, -0.05, 0.1, -0.1], dtype=np.float32)
    mean = np.mean(affine, axis=-1, keepdims=True, dtype=np.float32)
    variance = np.mean((affine - mean) ** 2, axis=-1, keepdims=True, dtype=np.float32)
    normalized = (affine - mean) / np.sqrt(variance + np.float32(1e-5))
    return np.ascontiguousarray(np.float32(4) * normalized[..., 0])


def write_synthetic_bundle(
    path: str | Path, *, profile: str = F32_REFERENCE_PROFILE
) -> Path:
    output = Path(path)
    output.write_bytes(build_synthetic_bundle(profile=profile))
    return output
