from __future__ import annotations

import numpy as np
from onnx import TensorProto, helper, numpy_helper, shape_inference

from depthart_pack.graph import ConstantEvaluator, _value_shapes


def test_constant_shape_chain_preserves_scalars_and_resolves_offline() -> None:
    image = helper.make_tensor_value_info("image", TensorProto.FLOAT, [1, 3, 4, 5])
    result = helper.make_tensor_value_info("result", TensorProto.INT64, [2])
    index = numpy_helper.from_array(np.asarray(2, dtype=np.int64), name="index")
    axes = numpy_helper.from_array(np.asarray([0], dtype=np.int64), name="axes")
    suffix = numpy_helper.from_array(np.asarray([6], dtype=np.int64), name="suffix")
    nodes = [
        helper.make_node("Shape", ["image"], ["shape"], name="shape"),
        helper.make_node("Gather", ["shape", "index"], ["height"], name="height"),
        helper.make_node(
            "Unsqueeze", ["height", "axes"], ["height-vector"], name="vector"
        ),
        helper.make_node(
            "Concat", ["height-vector", "suffix"], ["result"], name="concat", axis=0
        ),
    ]
    graph = helper.make_graph(
        nodes, "constant-chain", [image], [result], [index, axes, suffix]
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    inferred = shape_inference.infer_shapes(model, strict_mode=True, data_prop=True)
    producers = {
        output: node for node in inferred.graph.node for output in node.output if output
    }
    evaluator = ConstantEvaluator(inferred, producers, _value_shapes(inferred))

    height = evaluator.get("height")
    assert height is not None and height.shape == () and int(height) == 4
    np.testing.assert_array_equal(
        evaluator.get("result"), np.asarray([4, 6], dtype=np.int64)
    )
