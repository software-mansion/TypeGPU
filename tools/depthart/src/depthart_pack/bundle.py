"""DepthART bundle v1 writer and independent strict Python validator."""

from __future__ import annotations

import json
import math
import re
import struct
import zlib
from collections.abc import Iterable, Mapping, Sequence
from copy import deepcopy
from dataclasses import dataclass
from hashlib import sha256
from typing import Any

MAGIC = b"DARTBND\0"
FORMAT_VERSION = 1
HEADER_BYTES = 48
ENDIAN_TAG = 0x04030201
MANIFEST_OFFSET = HEADER_BYTES
PAYLOAD_ALIGNMENT = 256
MAX_SECTION_BYTES = 128 * 1024 * 1024
BUNDLE_CRC_OFFSET = 36
HEADER = struct.Struct("<8s10I")

TOP_LEVEL_KEYS = frozenset(
    {
        "schema",
        "model",
        "precision",
        "provenance",
        "requiredFeatures",
        "optionalFeatures",
        "input",
        "output",
        "tensors",
        "slots",
        "dispatches",
        "weightSections",
    }
)
MODELS = frozenset(
    {
        "depthart-relative-s-448",
        "depthart-relative-b-448",
        "depthart-relative-l-448",
    }
)
PRECISIONS = frozenset({"f32-reference", "fp16-native"})
FEATURES = frozenset({"shader-f16", "subgroups", "packed-4x8-integer-dot-product"})
DTYPES = frozenset({"f32", "f16"})
ENCODINGS = frozenset({"plain"})
LAYOUTS = frozenset(
    {"raw", "nchw", "nhwc", "hwc4", "chw4", "c4", "o4i4-yx", "c4-yx", "direction-o4i4"}
)
OPS = frozenset(
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
ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$")
HEX8 = re.compile(r"^[0-9a-f]{8}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")


class BundleError(ValueError):
    pass


@dataclass(frozen=True)
class PayloadSection:
    id: str
    data: bytes
    kind: str = "weights"
    alignment: int = PAYLOAD_ALIGNMENT


@dataclass(frozen=True)
class ParsedBundle:
    manifest: dict[str, Any]
    payload_offset: int
    payload: memoryview
    sections: dict[str, memoryview]
    checksum: int


def align_up(value: int, alignment: int) -> int:
    if alignment <= 0 or alignment & (alignment - 1):
        raise BundleError(f"alignment must be a positive power of two, got {alignment}")
    return (value + alignment - 1) & -alignment


def crc32(data: bytes | bytearray | memoryview) -> int:
    return zlib.crc32(data) & 0xFFFFFFFF


def canonical_json(value: Mapping[str, Any]) -> bytes:
    try:
        text = json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        )
    except (TypeError, ValueError) as error:
        raise BundleError(f"manifest is not finite JSON: {error}") from error
    return text.encode("utf-8")


class BundleWriter:
    """Serialize an exact v1 manifest and aligned payload sections."""

    def __init__(self, manifest: Mapping[str, Any]) -> None:
        self.manifest = deepcopy(dict(manifest))
        self._sections: list[PayloadSection] = []

    def add_section(
        self,
        section_id: str,
        data: bytes | bytearray | memoryview,
        *,
        kind: str = "weights",
        alignment: int = PAYLOAD_ALIGNMENT,
    ) -> None:
        _id(section_id, "section id")
        if any(section.id == section_id for section in self._sections):
            raise BundleError(f"duplicate section id {section_id!r}")
        if kind not in {"weights", "constants"}:
            raise BundleError(f"unsupported section kind {kind!r}")
        if alignment < PAYLOAD_ALIGNMENT:
            raise BundleError(f"section alignment must be at least {PAYLOAD_ALIGNMENT}")
        align_up(0, alignment)
        raw = bytes(data)
        if not raw:
            raise BundleError("section data cannot be empty")
        padded = raw + bytes((-len(raw)) % 4)
        if len(padded) > MAX_SECTION_BYTES:
            raise BundleError(
                f"section {section_id!r} exceeds the {MAX_SECTION_BYTES}-byte "
                "guaranteed storage-binding limit"
            )
        self._sections.append(PayloadSection(section_id, padded, kind, alignment))

    def build(self, *, validate: bool = True) -> bytes:
        if not self._sections:
            raise BundleError("a v1 bundle requires at least one payload section")
        manifest = deepcopy(self.manifest)
        sections: list[dict[str, Any]] = []
        payload_length = 0
        for section in self._sections:
            offset = align_up(payload_length, section.alignment)
            sections.append(
                {
                    "id": section.id,
                    "kind": section.kind,
                    "byteOffset": offset,
                    "byteLength": len(section.data),
                    "alignment": section.alignment,
                    "crc32": f"{crc32(section.data):08x}",
                    "sha256": sha256(section.data).hexdigest(),
                }
            )
            payload_length = offset + len(section.data)
        manifest["weightSections"] = sections
        manifest_bytes = canonical_json(manifest)
        payload_offset = align_up(HEADER_BYTES + len(manifest_bytes), PAYLOAD_ALIGNMENT)
        bundle_length = payload_offset + payload_length
        manifest_checksum = crc32(manifest_bytes)
        header = HEADER.pack(
            MAGIC,
            FORMAT_VERSION,
            HEADER_BYTES,
            ENDIAN_TAG,
            MANIFEST_OFFSET,
            len(manifest_bytes),
            bundle_length,
            manifest_checksum,
            0,
            0,
            0,
        )
        output = bytearray(bundle_length)
        output[:HEADER_BYTES] = header
        output[HEADER_BYTES : HEADER_BYTES + len(manifest_bytes)] = manifest_bytes
        for section, record in zip(self._sections, sections, strict=True):
            start = payload_offset + int(record["byteOffset"])
            output[start : start + len(section.data)] = section.data
        checksum = crc32(output)
        struct.pack_into("<I", output, BUNDLE_CRC_OFFSET, checksum)
        result = bytes(output)
        if validate:
            parse_bundle(result)
        return result


def _object(
    value: Any, path: str, required: Iterable[str], optional: Iterable[str] = ()
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise BundleError(f"{path} must be an object")
    required_set = set(required)
    allowed = required_set | set(optional)
    unknown = set(value) - allowed
    missing = required_set - set(value)
    if unknown:
        raise BundleError(f"{path} has unknown keys: {sorted(unknown)}")
    if missing:
        raise BundleError(f"{path} is missing keys: {sorted(missing)}")
    return value


def _array(value: Any, path: str) -> list[Any]:
    if not isinstance(value, list):
        raise BundleError(f"{path} must be an array")
    return value


def _id(value: Any, path: str) -> str:
    if not isinstance(value, str) or ID_PATTERN.fullmatch(value) is None:
        raise BundleError(f"{path} is not a valid identifier")
    return value


def _positive_int(value: Any, path: str, *, allow_zero: bool = False) -> int:
    lower = 0 if allow_zero else 1
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or not lower <= value <= 0xFFFFFFFF
    ):
        qualifier = "non-negative" if allow_zero else "positive"
        raise BundleError(f"{path} must be a {qualifier} u32")
    return value


def _number(value: Any, path: str) -> float:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
    ):
        raise BundleError(f"{path} must be finite")
    return float(value)


def _enum(value: Any, choices: set[str] | frozenset[str], path: str) -> str:
    if not isinstance(value, str) or value not in choices:
        raise BundleError(f"{path} must be one of {sorted(choices)}")
    return value


def _shape(value: Any, path: str) -> tuple[int, ...]:
    values = _array(value, path)
    if not values or len(values) > 8:
        raise BundleError(f"{path} must contain 1..8 dimensions")
    shape = tuple(
        _positive_int(dim, f"{path}[{index}]") for index, dim in enumerate(values)
    )
    product = math.prod(shape)
    if product > 0xFFFFFFFF:
        raise BundleError(f"{path} element count exceeds u32")
    return shape


def _unique(
    items: Sequence[Mapping[str, Any]], path: str
) -> dict[str, Mapping[str, Any]]:
    result: dict[str, Mapping[str, Any]] = {}
    for index, item in enumerate(items):
        item_id = _id(item.get("id"), f"{path}[{index}].id")
        if item_id in result:
            raise BundleError(f"{path} has duplicate id {item_id!r}")
        result[item_id] = item
    return result


def _encoding(dtype: str, encoding: str, path: str) -> tuple[int, int]:
    if encoding != "plain":
        raise BundleError(f"{path}: unsupported encoding {encoding!r}")
    return ({"f32": 4, "f16": 2}[dtype], 1)


def _layout_capacity(shape: tuple[int, ...], layout: str, path: str) -> int | None:
    if layout == "raw":
        return None
    if layout in {"nchw", "nhwc"}:
        return math.prod(shape)
    if layout in {"hwc4", "chw4"}:
        if len(shape) != 4:
            raise BundleError(f"{path}: {layout} requires rank 4")
        n, channels, height, width = shape
        return n * height * width * align_up(channels, 4)
    if layout == "c4":
        if len(shape) != 1:
            raise BundleError(f"{path}: c4 requires rank 1")
        return align_up(shape[0], 4)
    if layout == "o4i4-yx":
        if len(shape) != 4:
            raise BundleError(f"{path}: o4i4-yx requires rank 4")
        outputs, inputs, height, width = shape
        return align_up(outputs, 4) * align_up(inputs, 4) * height * width
    if layout == "c4-yx":
        if len(shape) != 4 or shape[1] != 1:
            raise BundleError(f"{path}: c4-yx requires [C,1,H,W]")
        return align_up(shape[0], 4) * shape[2] * shape[3]
    if layout == "direction-o4i4":
        if len(shape) != 3:
            raise BundleError(f"{path}: direction-o4i4 requires rank 3")
        directions, outputs, inputs = shape
        return directions * align_up(outputs, 4) * align_up(inputs, 4)
    raise AssertionError(layout)


def _validate_params(op: str, value: Any, path: str) -> None:
    if op in {"conv2d", "depthwise-conv2d"}:
        params = _object(
            value,
            path,
            {
                "kernel",
                "stride",
                "padding",
                "groups",
                "activation",
                "weightPacking",
                "biasPacking",
            },
        )
        _size2(params["kernel"], f"{path}.kernel")
        _size2(params["stride"], f"{path}.stride")
        _padding4(params["padding"], f"{path}.padding")
        _positive_int(params["groups"], f"{path}.groups")
        _enum(
            params["activation"],
            frozenset({"none", "gelu", "silu", "relu"}),
            f"{path}.activation",
        )
        expected = "o4i4-yx" if op == "conv2d" else "c4-yx"
        if params["weightPacking"] != expected or params["biasPacking"] != "c4":
            raise BundleError(f"{path}: invalid {op} packing")
    elif op == "activation":
        params = _object(value, path, {"kind"})
        _enum(params["kind"], frozenset({"gelu", "silu", "relu"}), f"{path}.kind")
    elif op == "binary":
        params = _object(value, path, {"kind", "broadcast"})
        _enum(params["kind"], frozenset({"add", "sub", "mul"}), f"{path}.kind")
        _enum(
            params["broadcast"],
            frozenset({"none", "scalar", "channels", "spatial"}),
            f"{path}.broadcast",
        )
    elif op == "avg-pool2d":
        params = _object(
            value, path, {"kernel", "stride", "padding", "countIncludePad"}
        )
        _size2(params["kernel"], f"{path}.kernel")
        _size2(params["stride"], f"{path}.stride")
        _padding4(params["padding"], f"{path}.padding")
        if not isinstance(params["countIncludePad"], bool):
            raise BundleError(f"{path}.countIncludePad must be boolean")
    elif op == "resize2d":
        params = _object(value, path, {"mode", "coordinateMode", "size"})
        _enum(params["mode"], frozenset({"nearest", "bilinear"}), f"{path}.mode")
        _enum(
            params["coordinateMode"],
            frozenset({"asymmetric-floor", "half-pixel", "align-corners"}),
            f"{path}.coordinateMode",
        )
        _size2(params["size"], f"{path}.size")
    elif op == "layer-norm":
        params = _object(value, path, {"axis", "epsilon"})
        if (
            isinstance(params["axis"], bool)
            or not isinstance(params["axis"], int)
            or not -8 <= params["axis"] < 8
        ):
            raise BundleError(f"{path}.axis must be in [-8,7]")
        if _number(params["epsilon"], f"{path}.epsilon") <= 0:
            raise BundleError(f"{path}.epsilon must be positive")
    elif op == "scan-project":
        params = _object(
            value,
            path,
            {"directions", "stateSize", "dtRank", "lowChannels", "sequence"},
        )
        if params["directions"] != 4 or params["stateSize"] != 8:
            raise BundleError(
                f"{path}: only four directions/state size eight are supported"
            )
        _positive_int(params["dtRank"], f"{path}.dtRank")
        _positive_int(params["lowChannels"], f"{path}.lowChannels")
        sequence = _object(
            params["sequence"],
            f"{path}.sequence",
            {"rowMajor", "columnMajor", "reverse"},
        )
        if any(sequence[key] is not True for key in sequence):
            raise BundleError(f"{path}.sequence flags must all be true")
    elif op == "selective-scan":
        params = _object(
            value,
            path,
            {"directions", "stateSize", "length", "deltaSoftplus", "fp32Recurrence"},
        )
        if (
            params["directions"] != 4
            or params["stateSize"] != 8
            or params["deltaSoftplus"] is not True
            or params["fp32Recurrence"] is not True
        ):
            raise BundleError(f"{path}: unsupported selective scan configuration")
        _positive_int(params["length"], f"{path}.length")
    elif op == "scan-merge":
        params = _object(
            value,
            path,
            {"directions", "transposeColumnMajor", "reduction", "normalization"},
        )
        expected = {
            "directions": 4,
            "transposeColumnMajor": True,
            "reduction": "sum",
            "normalization": "none",
        }
        if params != expected:
            raise BundleError(f"{path}: unsupported scan merge configuration")
    elif op == "channel-split":
        params = _object(value, path, {"axis", "splitChannels"})
        if params["axis"] != 1 or isinstance(params["axis"], bool):
            raise BundleError(f"{path}.axis must be 1")
        channels = _array(params["splitChannels"], f"{path}.splitChannels")
        if len(channels) != 2:
            raise BundleError(f"{path}.splitChannels must have two values")
        for index, channel_count in enumerate(channels):
            count = _positive_int(channel_count, f"{path}.splitChannels[{index}]")
            if count % 4:
                raise BundleError(
                    f"{path}.splitChannels[{index}] must be HWC4 block-aligned"
                )
    elif op in {"channel-concat", "channel-affine"}:
        params = _object(value, path, {"axis"})
        if params["axis"] != 1 or isinstance(params["axis"], bool):
            raise BundleError(f"{path}.axis must be 1")


def _size2(value: Any, path: str) -> tuple[int, int]:
    items = _array(value, path)
    if len(items) != 2:
        raise BundleError(f"{path} must have two values")
    return (
        _positive_int(items[0], f"{path}[0]"),
        _positive_int(items[1], f"{path}[1]"),
    )


def _padding4(value: Any, path: str) -> tuple[int, int, int, int]:
    items = _array(value, path)
    if len(items) != 4:
        raise BundleError(f"{path} must have four values")
    return tuple(
        _positive_int(item, f"{path}[{index}]", allow_zero=True)
        for index, item in enumerate(items)
    )  # type: ignore[return-value]


def _validate_manifest(
    manifest: Any, section_views: Mapping[str, memoryview]
) -> dict[str, Any]:
    root = _object(manifest, "manifest", TOP_LEVEL_KEYS)
    if root["schema"] != "depthart.bundle.v1":
        raise BundleError("manifest.schema must be 'depthart.bundle.v1'")
    _enum(root["model"], MODELS, "manifest.model")
    precision = _enum(root["precision"], PRECISIONS, "manifest.precision")
    provenance = _object(
        root["provenance"],
        "manifest.provenance",
        {
            "sourceRepository",
            "sourceRevision",
            "sourceArtifact",
            "sourceSha256",
            "license",
            "converter",
        },
    )
    for key, value in provenance.items():
        if not isinstance(value, str) or not value:
            raise BundleError(f"manifest.provenance.{key} must be a non-empty string")
    if HEX64.fullmatch(provenance["sourceSha256"]) is None:
        raise BundleError("manifest.provenance.sourceSha256 must be lowercase SHA-256")

    required = [
        _enum(value, FEATURES, "manifest.requiredFeatures")
        for value in _array(root["requiredFeatures"], "manifest.requiredFeatures")
    ]
    optional = [
        _enum(value, FEATURES, "manifest.optionalFeatures")
        for value in _array(root["optionalFeatures"], "manifest.optionalFeatures")
    ]
    if (
        len(set(required)) != len(required)
        or len(set(optional)) != len(optional)
        or set(required) & set(optional)
    ):
        raise BundleError("feature arrays must be unique and disjoint")
    if precision == "fp16-native" and "shader-f16" not in required:
        raise BundleError("fp16-native requires shader-f16")

    slots = _array(root["slots"], "manifest.slots")
    parsed_slots: list[dict[str, Any]] = []
    for index, value in enumerate(slots):
        slot = _object(
            value, f"manifest.slots[{index}]", {"id", "byteLength", "alignment"}
        )
        alignment = _positive_int(
            slot["alignment"], f"manifest.slots[{index}].alignment"
        )
        length = _positive_int(
            slot["byteLength"], f"manifest.slots[{index}].byteLength"
        )
        if alignment < 4 or alignment & (alignment - 1) or length % alignment:
            raise BundleError(f"manifest.slots[{index}] has invalid alignment")
        parsed_slots.append(slot)
    slot_by_id = _unique(parsed_slots, "manifest.slots")

    tensors = _array(root["tensors"], "manifest.tensors")
    parsed_tensors: list[dict[str, Any]] = []
    section_ranges: dict[str, list[tuple[int, int, str]]] = {}
    for index, value in enumerate(tensors):
        path = f"manifest.tensors[{index}]"
        tensor = _object(
            value,
            path,
            {
                "id",
                "shape",
                "storageShape",
                "dtype",
                "encoding",
                "layout",
                "byteLength",
                "storage",
            },
        )
        _id(tensor["id"], f"{path}.id")
        shape = _shape(tensor["shape"], f"{path}.shape")
        storage_shape = _shape(tensor["storageShape"], f"{path}.storageShape")
        dtype = _enum(tensor["dtype"], DTYPES, f"{path}.dtype")
        encoding = _enum(tensor["encoding"], ENCODINGS, f"{path}.encoding")
        layout = _enum(tensor["layout"], LAYOUTS, f"{path}.layout")
        unit_bytes, values_per_unit = _encoding(dtype, encoding, f"{path}.encoding")
        byte_length = _positive_int(tensor["byteLength"], f"{path}.byteLength")
        if byte_length != math.prod(storage_shape) * unit_bytes:
            raise BundleError(f"{path}.byteLength does not match storageShape/encoding")
        capacity = math.prod(storage_shape) * values_per_unit
        if capacity < math.prod(shape):
            raise BundleError(f"{path}.storageShape is too small")
        expected_capacity = _layout_capacity(shape, layout, path)
        if expected_capacity is not None and capacity != expected_capacity:
            raise BundleError(
                f"{path}.storageShape capacity {capacity} != {expected_capacity}"
            )
        storage = _object(
            tensor["storage"],
            f"{path}.storage",
            {"kind"},
            {"slotId", "sectionId", "byteOffset"},
        )
        kind = _enum(
            storage["kind"],
            frozenset({"input", "output", "slot", "section"}),
            f"{path}.storage.kind",
        )
        expected_keys = {
            "input": {"kind"},
            "output": {"kind"},
            "slot": {"kind", "slotId"},
            "section": {"kind", "sectionId", "byteOffset"},
        }[kind]
        if set(storage) != expected_keys:
            raise BundleError(f"{path}.storage has invalid fields for {kind}")
        if kind == "slot":
            slot_id = _id(storage["slotId"], f"{path}.storage.slotId")
            slot = slot_by_id.get(slot_id)
            if slot is None or byte_length > int(slot["byteLength"]):
                raise BundleError(f"{path} exceeds unknown/small slot {slot_id!r}")
        elif kind == "section":
            section_id = _id(storage["sectionId"], f"{path}.storage.sectionId")
            if section_id not in section_views:
                raise BundleError(f"{path} references unknown section {section_id!r}")
            offset = _positive_int(
                storage["byteOffset"], f"{path}.storage.byteOffset", allow_zero=True
            )
            if offset % unit_bytes or offset + byte_length > len(
                section_views[section_id]
            ):
                raise BundleError(f"{path} has an invalid section range")
            section_ranges.setdefault(section_id, []).append(
                (offset, offset + byte_length, tensor["id"])
            )
            raw = section_views[section_id][offset : offset + byte_length]
            if dtype == "f32" and encoding == "plain":
                values = struct.iter_unpack("<f", raw)
                if any(not math.isfinite(item[0]) for item in values):
                    raise BundleError(f"{path} contains non-finite f32")
            elif dtype == "f16" and encoding == "plain":
                values = struct.iter_unpack("<H", raw)
                if any((item[0] & 0x7C00) == 0x7C00 for item in values):
                    raise BundleError(f"{path} contains non-finite f16")
        parsed_tensors.append(tensor)
    tensor_by_id = _unique(parsed_tensors, "manifest.tensors")
    for section_id, ranges in section_ranges.items():
        previous_end = 0
        for start, end, tensor_id in sorted(ranges):
            if start < previous_end:
                raise BundleError(
                    f"tensor {tensor_id!r} overlaps in section {section_id!r}"
                )
            previous_end = end

    if precision == "fp16-native":
        native_count = 0
        for index, tensor in enumerate(parsed_tensors):
            pair = (tensor["dtype"], tensor["encoding"])
            if pair == ("f32", "plain"):
                continue
            if pair != ("f16", "plain"):
                raise BundleError(
                    f"manifest.tensors[{index}]: fp16-native permits only plain f16 "
                    "tensors mixed with plain f32"
                )
            native_count += 1
        if not native_count:
            raise BundleError("fp16-native bundle contains no native f16 tensors")

    input_object = _object(
        root["input"],
        "manifest.input",
        {"kind", "tensorId", "colorSpace", "resize", "mean", "std"},
    )
    _enum(
        input_object["kind"],
        frozenset({"normalized-rgb-tensor", "srgb-image"}),
        "manifest.input.kind",
    )
    if input_object["colorSpace"] != "rgb" or input_object["resize"] != "cubic-warp":
        raise BundleError("manifest.input has unsupported color/resize")
    for key in ("mean", "std"):
        values = _array(input_object[key], f"manifest.input.{key}")
        if len(values) != 3 or any(
            not math.isfinite(_number(value, key)) for value in values
        ):
            raise BundleError(f"manifest.input.{key} must contain three finite values")
    if any(float(value) <= 0 for value in input_object["std"]):
        raise BundleError("manifest.input.std must be positive")
    output_object = _object(
        root["output"],
        "manifest.output",
        {"kind", "tensorId", "resize"},
        {"polarity"},
    )
    if (
        output_object["kind"] != "relative-disparity"
        or output_object["resize"] != "bilinear-align-corners"
    ):
        raise BundleError("manifest.output has unsupported semantics")
    _enum(
        output_object.get("polarity", "direct"),
        frozenset({"direct", "inverted"}),
        "manifest.output.polarity",
    )
    input_id = _id(input_object["tensorId"], "manifest.input.tensorId")
    output_id = _id(output_object["tensorId"], "manifest.output.tensorId")
    input_tensor = tensor_by_id.get(input_id)
    output_tensor = tensor_by_id.get(output_id)
    if input_tensor is None or output_tensor is None:
        raise BundleError("I/O tensor reference is missing")
    if input_tensor["storage"] != {"kind": "input"} or output_tensor["storage"] != {
        "kind": "output"
    }:
        raise BundleError("I/O tensors must use their unique external storage")
    if input_tensor["shape"] != [1, 3, 448, 448] or output_tensor["shape"] != [
        1,
        1,
        448,
        448,
    ]:
        raise BundleError("v1 I/O tensors must have fixed 448 shapes")
    for tensor, name in ((input_tensor, "input"), (output_tensor, "output")):
        if (
            tensor["dtype"] != "f32"
            or tensor["encoding"] != "plain"
            or tensor["layout"] != "hwc4"
        ):
            raise BundleError(f"v1 {name} must be plain-f32 HWC4")

    dispatches = _array(root["dispatches"], "manifest.dispatches")
    parsed_dispatches: list[dict[str, Any]] = []
    arities = {
        "conv2d": (3, 1),
        "depthwise-conv2d": (3, 1),
        "activation": (1, 1),
        "binary": (2, 1),
        "avg-pool2d": (1, 1),
        "resize2d": (1, 1),
        "layer-norm": (3, 1),
        "scan-project": (3, 3),
        "selective-scan": (7, 1),
        "scan-merge": (1, 1),
        "channel-split": (1, 2),
        "channel-concat": (2, 1),
        "channel-affine": (3, 1),
    }
    for index, value in enumerate(dispatches):
        path = f"manifest.dispatches[{index}]"
        dispatch = _object(
            value, path, {"id", "op", "inputs", "outputs", "workgroups", "params"}
        )
        _id(dispatch["id"], f"{path}.id")
        op = _enum(dispatch["op"], OPS, f"{path}.op")
        inputs = _array(dispatch["inputs"], f"{path}.inputs")
        outputs = _array(dispatch["outputs"], f"{path}.outputs")
        if (len(inputs), len(outputs)) != arities[op]:
            raise BundleError(f"{path} has wrong arity for {op}")
        for side, ids in (("inputs", inputs), ("outputs", outputs)):
            for position, tensor_id in enumerate(ids):
                _id(tensor_id, f"{path}.{side}[{position}]")
                if tensor_id not in tensor_by_id:
                    raise BundleError(f"{path} references unknown tensor {tensor_id!r}")
        if len(set(outputs)) != len(outputs):
            raise BundleError(f"{path}.outputs contains duplicates")
        workgroups = _array(dispatch["workgroups"], f"{path}.workgroups")
        if len(workgroups) != 3:
            raise BundleError(f"{path}.workgroups must have three values")
        for position, value in enumerate(workgroups):
            _positive_int(value, f"{path}.workgroups[{position}]")
        _validate_params(op, dispatch["params"], f"{path}.params")
        if op in {"channel-split", "channel-concat"}:
            referenced = [tensor_by_id[tensor_id] for tensor_id in (*inputs, *outputs)]
            if any(
                tensor["layout"] != "hwc4"
                or tensor["dtype"] != "f32"
                or tensor["encoding"] != "plain"
                or len(tensor["shape"]) != 4
                or tensor["shape"][0] != 1
                for tensor in referenced
            ):
                raise BundleError(
                    f"{path}: channel copies require plain-f32 HWC4 tensors"
                )
            if op == "channel-split":
                source = tensor_by_id[inputs[0]]["shape"]
                destinations = [
                    tensor_by_id[tensor_id]["shape"] for tensor_id in outputs
                ]
                channels = dispatch["params"]["splitChannels"]
                if (
                    channels != [shape[1] for shape in destinations]
                    or sum(channels) != source[1]
                    or any(
                        shape[0:1] + shape[2:] != source[0:1] + source[2:]
                        for shape in destinations
                    )
                ):
                    raise BundleError(f"{path}: channel split shapes do not match")
            else:
                sources = [tensor_by_id[tensor_id]["shape"] for tensor_id in inputs]
                destination = tensor_by_id[outputs[0]]["shape"]
                if (
                    any(shape[1] % 4 for shape in sources)
                    or sum(shape[1] for shape in sources) != destination[1]
                    or any(
                        shape[0:1] + shape[2:] != destination[0:1] + destination[2:]
                        for shape in sources
                    )
                ):
                    raise BundleError(f"{path}: channel concat shapes do not match")
        elif op == "channel-affine":
            source = tensor_by_id[inputs[0]]
            scale = tensor_by_id[inputs[1]]
            bias = tensor_by_id[inputs[2]]
            destination = tensor_by_id[outputs[0]]
            if any(
                tensor["dtype"] != "f32" or tensor["encoding"] != "plain"
                for tensor in (source, scale, bias, destination)
            ):
                raise BundleError(f"{path}: channel affine requires plain-f32 tensors")
            if (
                source["layout"] != "hwc4"
                or destination["layout"] != "hwc4"
                or len(source["shape"]) != 4
                or source["shape"][0] != 1
                or destination["shape"] != source["shape"]
                or scale["layout"] != "c4"
                or bias["layout"] != "c4"
                or scale["shape"] != [source["shape"][1]]
                or bias["shape"] != scale["shape"]
                or scale["storage"]["kind"] != "section"
                or bias["storage"]["kind"] != "section"
            ):
                raise BundleError(f"{path}: channel affine shapes/layouts do not match")
        parsed_dispatches.append(dispatch)
    _unique(parsed_dispatches, "manifest.dispatches")

    available = {
        tensor["id"]
        for tensor in parsed_tensors
        if tensor["storage"]["kind"] in {"input", "section"}
    }
    current_slot: dict[str, str] = {}
    produced: set[str] = set()
    read: set[str] = set()
    for index, dispatch in enumerate(parsed_dispatches):
        input_slots: set[str] = set()
        for tensor_id in dispatch["inputs"]:
            tensor = tensor_by_id[tensor_id]
            if tensor_id not in available:
                raise BundleError(
                    f"dispatch {index} reads {tensor_id!r} before production"
                )
            storage = tensor["storage"]
            if storage["kind"] == "output":
                raise BundleError("public output cannot be read")
            if storage["kind"] == "slot":
                if current_slot.get(storage["slotId"]) != tensor_id:
                    raise BundleError(
                        f"dispatch {index} reads overwritten tensor {tensor_id!r}"
                    )
                input_slots.add(storage["slotId"])
            read.add(tensor_id)
        output_slots: set[str] = set()
        for tensor_id in dispatch["outputs"]:
            tensor = tensor_by_id[tensor_id]
            if tensor_id in available or tensor_id in produced:
                raise BundleError(
                    f"dispatch {index} produces {tensor_id!r} more than once"
                )
            storage = tensor["storage"]
            if storage["kind"] in {"input", "section"}:
                raise BundleError(
                    f"dispatch {index} writes immutable tensor {tensor_id!r}"
                )
            if storage["kind"] == "slot":
                slot = storage["slotId"]
                if slot in input_slots or slot in output_slots:
                    raise BundleError(f"dispatch {index} has unsafe slot aliasing")
                output_slots.add(slot)
                previous = current_slot.get(slot)
                if previous is not None:
                    available.discard(previous)
                current_slot[slot] = tensor_id
            elif tensor_id != output_id:
                raise BundleError(f"unexpected output-backed tensor {tensor_id!r}")
            available.add(tensor_id)
            produced.add(tensor_id)
    if input_id not in read or output_id not in produced:
        raise BundleError("graph does not connect the public input/output")
    for tensor in parsed_tensors:
        kind = tensor["storage"]["kind"]
        if kind == "section" and tensor["id"] not in read:
            raise BundleError(f"section tensor {tensor['id']!r} is unused")
        if kind == "slot" and (
            tensor["id"] not in produced or tensor["id"] not in read
        ):
            raise BundleError(f"slot tensor {tensor['id']!r} is dead")
    used_slots = {
        tensor["storage"]["slotId"]
        for tensor in parsed_tensors
        if tensor["storage"]["kind"] == "slot"
    }
    if used_slots != set(slot_by_id):
        raise BundleError("all declared slots must be used")
    used_sections = {
        tensor["storage"]["sectionId"]
        for tensor in parsed_tensors
        if tensor["storage"]["kind"] == "section"
    }
    if used_sections != set(section_views):
        raise BundleError("all declared sections must be used")
    return root


def parse_bundle(data: bytes | bytearray | memoryview) -> ParsedBundle:
    raw = bytes(data)
    if len(raw) < HEADER_BYTES:
        raise BundleError("bundle is shorter than its v1 header")
    fields = HEADER.unpack_from(raw)
    (
        magic,
        version,
        header_bytes,
        endian,
        manifest_offset,
        manifest_bytes,
        bundle_bytes,
        manifest_crc,
        bundle_crc,
        flags,
        reserved,
    ) = fields
    expected = (MAGIC, FORMAT_VERSION, HEADER_BYTES, ENDIAN_TAG, MANIFEST_OFFSET)
    if (magic, version, header_bytes, endian, manifest_offset) != expected:
        raise BundleError("invalid DepthART bundle v1 header")
    if flags != 0 or reserved != 0:
        raise BundleError("v1 header flags/reserved must be zero")
    if bundle_bytes != len(raw):
        raise BundleError(f"header bundle length {bundle_bytes} != {len(raw)}")
    manifest_end = manifest_offset + manifest_bytes
    if manifest_end > len(raw):
        raise BundleError("manifest is truncated")
    encoded_manifest = raw[manifest_offset:manifest_end]
    if crc32(encoded_manifest) != manifest_crc:
        raise BundleError("manifest CRC32 mismatch")
    zeroed = bytearray(raw)
    zeroed[BUNDLE_CRC_OFFSET : BUNDLE_CRC_OFFSET + 4] = b"\0\0\0\0"
    if crc32(zeroed) != bundle_crc:
        raise BundleError("whole-bundle CRC32 mismatch")
    try:
        manifest = json.loads(encoded_manifest.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise BundleError(f"invalid UTF-8 JSON manifest: {error}") from error

    payload_offset = align_up(manifest_end, PAYLOAD_ALIGNMENT)
    if payload_offset >= len(raw) or any(raw[manifest_end:payload_offset]):
        raise BundleError("payload alignment padding is missing/non-zero")
    root = _object(manifest, "manifest", TOP_LEVEL_KEYS)
    raw_sections = _array(root["weightSections"], "manifest.weightSections")
    if not raw_sections:
        raise BundleError("manifest.weightSections cannot be empty")
    section_records: list[dict[str, Any]] = []
    section_views: dict[str, memoryview] = {}
    previous_end = 0
    for index, value in enumerate(raw_sections):
        path = f"manifest.weightSections[{index}]"
        section = _object(
            value,
            path,
            {"id", "kind", "byteOffset", "byteLength", "alignment", "crc32"},
            {"sha256"},
        )
        section_id = _id(section["id"], f"{path}.id")
        if section_id in section_views:
            raise BundleError(f"duplicate section id {section_id!r}")
        _enum(section["kind"], frozenset({"weights", "constants"}), f"{path}.kind")
        offset = _positive_int(
            section["byteOffset"], f"{path}.byteOffset", allow_zero=True
        )
        length = _positive_int(section["byteLength"], f"{path}.byteLength")
        alignment = _positive_int(section["alignment"], f"{path}.alignment")
        if length > MAX_SECTION_BYTES:
            raise BundleError(
                f"{path} exceeds the {MAX_SECTION_BYTES}-byte guaranteed "
                "storage-binding limit"
            )
        if (
            alignment < PAYLOAD_ALIGNMENT
            or alignment & (alignment - 1)
            or offset % alignment
            or length % 4
        ):
            raise BundleError(f"{path} has invalid alignment")
        if index == 0 and offset != 0:
            raise BundleError("first section must start at payload offset zero")
        if offset < previous_end or payload_offset + offset + length > len(raw):
            raise BundleError(f"{path} overlaps or exceeds the bundle")
        if any(raw[payload_offset + previous_end : payload_offset + offset]):
            raise BundleError(f"non-zero padding before {section_id!r}")
        view = memoryview(raw)[
            payload_offset + offset : payload_offset + offset + length
        ]
        checksum = section["crc32"]
        if (
            not isinstance(checksum, str)
            or HEX8.fullmatch(checksum) is None
            or f"{crc32(view):08x}" != checksum
        ):
            raise BundleError(f"{path}.crc32 mismatch/format error")
        digest = section.get("sha256")
        if digest is not None and (
            not isinstance(digest, str)
            or HEX64.fullmatch(digest) is None
            or sha256(view).hexdigest() != digest
        ):
            raise BundleError(f"{path}.sha256 mismatch/format error")
        section_views[section_id] = view
        section_records.append(section)
        previous_end = offset + length
    if payload_offset + previous_end != len(raw):
        raise BundleError("payload does not end at bundle end")
    validated = _validate_manifest(manifest, section_views)
    return ParsedBundle(
        validated,
        payload_offset,
        memoryview(raw)[payload_offset:],
        section_views,
        bundle_crc,
    )
