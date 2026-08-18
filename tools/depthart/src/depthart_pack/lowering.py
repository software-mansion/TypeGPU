"""Fail-closed lowering of the fixed official graphs' dynamic view patterns."""

from __future__ import annotations

from hashlib import sha256

import numpy as np

from .fuse import DepthwiseBranch, fold_layer_scale, reparameterize_depthwise
from .graph import (
    ConstantRecord,
    DispatchRecord,
    ExtractionError,
    NormalizedGraph,
    TensorRecord,
    ViewRecord,
    _topologically_order,
)
from .profile import variant_for_model


def _constant_record(
    name: str, value: np.ndarray
) -> tuple[TensorRecord, ConstantRecord]:
    array = np.ascontiguousarray(value, dtype=np.float32)
    data = array.tobytes(order="C")
    tensor = TensorRecord(
        id=name,
        shape=tuple(int(dim) for dim in array.shape),
        dtype="f32",
        layout="raw",
        kind="weight",
        source_name=None,
    )
    constant = ConstantRecord(
        id=name,
        shape=tensor.shape,
        dtype="f32",
        byte_length=len(data),
        sha256=sha256(data).hexdigest(),
        generated=True,
    )
    return tensor, constant


def _channel_shape(shape: tuple[int, ...], context: str) -> tuple[int, int, int, int]:
    if len(shape) != 4 or shape[0] != 1:
        raise ExtractionError(
            f"{context}: channel view must be batch-one NCHW, got {shape}"
        )
    return shape  # type: ignore[return-value]


def _alias_post_scan_views(
    views: list[ViewRecord],
    dispatches: list[DispatchRecord],
    tensors: dict[str, TensorRecord],
) -> tuple[dict[str, str], set[str], list[ViewRecord]]:
    by_input = {view.inputs[0]: view for view in views if len(view.inputs) == 1}
    consumers: dict[str, list[str]] = {}
    for view in views:
        for tensor_id in view.inputs:
            consumers.setdefault(tensor_id, []).append(view.id)
    for dispatch in dispatches:
        for tensor_id in dispatch.inputs:
            consumers.setdefault(tensor_id, []).append(dispatch.id)
    consumed: set[str] = set()
    aliases: dict[str, str] = {}
    removed_outputs: set[str] = set()

    for reshape in views:
        if reshape.kind != "reshape-view" or reshape.id in consumed:
            continue
        if len(reshape.inputs) != 1 or len(reshape.outputs) != 1:
            continue
        cast = by_input.get(reshape.outputs[0])
        if cast is None or cast.kind != "reinterpret-or-convert":
            continue
        transpose = by_input.get(cast.outputs[0])
        if transpose is None or transpose.kind != "transpose-view":
            continue
        if consumers.get(reshape.outputs[0]) != [cast.id] or consumers.get(
            cast.outputs[0]
        ) != [transpose.id]:
            raise ExtractionError(
                f"{reshape.id}: post-scan intermediates escape their triplet"
            )
        source_shape = _channel_shape(reshape.input_shapes[0], reshape.id)
        triplet_tensors = (
            *reshape.inputs,
            *reshape.outputs,
            *cast.outputs,
            *transpose.outputs,
        )
        if (
            reshape.output_shapes[0]
            != (source_shape[0], source_shape[2], source_shape[3], source_shape[1])
            or cast.input_shapes != reshape.output_shapes
            or cast.output_shapes != reshape.output_shapes
            or cast.params != {"to": 1}
            or transpose.input_shapes != cast.output_shapes
            or transpose.params != {"perm": [0, 3, 1, 2]}
            or transpose.output_shapes[0] != source_shape
            or any(
                tensor_id not in tensors or tensors[tensor_id].dtype != "f32"
                for tensor_id in triplet_tensors
            )
        ):
            raise ExtractionError(f"{reshape.id}: unsupported post-scan view triplet")
        source = reshape.inputs[0]
        for output in (*reshape.outputs, *cast.outputs, *transpose.outputs):
            aliases[output] = source
            removed_outputs.add(output)
        consumed.update((reshape.id, cast.id, transpose.id))

    remaining = [view for view in views if view.id not in consumed]
    return aliases, removed_outputs, remaining


def _resolve_alias(name: str, aliases: dict[str, str]) -> str:
    seen: set[str] = set()
    while name in aliases:
        if name in seen:
            raise ExtractionError(f"view alias cycle at {name!r}")
        seen.add(name)
        name = aliases[name]
    return name


def lower_dynamic_views(graph: NormalizedGraph) -> NormalizedGraph:
    """Lower all view records known to the pinned DepthART 448 graphs.

    Channel splits/concats become explicit HWC4 copy dispatches. The post-scan
    NCHW->NHWC->NCHW triplet is storage-neutral because scan-merge/layer-norm
    already produce canonical runtime HWC4 with logical NCHW shape. No virtual
    view is ever represented as an untracked slot alias.
    """

    aliases, removed_outputs, views = _alias_post_scan_views(
        list(graph.views), list(graph.dispatches), graph.tensors
    )
    tensors = {
        name: record
        for name, record in graph.tensors.items()
        if name not in removed_outputs
    }
    constants = dict(graph.constants)
    constant_values = dict(graph.constant_values)
    dispatches = [
        DispatchRecord(
            id=dispatch.id,
            op=dispatch.op,
            inputs=tuple(_resolve_alias(value, aliases) for value in dispatch.inputs),
            outputs=dispatch.outputs,
            output_shapes=dispatch.output_shapes,
            params=dict(dispatch.params),
        )
        for dispatch in graph.dispatches
    ]

    rewritten_views: list[ViewRecord] = []
    for view in views:
        rewritten_views.append(
            ViewRecord(
                id=view.id,
                kind=view.kind,
                inputs=tuple(_resolve_alias(value, aliases) for value in view.inputs),
                outputs=view.outputs,
                input_shapes=view.input_shapes,
                output_shapes=view.output_shapes,
                params=dict(view.params),
            )
        )

    for view in rewritten_views:
        if view.kind == "virtual-split":
            if len(view.inputs) != 1 or len(view.outputs) != 2:
                raise ExtractionError(f"{view.id}: unsupported split topology")
            _, input_channels, input_height, input_width = _channel_shape(
                view.input_shapes[0], view.id
            )
            split_channels: list[int] = []
            for output_shape in view.output_shapes:
                _, output_channels, height, width = _channel_shape(
                    output_shape, view.id
                )
                if (height, width) != (input_height, input_width):
                    raise ExtractionError(f"{view.id}: split changes spatial shape")
                if output_channels % 4:
                    raise ExtractionError(f"{view.id}: split is not HWC4 block-aligned")
                split_channels.append(output_channels)
            if sum(split_channels) != input_channels:
                raise ExtractionError(
                    f"{view.id}: split outputs cover {sum(split_channels)}/{input_channels} channels"
                )
            expected_params = {
                "axis": 1,
                "constantInputs": {"1": split_channels},
            }
            if view.params != expected_params:
                raise ExtractionError(
                    f"{view.id}: unsupported split metadata {view.params!r}"
                )
            dispatches.append(
                DispatchRecord(
                    id=view.id,
                    op="channel-split",
                    inputs=view.inputs,
                    outputs=view.outputs,
                    output_shapes=view.output_shapes,
                    params={"axis": 1, "splitChannels": split_channels},
                )
            )
            continue

        if view.kind == "virtual-concat":
            if len(view.outputs) != 1 or len(view.inputs) != 2:
                raise ExtractionError(f"{view.id}: unsupported concat topology")
            output_shape = view.output_shapes[0]
            _, output_channels, output_height, output_width = _channel_shape(
                output_shape, view.id
            )
            input_channels_total = 0
            for input_shape in view.input_shapes:
                _, input_channels, height, width = _channel_shape(input_shape, view.id)
                if (height, width) != (output_height, output_width):
                    raise ExtractionError(f"{view.id}: concat changes spatial shape")
                if input_channels % 4:
                    raise ExtractionError(
                        f"{view.id}: concat is not HWC4 block-aligned"
                    )
                input_channels_total += input_channels
            if input_channels_total != output_channels:
                raise ExtractionError(
                    f"{view.id}: concat inputs cover {input_channels_total}/{output_channels} channels"
                )
            if view.params != {"axis": 1}:
                raise ExtractionError(
                    f"{view.id}: unsupported concat metadata {view.params!r}"
                )
            dispatches.append(
                DispatchRecord(
                    id=view.id,
                    op="channel-concat",
                    inputs=view.inputs,
                    outputs=view.outputs,
                    output_shapes=view.output_shapes,
                    params={"axis": 1},
                )
            )
            continue

        raise ExtractionError(f"{view.id}: unhandled dynamic view kind {view.kind!r}")

    lowered = NormalizedGraph(
        model=graph.model,
        source_sha256=graph.source_sha256,
        input_id=graph.input_id,
        output_id=graph.output_id,
        tensors=tensors,
        constants=constants,
        views=[],
        dispatches=_topologically_order(dispatches, []),
        scans=graph.scans,
        constant_values=constant_values,
    )
    audit_lowered_graph(lowered)
    return lowered


def audit_lowered_graph(graph: NormalizedGraph) -> None:
    if graph.views:
        raise ExtractionError(f"{len(graph.views)} dynamic view records remain")
    produced = {output for dispatch in graph.dispatches for output in dispatch.outputs}
    if len(produced) != sum(len(dispatch.outputs) for dispatch in graph.dispatches):
        raise ExtractionError("lowered graph contains a tensor with multiple producers")
    for dispatch in graph.dispatches:
        for tensor_id in (*dispatch.inputs, *dispatch.outputs):
            if tensor_id not in graph.tensors:
                raise ExtractionError(
                    f"{dispatch.id}: tensor {tensor_id!r} is missing from the tensor table"
                )
        if dispatch.op in {"conv2d", "depthwise-conv2d"} and len(dispatch.inputs) != 3:
            raise ExtractionError(
                f"{dispatch.id}: convolution does not have three inputs"
            )


def fold_reparameterized_depthwise(graph: NormalizedGraph) -> NormalizedGraph:
    """Fold every official main+1x1+identity+outer-affine depthwise motif."""

    expected_motifs = variant_for_model(graph.model).reparameterized_depthwise_motifs
    dispatches = list(graph.dispatches)
    producer = {
        output: dispatch for dispatch in dispatches for output in dispatch.outputs
    }
    consumers: dict[str, list[DispatchRecord]] = {}
    for dispatch in dispatches:
        for tensor_id in dispatch.inputs:
            consumers.setdefault(tensor_id, []).append(dispatch)
    tensors = dict(graph.tensors)
    constants = dict(graph.constants)
    constant_values = dict(graph.constant_values)
    removed: set[str] = set()
    replacements: list[DispatchRecord] = []

    def only_consumer(tensor_id: str, context: str) -> DispatchRecord:
        uses = consumers.get(tensor_id, [])
        if len(uses) != 1:
            raise ExtractionError(
                f"{context}: expected one consumer of {tensor_id!r}, got {len(uses)}"
            )
        return uses[0]

    def other_input(dispatch: DispatchRecord, tensor_id: str, context: str) -> str:
        if len(dispatch.inputs) != 2 or tensor_id not in dispatch.inputs:
            raise ExtractionError(
                f"{context}: malformed binary inputs {dispatch.inputs}"
            )
        return (
            dispatch.inputs[1]
            if dispatch.inputs[0] == tensor_id
            else dispatch.inputs[0]
        )

    candidates = [
        dispatch
        for dispatch in dispatches
        if dispatch.op == "depthwise-conv2d" and dispatch.params.get("kernel") == [1, 1]
    ]
    for motif_index, point in enumerate(candidates):
        if point.id in removed:
            continue
        source, point_weight_id, point_bias_id = point.inputs
        add_branches = only_consumer(point.outputs[0], point.id)
        if add_branches.op != "binary" or add_branches.params != {
            "kind": "add",
            "broadcast": "none",
        }:
            raise ExtractionError(
                f"{point.id}: point branch is not followed by plain add"
            )
        main_output = other_input(add_branches, point.outputs[0], point.id)
        main = producer.get(main_output)
        if (
            main is None
            or main.op != "depthwise-conv2d"
            or main.inputs[0] != source
            or main.params.get("kernel") == [1, 1]
        ):
            raise ExtractionError(
                f"{point.id}: cannot identify supported main depthwise branch"
            )
        if only_consumer(main.outputs[0], point.id).id != add_branches.id:
            raise ExtractionError(f"{point.id}: main branch has an unexpected consumer")

        add_identity = only_consumer(add_branches.outputs[0], point.id)
        if (
            add_identity.op != "binary"
            or add_identity.params != {"kind": "add", "broadcast": "none"}
            or other_input(add_identity, add_branches.outputs[0], point.id) != source
        ):
            raise ExtractionError(f"{point.id}: missing identity addition")
        multiply = only_consumer(add_identity.outputs[0], point.id)
        if multiply.op != "binary" or multiply.params != {
            "kind": "mul",
            "broadcast": "channels",
        }:
            raise ExtractionError(f"{point.id}: missing outer affine multiply")
        scale_id = other_input(multiply, add_identity.outputs[0], point.id)
        add_shift = only_consumer(multiply.outputs[0], point.id)
        if add_shift.op != "binary" or add_shift.params != {
            "kind": "add",
            "broadcast": "channels",
        }:
            raise ExtractionError(f"{point.id}: missing outer affine shift")
        shift_id = other_input(add_shift, multiply.outputs[0], point.id)

        main_weight = constant_values[main.inputs[1]]
        main_bias = constant_values[main.inputs[2]]
        point_weight = constant_values[point_weight_id]
        point_bias = constant_values[point_bias_id]
        scale = constant_values[scale_id]
        shift = constant_values[shift_id]
        channels = int(point_weight.shape[0])
        if (
            main.params.get("groups") != channels
            or point.params.get("groups") != channels
            or scale.shape != (channels,)
            or shift.shape != (channels,)
        ):
            raise ExtractionError(
                f"{point.id}: inconsistent depthwise channel metadata"
            )
        fused_weight, fused_bias = reparameterize_depthwise(
            [
                DepthwiseBranch(main_weight, main_bias),
                DepthwiseBranch(point_weight, point_bias),
            ],
            channels,
            identity=True,
            target_kernel=tuple(int(value) for value in main_weight.shape[-2:]),
        )
        fused_weight = np.ascontiguousarray(
            fused_weight * scale[:, None, None, None], dtype=np.float32
        )
        fused_bias = np.ascontiguousarray(fused_bias * scale + shift, dtype=np.float32)
        weight_id = f"generated/reparam/{motif_index}/weight"
        bias_id = f"generated/reparam/{motif_index}/bias"
        for tensor_id, value in ((weight_id, fused_weight), (bias_id, fused_bias)):
            tensor, constant = _constant_record(tensor_id, value)
            tensors[tensor_id] = tensor
            constants[tensor_id] = constant
            constant_values[tensor_id] = value

        replacements.append(
            DispatchRecord(
                id=f"generated/reparam/{motif_index}",
                op="depthwise-conv2d",
                inputs=(source, weight_id, bias_id),
                outputs=add_shift.outputs,
                output_shapes=add_shift.output_shapes,
                params=dict(main.params),
            )
        )
        removed.update(
            dispatch.id
            for dispatch in (
                point,
                main,
                add_branches,
                add_identity,
                multiply,
                add_shift,
            )
        )

    if len(replacements) != expected_motifs:
        raise ExtractionError(
            f"expected {expected_motifs} official reparameterizable depthwise motifs, "
            f"got {len(replacements)}"
        )
    retained = [dispatch for dispatch in dispatches if dispatch.id not in removed]
    retained.extend(replacements)
    result = NormalizedGraph(
        model=graph.model,
        source_sha256=graph.source_sha256,
        input_id=graph.input_id,
        output_id=graph.output_id,
        tensors=tensors,
        constants=constants,
        views=list(graph.views),
        dispatches=_topologically_order(retained, list(graph.views)),
        scans=graph.scans,
        constant_values=constant_values,
    )
    audit_lowered_graph(result)
    return result


def fuse_regular_conv_activations(graph: NormalizedGraph) -> NormalizedGraph:
    """Fuse safe single-consumer regular-convolution activation edges.

    The runtime convolution ABI already carries an activation parameter. A fusion
    is therefore storage-neutral when the unfused convolution output is consumed
    by exactly one standalone activation: the convolution adopts the activation
    kind and produces the activation's output tensor directly. Fan-out edges,
    depthwise convolutions, and already-fused convolutions remain unchanged.
    """

    if graph.views:
        raise ExtractionError("convolution activation fusion requires lowered views")

    consumers: dict[str, list[DispatchRecord]] = {}
    for dispatch in graph.dispatches:
        for tensor_id in dispatch.inputs:
            consumers.setdefault(tensor_id, []).append(dispatch)

    replacements: dict[str, DispatchRecord] = {}
    removed_activations: set[str] = set()
    dead_tensors: set[str] = set()
    supported = {"gelu", "silu", "relu"}

    for convolution in graph.dispatches:
        if (
            convolution.op != "conv2d"
            or len(convolution.outputs) != 1
            or convolution.params.get("activation") != "none"
        ):
            continue
        intermediate = convolution.outputs[0]
        if intermediate == graph.output_id:
            continue
        uses = consumers.get(intermediate, [])
        if len(uses) != 1:
            continue
        activation = uses[0]
        if (
            activation.op != "activation"
            or activation.inputs != (intermediate,)
            or len(activation.outputs) != 1
            or set(activation.params) != {"kind"}
            or activation.params["kind"] not in supported
            or convolution.output_shapes != activation.output_shapes
            or graph.tensors[intermediate].shape
            != graph.tensors[activation.outputs[0]].shape
        ):
            continue

        params = dict(convolution.params)
        params["activation"] = activation.params["kind"]
        replacements[convolution.id] = DispatchRecord(
            id=convolution.id,
            op=convolution.op,
            inputs=convolution.inputs,
            outputs=activation.outputs,
            output_shapes=activation.output_shapes,
            params=params,
        )
        if activation.id in removed_activations:
            raise ExtractionError(
                f"{activation.id}: activation matched more than one convolution"
            )
        removed_activations.add(activation.id)
        dead_tensors.add(intermediate)

    dispatches = [
        replacements.get(dispatch.id, dispatch)
        for dispatch in graph.dispatches
        if dispatch.id not in removed_activations
    ]
    tensors = {
        tensor_id: tensor
        for tensor_id, tensor in graph.tensors.items()
        if tensor_id not in dead_tensors
    }
    result = NormalizedGraph(
        model=graph.model,
        source_sha256=graph.source_sha256,
        input_id=graph.input_id,
        output_id=graph.output_id,
        tensors=tensors,
        constants=dict(graph.constants),
        views=[],
        dispatches=_topologically_order(dispatches, []),
        scans=graph.scans,
        constant_values=dict(graph.constant_values),
    )
    audit_lowered_graph(result)
    return result


def fold_regular_conv_channel_affines(graph: NormalizedGraph) -> NormalizedGraph:
    """Fold safe regular-conv output channel scales and optional shifts.

    Only an activation-free regular convolution whose output has exactly one
    consumer is eligible. That consumer must multiply by a finite constant channel
    vector. If the multiply itself has exactly one channel-add consumer with a
    constant RHS, its shift is folded as well. Residual/dynamic adds are deliberately
    left in the graph, preserving their dispatch and evaluation order.

    New constants are emitted instead of mutating possibly shared source weights.
    A following canonicalization pass prunes old weights, scale/shift constants, and
    removed intermediate tensors when they are no longer used.
    """

    if graph.views:
        raise ExtractionError("channel-affine folding requires lowered views")

    consumers: dict[str, list[DispatchRecord]] = {}
    for dispatch in graph.dispatches:
        for tensor_id in dispatch.inputs:
            consumers.setdefault(tensor_id, []).append(dispatch)

    tensors = dict(graph.tensors)
    constants = dict(graph.constants)
    constant_values = dict(graph.constant_values)
    replacements: dict[str, DispatchRecord] = {}
    removed_dispatches: set[str] = set()
    dead_tensors: set[str] = set()

    for convolution in graph.dispatches:
        if (
            convolution.op != "conv2d"
            or convolution.params.get("activation") != "none"
            or len(convolution.inputs) != 3
            or len(convolution.outputs) != 1
        ):
            continue
        intermediate = convolution.outputs[0]
        uses = consumers.get(intermediate, [])
        if len(uses) != 1:
            continue
        multiply = uses[0]
        if (
            multiply.op != "binary"
            or multiply.params != {"kind": "mul", "broadcast": "channels"}
            or multiply.inputs[0] != intermediate
            or multiply.inputs[1] not in graph.constants
            or len(multiply.outputs) != 1
            or multiply.output_shapes != convolution.output_shapes
        ):
            continue

        channels = convolution.output_shapes[0][1]
        scale = _constant(graph, multiply.inputs[1], multiply.id).reshape(-1)
        if scale.shape != (channels,):
            raise ExtractionError(
                f"{multiply.id}: channel scale shape does not match {channels} outputs"
            )

        target = multiply
        shift: np.ndarray | None = None
        multiply_uses = consumers.get(multiply.outputs[0], [])
        if len(multiply_uses) == 1:
            addition = multiply_uses[0]
            if (
                addition.op == "binary"
                and addition.params == {"kind": "add", "broadcast": "channels"}
                and addition.inputs[0] == multiply.outputs[0]
                and addition.inputs[1] in graph.constants
                and len(addition.outputs) == 1
                and addition.output_shapes == convolution.output_shapes
            ):
                shift = _constant(graph, addition.inputs[1], addition.id).reshape(-1)
                if shift.shape != (channels,):
                    raise ExtractionError(
                        f"{addition.id}: channel shift shape does not match "
                        f"{channels} outputs"
                    )
                target = addition

        weight = _constant(graph, convolution.inputs[1], convolution.id)
        bias = _constant(graph, convolution.inputs[2], convolution.id)
        folded_weight, folded_bias = fold_layer_scale(weight, bias, scale)
        if shift is not None:
            folded_bias = np.ascontiguousarray(
                np.add(folded_bias, shift, dtype=np.float32), dtype=np.float32
            )
            if not np.all(np.isfinite(folded_bias)):
                raise ExtractionError(f"{target.id}: folded channel bias is non-finite")

        fold_index = len(replacements)
        weight_id = f"generated/channel-affine/{fold_index}/weight"
        bias_id = f"generated/channel-affine/{fold_index}/bias"
        if weight_id in tensors or bias_id in tensors:
            raise ExtractionError("generated channel-affine constant ID collision")
        for tensor_id, value in (
            (weight_id, folded_weight),
            (bias_id, folded_bias),
        ):
            tensor, constant = _constant_record(tensor_id, value)
            tensors[tensor_id] = tensor
            constants[tensor_id] = constant
            constant_values[tensor_id] = value

        replacements[convolution.id] = DispatchRecord(
            id=convolution.id,
            op=convolution.op,
            inputs=(convolution.inputs[0], weight_id, bias_id),
            outputs=target.outputs,
            output_shapes=target.output_shapes,
            params=dict(convolution.params),
        )
        removed_dispatches.add(multiply.id)
        dead_tensors.add(intermediate)
        if target is not multiply:
            removed_dispatches.add(target.id)
            dead_tensors.add(multiply.outputs[0])

    dispatches = [
        replacements.get(dispatch.id, dispatch)
        for dispatch in graph.dispatches
        if dispatch.id not in removed_dispatches
    ]
    tensors = {
        tensor_id: tensor
        for tensor_id, tensor in tensors.items()
        if tensor_id not in dead_tensors
    }
    result = NormalizedGraph(
        model=graph.model,
        source_sha256=graph.source_sha256,
        input_id=graph.input_id,
        output_id=graph.output_id,
        tensors=tensors,
        constants=constants,
        views=[],
        dispatches=_topologically_order(dispatches, []),
        scans=graph.scans,
        constant_values=constant_values,
    )
    audit_lowered_graph(result)
    return result


def fuse_channel_affine_dispatches(graph: NormalizedGraph) -> NormalizedGraph:
    """Fuse exact constant channel mul -> add chains into one materialized op.

    The multiply intermediate must have exactly one consumer. Both RHS tensors
    must be finite FP32 channel vectors and both operations must preserve the
    batch-one NCHW activation shape. The source may fan out because this rewrite
    only reads it; no virtual alias or in-place mutation is introduced.
    """

    if graph.views:
        raise ExtractionError("channel-affine dispatch fusion requires lowered views")

    consumers: dict[str, list[DispatchRecord]] = {}
    for dispatch in graph.dispatches:
        for tensor_id in dispatch.inputs:
            consumers.setdefault(tensor_id, []).append(dispatch)

    replacements: dict[str, DispatchRecord] = {}
    removed_additions: set[str] = set()
    dead_tensors: set[str] = set()
    for multiply in graph.dispatches:
        if (
            multiply.op != "binary"
            or multiply.params != {"kind": "mul", "broadcast": "channels"}
            or len(multiply.inputs) != 2
            or multiply.inputs[0] in graph.constants
            or multiply.inputs[1] not in graph.constants
            or len(multiply.outputs) != 1
        ):
            continue
        intermediate = multiply.outputs[0]
        uses = consumers.get(intermediate, [])
        if len(uses) != 1:
            continue
        addition = uses[0]
        if (
            addition.op != "binary"
            or addition.params != {"kind": "add", "broadcast": "channels"}
            or addition.inputs[0] != intermediate
            or addition.inputs[1] not in graph.constants
            or len(addition.outputs) != 1
            or multiply.output_shapes != addition.output_shapes
        ):
            continue

        source_shape = graph.tensors[multiply.inputs[0]].shape
        intermediate_shape = graph.tensors[intermediate].shape
        output_shape = graph.tensors[addition.outputs[0]].shape
        if (
            len(source_shape) != 4
            or source_shape[0] != 1
            or source_shape != intermediate_shape
            or source_shape != output_shape
        ):
            raise ExtractionError(
                f"{multiply.id}: channel-affine chain changes activation shape"
            )
        channels = source_shape[1]
        scale = _constant(graph, multiply.inputs[1], multiply.id)
        bias = _constant(graph, addition.inputs[1], addition.id)
        if scale.shape != (channels,) or bias.shape != (channels,):
            raise ExtractionError(
                f"{multiply.id}: channel-affine constants must have shape {(channels,)}"
            )

        replacements[multiply.id] = DispatchRecord(
            id=multiply.id,
            op="channel-affine",
            inputs=(multiply.inputs[0], multiply.inputs[1], addition.inputs[1]),
            outputs=addition.outputs,
            output_shapes=addition.output_shapes,
            params={"axis": 1},
        )
        removed_additions.add(addition.id)
        dead_tensors.add(intermediate)

    dispatches = [
        replacements.get(dispatch.id, dispatch)
        for dispatch in graph.dispatches
        if dispatch.id not in removed_additions
    ]
    tensors = {
        tensor_id: tensor
        for tensor_id, tensor in graph.tensors.items()
        if tensor_id not in dead_tensors
    }
    result = NormalizedGraph(
        model=graph.model,
        source_sha256=graph.source_sha256,
        input_id=graph.input_id,
        output_id=graph.output_id,
        tensors=tensors,
        constants=dict(graph.constants),
        views=[],
        dispatches=_topologically_order(dispatches, []),
        scans=graph.scans,
        constant_values=dict(graph.constant_values),
    )
    audit_lowered_graph(result)
    return result


def canonicalize_runtime_graph(graph: NormalizedGraph) -> NormalizedGraph:
    """Put commutative constants on the RHS, prune dead extraction metadata, audit ABI."""

    dispatches: list[DispatchRecord] = []
    for dispatch in graph.dispatches:
        inputs = dispatch.inputs
        if (
            dispatch.op == "binary"
            and inputs[0] in graph.constants
            and inputs[1] not in graph.constants
        ):
            if dispatch.params.get("kind") not in {"add", "mul"}:
                raise ExtractionError(
                    f"{dispatch.id}: cannot commute constant through {dispatch.params.get('kind')}"
                )
            inputs = (inputs[1], inputs[0])
        dispatches.append(
            DispatchRecord(
                id=dispatch.id,
                op=dispatch.op,
                inputs=inputs,
                outputs=dispatch.outputs,
                output_shapes=dispatch.output_shapes,
                params=dict(dispatch.params),
            )
        )

    used = {graph.input_id, graph.output_id}
    for dispatch in dispatches:
        used.update(dispatch.inputs)
        used.update(dispatch.outputs)
    tensors = {name: value for name, value in graph.tensors.items() if name in used}
    constants = {name: value for name, value in graph.constants.items() if name in used}
    constant_values = {
        name: value
        for name, value in graph.constant_values.items()
        if name in constants
    }
    result = NormalizedGraph(
        model=graph.model,
        source_sha256=graph.source_sha256,
        input_id=graph.input_id,
        output_id=graph.output_id,
        tensors=tensors,
        constants=constants,
        views=list(graph.views),
        dispatches=_topologically_order(dispatches, list(graph.views)),
        scans=graph.scans,
        constant_values=constant_values,
    )
    audit_runtime_graph(result)
    return result


def prepare_runtime_graph(
    graph: NormalizedGraph,
    *,
    fold_channel_affine: bool = False,
    fuse_channel_affine: bool = False,
) -> NormalizedGraph:
    prepared = canonicalize_runtime_graph(
        fuse_regular_conv_activations(
            fold_reparameterized_depthwise(lower_dynamic_views(graph))
        )
    )
    if fold_channel_affine:
        prepared = canonicalize_runtime_graph(
            fold_regular_conv_channel_affines(prepared)
        )
    if fuse_channel_affine:
        prepared = canonicalize_runtime_graph(fuse_channel_affine_dispatches(prepared))
    return prepared


def _activation_shape(
    graph: NormalizedGraph, tensor_id: str, context: str
) -> tuple[int, ...]:
    if tensor_id in graph.constants:
        raise ExtractionError(
            f"{context}: expected activation, got constant {tensor_id!r}"
        )
    shape = graph.tensors[tensor_id].shape
    if len(shape) != 4 or shape[0] != 1:
        raise ExtractionError(
            f"{context}: expected batch-one NCHW activation, got {shape}"
        )
    return shape


def _constant(graph: NormalizedGraph, tensor_id: str, context: str) -> np.ndarray:
    try:
        value = graph.constant_values[tensor_id]
    except KeyError as error:
        raise ExtractionError(f"{context}: expected constant {tensor_id!r}") from error
    if value.dtype != np.float32 or not np.all(np.isfinite(value)):
        raise ExtractionError(f"{context}: constant must be finite FP32")
    return value


def audit_runtime_graph(graph: NormalizedGraph) -> None:
    """Prove the lowered graph matches the current TypeGPU kernel ABI."""

    audit_lowered_graph(graph)
    allowed_params = {
        "conv2d": {
            "kernel",
            "stride",
            "padding",
            "groups",
            "activation",
            "weightPacking",
            "biasPacking",
        },
        "depthwise-conv2d": {
            "kernel",
            "stride",
            "padding",
            "groups",
            "activation",
            "weightPacking",
            "biasPacking",
        },
        "activation": {"kind"},
        "binary": {"kind", "broadcast"},
        "avg-pool2d": {"kernel", "stride", "padding", "countIncludePad"},
        "resize2d": {"mode", "coordinateMode", "size"},
        "layer-norm": {"axis", "epsilon"},
        "scan-project": {
            "directions",
            "stateSize",
            "dtRank",
            "lowChannels",
            "sequence",
        },
        "selective-scan": {
            "directions",
            "stateSize",
            "length",
            "deltaSoftplus",
            "fp32Recurrence",
        },
        "scan-merge": {
            "directions",
            "transposeColumnMajor",
            "reduction",
            "normalization",
        },
        "channel-split": {"axis", "splitChannels"},
        "channel-concat": {"axis"},
        "channel-affine": {"axis"},
    }
    available = {graph.input_id, *graph.constants}
    produced: set[str] = set()
    for dispatch in graph.dispatches:
        if set(dispatch.params) != allowed_params[dispatch.op]:
            raise ExtractionError(
                f"{dispatch.id}: params {set(dispatch.params)} do not match {allowed_params[dispatch.op]}"
            )
        if any(tensor_id not in available for tensor_id in dispatch.inputs):
            missing = [
                tensor_id for tensor_id in dispatch.inputs if tensor_id not in available
            ]
            raise ExtractionError(f"{dispatch.id}: reads before production: {missing}")
        if any(tensor_id in available for tensor_id in dispatch.outputs):
            raise ExtractionError(f"{dispatch.id}: output is produced more than once")

        if dispatch.op in {"conv2d", "depthwise-conv2d"}:
            source_shape = _activation_shape(graph, dispatch.inputs[0], dispatch.id)
            output_shape = _activation_shape(graph, dispatch.outputs[0], dispatch.id)
            weight = _constant(graph, dispatch.inputs[1], dispatch.id)
            bias = _constant(graph, dispatch.inputs[2], dispatch.id)
            if weight.ndim != 4 or bias.shape != (output_shape[1],):
                raise ExtractionError(
                    f"{dispatch.id}: malformed convolution parameters"
                )
            if weight.shape[0] != output_shape[1] or tuple(weight.shape[-2:]) != tuple(
                dispatch.params["kernel"]
            ):
                raise ExtractionError(
                    f"{dispatch.id}: convolution weight/output mismatch"
                )
            if dispatch.op == "conv2d":
                if weight.shape[1] != source_shape[1] or dispatch.params["groups"] != 1:
                    raise ExtractionError(
                        f"{dispatch.id}: regular convolution channel mismatch"
                    )
                if tuple(dispatch.params["kernel"]) not in {(1, 1), (3, 3)}:
                    raise ExtractionError(f"{dispatch.id}: unsupported regular kernel")
            else:
                if (
                    weight.shape[1] != 1
                    or weight.shape[0] != source_shape[1]
                    or dispatch.params["groups"] != source_shape[1]
                    or tuple(dispatch.params["kernel"]) not in {(3, 3), (1, 7), (7, 1)}
                ):
                    raise ExtractionError(
                        f"{dispatch.id}: unsupported depthwise convolution"
                    )
        elif dispatch.op == "activation":
            if _activation_shape(
                graph, dispatch.inputs[0], dispatch.id
            ) != _activation_shape(graph, dispatch.outputs[0], dispatch.id):
                raise ExtractionError(f"{dispatch.id}: activation changes shape")
        elif dispatch.op == "binary":
            lhs = _activation_shape(graph, dispatch.inputs[0], dispatch.id)
            output = _activation_shape(graph, dispatch.outputs[0], dispatch.id)
            if lhs != output:
                raise ExtractionError(
                    f"{dispatch.id}: binary lhs/output shape mismatch"
                )
            broadcast = dispatch.params["broadcast"]
            if dispatch.inputs[1] in graph.constants:
                rhs = _constant(graph, dispatch.inputs[1], dispatch.id)
                expected = {
                    "scalar": 1,
                    "channels": lhs[1],
                }.get(broadcast)
                if expected is None or rhs.size != expected:
                    raise ExtractionError(f"{dispatch.id}: invalid constant broadcast")
            elif (
                broadcast != "none"
                or _activation_shape(graph, dispatch.inputs[1], dispatch.id) != output
            ):
                raise ExtractionError(f"{dispatch.id}: invalid activation broadcast")
        elif dispatch.op == "channel-affine":
            source = _activation_shape(graph, dispatch.inputs[0], dispatch.id)
            output = _activation_shape(graph, dispatch.outputs[0], dispatch.id)
            scale = _constant(graph, dispatch.inputs[1], dispatch.id)
            bias = _constant(graph, dispatch.inputs[2], dispatch.id)
            if (
                source != output
                or scale.shape != (source[1],)
                or bias.shape != (source[1],)
                or dispatch.params["axis"] != 1
            ):
                raise ExtractionError(f"{dispatch.id}: channel affine mismatch")
        elif dispatch.op == "avg-pool2d":
            source = _activation_shape(graph, dispatch.inputs[0], dispatch.id)
            output = _activation_shape(graph, dispatch.outputs[0], dispatch.id)
            kernel_y, kernel_x = dispatch.params["kernel"]
            stride_y, stride_x = dispatch.params["stride"]
            top, left, bottom, right = dispatch.params["padding"]
            expected = (
                source[0],
                source[1],
                (source[2] + top + bottom - kernel_y) // stride_y + 1,
                (source[3] + left + right - kernel_x) // stride_x + 1,
            )
            if output != expected or any(dispatch.params["padding"]):
                raise ExtractionError(
                    f"{dispatch.id}: unsupported average pool geometry"
                )
        elif dispatch.op == "resize2d":
            source = _activation_shape(graph, dispatch.inputs[0], dispatch.id)
            output = _activation_shape(graph, dispatch.outputs[0], dispatch.id)
            if (
                source[:2] != output[:2]
                or tuple(dispatch.params["size"]) != output[-2:]
            ):
                raise ExtractionError(f"{dispatch.id}: resize shape mismatch")
            supported = {
                ("nearest", "asymmetric-floor"),
                ("bilinear", "half-pixel"),
                ("bilinear", "align-corners"),
            }
            if (
                dispatch.params["mode"],
                dispatch.params["coordinateMode"],
            ) not in supported:
                raise ExtractionError(f"{dispatch.id}: unsupported resize mode")
        elif dispatch.op == "layer-norm":
            source = _activation_shape(graph, dispatch.inputs[0], dispatch.id)
            output = _activation_shape(graph, dispatch.outputs[0], dispatch.id)
            gamma = _constant(graph, dispatch.inputs[1], dispatch.id)
            beta = _constant(graph, dispatch.inputs[2], dispatch.id)
            if (
                source != output
                or gamma.shape != (source[1],)
                or beta.shape != (source[1],)
                or dispatch.params["axis"] != 1
            ):
                raise ExtractionError(f"{dispatch.id}: layer normalization mismatch")
        elif dispatch.op == "scan-project":
            source = _activation_shape(graph, dispatch.inputs[0], dispatch.id)
            delta = graph.tensors[dispatch.outputs[0]].shape
            b_shape = graph.tensors[dispatch.outputs[1]].shape
            c_shape = graph.tensors[dispatch.outputs[2]].shape
            channels, length = source[1], source[2] * source[3]
            if (
                dispatch.params["lowChannels"] != channels
                or delta != (1, 4 * channels, length)
                or b_shape != (1, 4, 8, length)
                or c_shape != b_shape
            ):
                raise ExtractionError(f"{dispatch.id}: scan projection shape mismatch")
        elif dispatch.op == "selective-scan":
            source = _activation_shape(graph, dispatch.inputs[0], dispatch.id)
            channels, length = source[1], source[2] * source[3]
            expected = (
                (1, 4 * channels, length),
                (1, 4, 8, length),
                (1, 4, 8, length),
                (4 * channels, 8),
                (4 * channels,),
                (4 * channels,),
            )
            actual = tuple(
                graph.tensors[tensor_id].shape for tensor_id in dispatch.inputs[1:]
            )
            if (
                actual != expected
                or graph.tensors[dispatch.outputs[0]].shape != (1, 4 * channels, length)
                or dispatch.params["length"] != length
            ):
                raise ExtractionError(f"{dispatch.id}: selective scan shape mismatch")
        elif dispatch.op == "scan-merge":
            output = _activation_shape(graph, dispatch.outputs[0], dispatch.id)
            expected = (1, 4 * output[1], output[2] * output[3])
            if graph.tensors[dispatch.inputs[0]].shape != expected:
                raise ExtractionError(f"{dispatch.id}: scan merge shape mismatch")
        elif dispatch.op == "channel-split":
            source = _activation_shape(graph, dispatch.inputs[0], dispatch.id)
            outputs = tuple(
                _activation_shape(graph, tensor_id, dispatch.id)
                for tensor_id in dispatch.outputs
            )
            channels = dispatch.params["splitChannels"]
            if (
                dispatch.params["axis"] != 1
                or channels != [output[1] for output in outputs]
                or any(channel % 4 for channel in channels)
                or sum(channels) != source[1]
                or any(
                    output[0:1] + output[2:] != source[0:1] + source[2:]
                    for output in outputs
                )
            ):
                raise ExtractionError(f"{dispatch.id}: channel split shape mismatch")
        elif dispatch.op == "channel-concat":
            inputs = tuple(
                _activation_shape(graph, tensor_id, dispatch.id)
                for tensor_id in dispatch.inputs
            )
            output = _activation_shape(graph, dispatch.outputs[0], dispatch.id)
            if (
                dispatch.params["axis"] != 1
                or any(shape[1] % 4 for shape in inputs)
                or sum(shape[1] for shape in inputs) != output[1]
                or any(
                    shape[0:1] + shape[2:] != output[0:1] + output[2:]
                    for shape in inputs
                )
            ):
                raise ExtractionError(f"{dispatch.id}: channel concat shape mismatch")

        available.update(dispatch.outputs)
        produced.update(dispatch.outputs)
    if graph.output_id not in produced:
        raise ExtractionError("runtime graph does not produce its public output")
