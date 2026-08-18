from __future__ import annotations

import struct
from pathlib import Path

import numpy as np
import pytest

from depthart_pack.bundle import (
    BUNDLE_CRC_OFFSET,
    ENDIAN_TAG,
    FORMAT_VERSION,
    HEADER,
    HEADER_BYTES,
    MAGIC,
    PAYLOAD_ALIGNMENT,
    BundleError,
    BundleWriter,
    parse_bundle,
)
from depthart_pack.exporter import BALANCED_FP16_PROFILE
from depthart_pack.fixtures import (
    build_synthetic_bundle,
    synthetic_cpu_probe_14,
    synthetic_manifest_and_section,
)
from depthart_pack.graph import RUNTIME_OPS


def test_all_ops_fixture_is_deterministic_and_strictly_parseable() -> None:
    first = build_synthetic_bundle()
    second = build_synthetic_bundle()
    parsed = parse_bundle(first)

    assert first == second
    assert len(first) < 1_000_000
    assert parsed.payload_offset % PAYLOAD_ALIGNMENT == 0
    assert {dispatch["op"] for dispatch in parsed.manifest["dispatches"]} == RUNTIME_OPS
    assert len(parsed.manifest["dispatches"]) == 16
    assert parsed.manifest["weightSections"][0]["byteOffset"] == 0
    standalone = next(
        dispatch
        for dispatch in parsed.manifest["dispatches"]
        if dispatch["op"] == "activation"
    )
    assert standalone["inputs"] == ["dw.output"]
    assert standalone["outputs"] == ["activation.output"]
    affine = next(
        dispatch
        for dispatch in parsed.manifest["dispatches"]
        if dispatch["op"] == "channel-affine"
    )
    assert affine == {
        "id": "stage.channel-affine",
        "op": "channel-affine",
        "inputs": ["channel.contracted", "affine.scale", "affine.bias"],
        "outputs": ["affine.output"],
        "workgroups": [4, 1, 1],
        "params": {"axis": 1},
    }


def test_committed_fixture_is_current_and_nonzero_probe_has_range() -> None:
    fixture = Path(__file__).parent / "fixtures" / "depthart-all-ops-v1.bin"
    assert fixture.read_bytes() == build_synthetic_bundle()
    probe = synthetic_cpu_probe_14()
    assert np.all(np.isfinite(probe))
    assert float(np.ptp(probe)) > 1


def test_balanced_fixture_has_native_half_island_and_feature() -> None:
    first = build_synthetic_bundle(profile=BALANCED_FP16_PROFILE)
    second = build_synthetic_bundle(profile=BALANCED_FP16_PROFILE)
    parsed = parse_bundle(first)

    assert first == second
    assert parsed.manifest["precision"] == "fp16-native"
    assert parsed.manifest["requiredFeatures"] == ["shader-f16"]
    assert "shader-f16" not in parsed.manifest["optionalFeatures"]
    tensor_by_id = {tensor["id"]: tensor for tensor in parsed.manifest["tensors"]}
    native_ids = {
        tensor["id"]
        for tensor in parsed.manifest["tensors"]
        if tensor["dtype"] == "f16"
    }
    assert native_ids == {
        "stem.weight",
        "dw.weight",
        "channel.expand.weight",
        "channel.contract.weight",
        "stem.output",
        "dw.output",
        "activation.output",
        "binary.output",
    }
    assert all(
        tensor_by_id[tensor_id]["encoding"] == "plain" for tensor_id in native_ids
    )
    assert all(
        tensor_by_id[tensor_id]["dtype"] == "f32"
        for tensor_id in (
            "input.rgb",
            "channel.expanded",
            "channel.low",
            "channel.high",
            "channel.concatenated",
            "channel.contracted",
            "norm.output",
            "scan.delta",
            "scan.B",
            "scan.C",
            "scan.directional",
            "scan.merged",
            "head.output",
            "output.raw-disparity",
        )
    )
    retained_ids = {"head.weight", "scan.x-projection", "scan.dt-projection"}
    assert all(
        tensor["dtype"] == "f32" and tensor["encoding"] == "plain"
        for tensor in parsed.manifest["tensors"]
        if tensor["id"] in retained_ids
    )


def test_header_and_whole_bundle_checksum_layout() -> None:
    bundle = build_synthetic_bundle()
    fields = HEADER.unpack_from(bundle)
    assert fields[:5] == (MAGIC, FORMAT_VERSION, HEADER_BYTES, ENDIAN_TAG, HEADER_BYTES)
    assert fields[6] == len(bundle)
    assert BUNDLE_CRC_OFFSET == 36

    corrupted = bytearray(bundle)
    corrupted[-1] ^= 1
    with pytest.raises(BundleError, match="whole-bundle CRC32"):
        parse_bundle(corrupted)


def test_manifest_crc_is_independently_checked() -> None:
    bundle = bytearray(build_synthetic_bundle())
    bundle[HEADER_BYTES + 10] ^= 1
    # Recalculate only the whole-bundle CRC so the manifest check is reached.
    bundle[BUNDLE_CRC_OFFSET : BUNDLE_CRC_OFFSET + 4] = b"\0\0\0\0"
    import zlib

    struct.pack_into("<I", bundle, BUNDLE_CRC_OFFSET, zlib.crc32(bundle) & 0xFFFFFFFF)
    with pytest.raises(BundleError, match="manifest CRC32"):
        parse_bundle(bundle)


def test_scan_abi_exact_arity_and_order() -> None:
    manifest = parse_bundle(build_synthetic_bundle()).manifest
    project = next(
        item for item in manifest["dispatches"] if item["op"] == "scan-project"
    )
    recurrence = next(
        item for item in manifest["dispatches"] if item["op"] == "selective-scan"
    )

    assert project["outputs"] == ["scan.delta", "scan.B", "scan.C"]
    assert recurrence["inputs"] == [
        "norm.output",
        "scan.delta",
        "scan.B",
        "scan.C",
        "scan.A",
        "scan.D",
        "scan.delta-bias",
    ]
    directional = next(
        tensor for tensor in manifest["tensors"] if tensor["id"] == "scan.directional"
    )
    assert directional["shape"] == [1, 16, 196]


def test_channel_affine_rejects_non_c4_constants() -> None:
    manifest, section = synthetic_manifest_and_section()
    scale = next(
        tensor for tensor in manifest["tensors"] if tensor["id"] == "affine.scale"
    )
    scale["layout"] = "raw"
    writer = BundleWriter(manifest)
    writer.add_section("synthetic-weights", section)

    with pytest.raises(BundleError, match="channel affine shapes/layouts"):
        parse_bundle(writer.build(validate=False))


def test_fp16_native_profile_requires_feature_and_native_tensor() -> None:
    manifest, section = synthetic_manifest_and_section(profile=BALANCED_FP16_PROFILE)
    manifest["requiredFeatures"] = []
    manifest["optionalFeatures"].insert(0, "shader-f16")
    writer = BundleWriter(manifest)
    writer.add_section("synthetic-weights", section)
    with pytest.raises(BundleError, match="requires shader-f16"):
        parse_bundle(writer.build(validate=False))

    reference, reference_section = synthetic_manifest_and_section()
    reference["precision"] = "fp16-native"
    reference["requiredFeatures"] = ["shader-f16"]
    reference["optionalFeatures"].remove("shader-f16")
    writer = BundleWriter(reference)
    writer.add_section("synthetic-weights", reference_section)
    with pytest.raises(BundleError, match="contains no native f16"):
        parse_bundle(writer.build(validate=False))
