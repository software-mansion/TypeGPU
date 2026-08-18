from __future__ import annotations

import os
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path

import pytest

from depthart_pack.bundle import BundleWriter, parse_bundle
from depthart_pack.exporter import (
    BALANCED_FP16_PROFILE,
    plan_official_bundle,
    source_artifact_reference,
)
from depthart_pack.graph import RUNTIME_OPS, extract_graph
from depthart_pack.lowering import prepare_runtime_graph
from depthart_pack.profile import (
    OFFICIAL_VARIANTS,
    OfficialVariant,
    ProfileError,
    inspect_onnx,
    variant_for_artifact,
    variant_for_model,
)

EXPECTED_IDENTITIES = {
    "depthart-s": (
        "relative_s_448_default.onnx",
        24_544_478,
        "4773e2648803d207c470c86633c3059fd792bc87c5fdffce817005f6711abf06",
    ),
    "depthart-b": (
        "relative_b_448_default.onnx",
        46_137_401,
        "33bd1369d7b2c00d1057f22f73e9ae3ea1e42b9f492d3884233ffc91d97fb6fd",
    ),
    "depthart-l": (
        "relative_l_448_default.onnx",
        131_090_446,
        "358079054bb10dd9caca164b7799e22598b3f54f2201a86bb9ed09cc891cb04f",
    ),
}


@dataclass(frozen=True)
class BalancedExpectation:
    """Figures the balanced-fp16 conversion of one released size must reproduce."""

    views: int
    dispatches: int
    tensors: int
    constants: int
    bundle_byte_length: int
    bundle_sha256: str
    bundle_crc32: str
    section_byte_lengths: list[int]


BALANCED_EXPECTATIONS = {
    "depthart-s": BalancedExpectation(
        views=35,
        dispatches=230,
        tensors=517,
        constants=266,
        bundle_byte_length=13_662_992,
        bundle_sha256=(
            "e6d7b65bd2888771790d3cc3ad827133f0b014f05010347b6fc6fc891ff9e19c"
        ),
        bundle_crc32="831e711c",
        section_byte_lengths=[13_501_968],
    ),
    "depthart-b": BalancedExpectation(
        views=35,
        dispatches=234,
        tensors=527,
        constants=272,
        bundle_byte_length=25_518_768,
        bundle_sha256=(
            "cf121c7df9ae5fa5b24a8ae910af8462f1be9bde8131a9e4e5604f902f12b46d"
        ),
        bundle_crc32="9239f8b8",
        section_byte_lengths=[25_354_416],
    ),
    "depthart-l": BalancedExpectation(
        views=35,
        dispatches=250,
        tensors=567,
        constants=296,
        bundle_byte_length=71_566_624,
        bundle_sha256=(
            "2d39ab90a76039586c1475ec11a467cd789e455e320c56f2836a2390b28be33b"
        ),
        bundle_crc32="f3c13cf0",
        section_byte_lengths=[66_723_024, 4_666_144],
    ),
}


def _artifact_path(variant: OfficialVariant) -> str | None:
    """Per-size override, with the original single-artifact variable kept for L."""

    size = variant.graph_model.rsplit("-", 1)[1].upper()
    names = (
        (f"DEPTHART_ONNX_{size}", "DEPTHART_ONNX")
        if size == "L"
        else (f"DEPTHART_ONNX_{size}",)
    )
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    return None


def _variant_ids(variant: OfficialVariant) -> str:
    return variant.graph_model


def test_variant_table_covers_the_three_released_sizes() -> None:
    assert [variant.graph_model for variant in OFFICIAL_VARIANTS] == [
        "depthart-s",
        "depthart-b",
        "depthart-l",
    ]
    identities = {
        (variant.artifact.byte_length, variant.artifact.sha256)
        for variant in OFFICIAL_VARIANTS
    }
    assert len(identities) == len(OFFICIAL_VARIANTS)
    bundle_models = {variant.bundle_model for variant in OFFICIAL_VARIANTS}
    assert len(bundle_models) == len(OFFICIAL_VARIANTS)


@pytest.mark.parametrize("variant", OFFICIAL_VARIANTS, ids=_variant_ids)
def test_official_artifact_identity_is_pinned(variant: OfficialVariant) -> None:
    filename, byte_length, digest = EXPECTED_IDENTITIES[variant.graph_model]
    assert variant.artifact.filename == filename
    assert variant.artifact.byte_length == byte_length
    assert variant.artifact.sha256 == digest
    assert variant_for_artifact(byte_length, digest) is variant
    assert variant_for_model(variant.graph_model) is variant


@pytest.mark.parametrize("variant", OFFICIAL_VARIANTS, ids=_variant_ids)
def test_scan_contract_is_uniform_across_sizes(variant: OfficialVariant) -> None:
    assert len(variant.scans) == 5
    assert all(scan.length == 196 for scan in variant.scans)
    assert all(scan.state_size == 8 for scan in variant.scans)
    assert all(scan.low_channels % 4 == 0 for scan in variant.scans)
    assert all(scan.dt_rank > 0 for scan in variant.scans)


def test_output_polarity_is_recorded_per_variant() -> None:
    polarities = {
        variant.graph_model: variant.output_polarity for variant in OFFICIAL_VARIANTS
    }
    assert polarities == {
        "depthart-s": "direct",
        "depthart-b": "inverted",
        "depthart-l": "direct",
    }


def test_only_the_large_checkpoint_publishes_a_parameter_count() -> None:
    counts = {
        variant.graph_model: variant.checkpoint_parameter_count
        for variant in OFFICIAL_VARIANTS
    }
    assert counts == {
        "depthart-s": None,
        "depthart-b": None,
        "depthart-l": 32_612_689,
    }


def test_identity_mismatch_fails_before_onnx_parse(tmp_path: Path) -> None:
    fake = tmp_path / "relative_l_448_default.onnx"
    fake.write_bytes(b"not an onnx model")
    with pytest.raises(ProfileError, match="artifact identity mismatch") as error:
        inspect_onnx(fake)
    for variant in OFFICIAL_VARIANTS:
        assert variant.artifact.sha256 in str(error.value)


def test_unknown_variant_is_rejected() -> None:
    with pytest.raises(ProfileError, match="unsupported DepthART variant"):
        variant_for_model("depthart-xl")


@pytest.mark.parametrize("variant", OFFICIAL_VARIANTS, ids=_variant_ids)
def test_official_graph_builds_the_shipped_balanced_bundle(
    variant: OfficialVariant,
) -> None:
    size = variant.graph_model.rsplit("-", 1)[1].upper()
    path = _artifact_path(variant)
    if path is None:
        pytest.skip(f"set DEPTHART_ONNX_{size} to run the pinned integration artifact")

    expected = BALANCED_EXPECTATIONS[variant.graph_model]
    graph = extract_graph(path, check_finite=True)
    assert graph.model == variant.graph_model
    assert graph.source_sha256 == variant.artifact.sha256
    assert len(graph.scans) == 5
    assert all(scan.length == 196 for scan in graph.scans)
    assert len(graph.views) == expected.views

    prepared = prepare_runtime_graph(
        graph,
        fold_channel_affine=True,
        fuse_channel_affine=True,
    )
    assert not prepared.views
    assert len(prepared.dispatches) == expected.dispatches
    assert len(prepared.tensors) == expected.tensors
    assert len(prepared.constants) == expected.constants
    assert {dispatch.op for dispatch in prepared.dispatches} == RUNTIME_OPS

    plan = plan_official_bundle(prepared, profile=BALANCED_FP16_PROFILE)
    writer = BundleWriter(plan.manifest)
    for section in plan.sections:
        writer.add_section(
            section.id,
            section.data,
            kind=section.kind,
            alignment=section.alignment,
        )
    bundle = writer.build()
    parsed = parse_bundle(bundle)

    assert len(bundle) == expected.bundle_byte_length
    assert sha256(bundle).hexdigest() == expected.bundle_sha256
    assert f"{parsed.checksum:08x}" == expected.bundle_crc32
    assert parsed.manifest["model"] == variant.bundle_model
    assert parsed.manifest["precision"] == "fp16-native"
    assert parsed.manifest["requiredFeatures"] == ["shader-f16"]
    assert len(parsed.manifest["slots"]) == 11
    assert parsed.manifest["provenance"]["sourceArtifact"] == (
        source_artifact_reference(variant)
    )
    output_record = parsed.manifest["output"]
    if variant.output_polarity == "direct":
        assert "polarity" not in output_record
    else:
        assert output_record["polarity"] == variant.output_polarity
    assert [
        len(section.data) for section in plan.sections
    ] == expected.section_byte_lengths
