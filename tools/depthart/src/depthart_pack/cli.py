"""Command-line entry points; invoke through `uv run depthart-pack`."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np

from .bundle import BundleError, parse_bundle
from .exporter import EXPORT_PROFILES, F32_REFERENCE_PROFILE, build_official_bundle
from .fixtures import write_synthetic_bundle
from .graph import ExtractionError, extract_graph
from .pack import PackingError
from .profile import ProfileError, inspect_onnx


def _json(value: Any) -> str:
    return json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n"


def _inspect(arguments: argparse.Namespace) -> int:
    profile = inspect_onnx(
        arguments.onnx,
        require_official=not arguments.allow_unofficial,
        check_finite=not arguments.skip_finite_check,
    )
    print(_json(profile.to_dict()), end="")
    return 0


def _extract(arguments: argparse.Namespace) -> int:
    graph = extract_graph(
        arguments.onnx,
        require_official=not arguments.allow_unofficial,
        check_finite=not arguments.skip_finite_check,
    )
    output = Path(arguments.output)
    output.write_text(_json(graph.to_dict()), encoding="utf-8")
    if arguments.weights_npz:
        # NPZ keys are stable ordinal IDs; the JSON sidecar retains the source names.
        ordered = sorted(graph.constant_values.items())
        np.savez(
            arguments.weights_npz,
            **{
                f"tensor_{index:04d}": value for index, (_, value) in enumerate(ordered)
            },
        )
        index_path = Path(str(arguments.weights_npz) + ".index.json")
        index_path.write_text(
            _json(
                {f"tensor_{index:04d}": name for index, (name, _) in enumerate(ordered)}
            ),
            encoding="utf-8",
        )
    print(
        f"wrote {output} ({len(graph.dispatches)} dispatches, "
        f"{len(graph.views)} virtual views, {len(graph.constants)} constants)"
    )
    return 0


def _convert(arguments: argparse.Namespace) -> int:
    data = build_official_bundle(
        arguments.onnx,
        profile=arguments.profile,
        fold_channel_affine=arguments.fold_channel_affine,
        fuse_channel_affine=arguments.fuse_channel_affine,
    )
    output = Path(arguments.output)
    output.write_bytes(data)
    parsed = parse_bundle(data)
    print(
        f"wrote {output} ({len(data)} bytes; {parsed.manifest['precision']}; "
        f"{len(parsed.manifest['dispatches'])} "
        f"dispatches, {len(parsed.manifest['tensors'])} tensors, "
        f"{len(parsed.sections)} weight sections)"
    )
    return 0


def _synthetic(arguments: argparse.Namespace) -> int:
    output = write_synthetic_bundle(arguments.output, profile=arguments.profile)
    parsed = parse_bundle(output.read_bytes())
    operations = sorted({item["op"] for item in parsed.manifest["dispatches"]})
    print(
        f"wrote {output} ({len(output.read_bytes())} bytes; ops: {', '.join(operations)})"
    )
    return 0


def _verify_bundle(arguments: argparse.Namespace) -> int:
    source = Path(arguments.bundle)
    parsed = parse_bundle(source.read_bytes())
    summary = {
        "path": str(source.resolve()),
        "schema": parsed.manifest["schema"],
        "model": parsed.manifest["model"],
        "precision": parsed.manifest["precision"],
        "tensors": len(parsed.manifest["tensors"]),
        "dispatches": len(parsed.manifest["dispatches"]),
        "sections": len(parsed.sections),
        "payloadByteOffset": parsed.payload_offset,
        "bundleCrc32": f"{parsed.checksum:08x}",
    }
    print(_json(summary), end="")
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="depthart-pack")
    commands = root.add_subparsers(dest="command", required=True)

    inspect_parser = commands.add_parser(
        "inspect", help="strictly inspect one of the official ONNX artifacts"
    )
    inspect_parser.add_argument("onnx")
    inspect_parser.add_argument("--allow-unofficial", action="store_true")
    inspect_parser.add_argument("--skip-finite-check", action="store_true")
    inspect_parser.set_defaults(handler=_inspect)

    extract_parser = commands.add_parser(
        "extract", help="write normalized graph audit JSON"
    )
    extract_parser.add_argument("onnx")
    extract_parser.add_argument("output")
    extract_parser.add_argument("--weights-npz")
    extract_parser.add_argument("--allow-unofficial", action="store_true")
    extract_parser.add_argument("--skip-finite-check", action="store_true")
    extract_parser.set_defaults(handler=_extract)

    convert_parser = commands.add_parser(
        "convert", help="strictly convert a pinned official ONNX to a bundle"
    )
    convert_parser.add_argument("onnx")
    convert_parser.add_argument("output")
    convert_parser.add_argument(
        "--profile",
        choices=EXPORT_PROFILES,
        default=F32_REFERENCE_PROFILE,
        help="weight precision policy (default: %(default)s)",
    )
    convert_parser.add_argument(
        "--fold-channel-affine",
        action="store_true",
        help=(
            "fold safe conv -> channel-scale[/shift] chains into FP32 parameters; "
            "changes numerical accumulation order"
        ),
    )
    convert_parser.add_argument(
        "--fuse-channel-affine",
        action="store_true",
        help=(
            "fuse exact constant channel mul -> add chains into materialized "
            "channel-affine dispatches"
        ),
    )
    convert_parser.set_defaults(handler=_convert)

    synthetic_parser = commands.add_parser(
        "synthetic", help="write the small deterministic all-ops v1 fixture"
    )
    synthetic_parser.add_argument("output")
    synthetic_parser.add_argument(
        "--profile",
        choices=EXPORT_PROFILES,
        default=F32_REFERENCE_PROFILE,
        help="weight precision policy (default: %(default)s)",
    )
    synthetic_parser.set_defaults(handler=_synthetic)

    verify_parser = commands.add_parser(
        "verify-bundle", help="strictly verify a v1 bundle"
    )
    verify_parser.add_argument("bundle")
    verify_parser.set_defaults(handler=_verify_bundle)
    return root


def main(argv: list[str] | None = None) -> int:
    arguments = parser().parse_args(argv)
    try:
        return int(arguments.handler(arguments))
    except (BundleError, ExtractionError, PackingError, ProfileError, OSError) as error:
        print(f"depthart-pack: error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
