```ts
graph main_graph (
  %modelInput[FLOAT, 1x1x28x28]
) initializers (
  %model.1.weight[FLOAT, 256x784]
  %model.1.bias[FLOAT, 256]
  %model.3.weight[FLOAT, 128x256]
  %model.3.bias[FLOAT, 128]
  %model.5.weight[FLOAT, 10x128]
  %model.5.bias[FLOAT, 10]
) {
  %/model/model.0/Flatten_output_0 = Flatten[axis = 1](%modelInput)
  %/model/model.1/Gemm_output_0 = Gemm[alpha = 1, beta = 1, transB = 1](%/model/model.0/Flatten_output_0, %model.1.weight, %model.1.bias)
  %/model/model.2/Relu_output_0 = Relu(%/model/model.1/Gemm_output_0)
  %/model/model.3/Gemm_output_0 = Gemm[alpha = 1, beta = 1, transB = 1](%/model/model.2/Relu_output_0, %model.3.weight, %model.3.bias)
  %/model/model.4/Relu_output_0 = Relu(%/model/model.3/Gemm_output_0)
  %modelOutput = Gemm[alpha = 1, beta = 1, transB = 1](%/model/model.4/Relu_output_0, %model.5.weight, %model.5.bias)
  return %modelOutput
}
```
