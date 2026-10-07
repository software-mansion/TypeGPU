# Measured optimization results

Measured September 17, 2026 on Apple M3 Pro, Node v24.21.0 / V8
13.6.233.17-node.53. Both runs used the default three rounds, nine 12 ms
samples, and 60 ms warmup. In the table, **Target** is the abstract-vector
implementation before these optimizations and **PR** is the optimized version.

The optimized implementation is within 1.5× of the fastest measured JS baseline
in 25 of 31 workloads. Its geometric-mean cost is 1.30× the JS baseline; the
largest gap is 1.94× for the vec4 multiply/add chain. Copies and swizzles are at
approximate parity. These are local Node/V8 results, not browser or CI guarantees.

The changes remove intermediate constructor arrays for scalar/copy inputs,
compute common arithmetic directly in dimension-specific methods, bypass
generic argument validation/allocation for valid abstract inputs, and simplify
swizzle getters. Invalid or mixed types still use the existing validation.
Scalar precision, fresh result allocation, and compile-time-only GPU behavior
are preserved. A wrapper-only experiment did not improve results consistently
and was discarded.

## Full comparison

v24.21.0, Apple M3 Pro. Median ns/op; lower is better. Ratios compare TypeGPU with the fastest measured plain-JS contender.

| Workload | Object | Class | Array | TypeGPU | JS / TypeGPU | Target TypeGPU | Target / PR |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vec2/construct | 5.2 | 5.3 | 4.7 | 6.6 | 0.71× | 6.5 | 0.99× |
| vec2/copy | 11.6 | 11.3 | 10.6 | 11.2 | 0.95× | 218.3 | 19.49× |
| vec2/add | 13.4 | 12.0 | 11.5 | 15.3 | 0.75× | 803.8 | 52.61× |
| vec2/scale | 11.3 | 11.4 | 10.5 | 13.9 | 0.76× | 610.2 | 43.91× |
| vec2/chain | 13.0 | 12.0 | 11.9 | 20.9 | 0.57× | 1484.7 | 71.08× |
| vec2/normalize | 13.0 | 11.6 | 10.7 | 15.5 | 0.69× | 571.8 | 36.92× |
| vec2/dot | 11.6 | 10.9 | 10.6 | 13.7 | 0.78× | 97.2 | 7.10× |
| vec2/length | 11.7 | 11.0 | 10.6 | 12.9 | 0.82× | 26.7 | 2.07× |
| vec2/sin | 29.4 | 26.7 | 26.6 | 32.9 | 0.81× | 517.3 | 15.72× |
| vec2/swizzle | 10.9 | 10.9 | 10.5 | 10.3 | 1.02× | 11.4 | 1.10× |
| vec3/construct | 13.3 | 11.4 | 10.7 | 12.0 | 0.89× | 27.6 | 2.30× |
| vec3/copy | 13.5 | 12.3 | 11.1 | 11.1 | 1.00× | 265.2 | 23.83× |
| vec3/add | 14.6 | 13.1 | 12.0 | 16.6 | 0.72× | 969.0 | 58.45× |
| vec3/scale | 15.5 | 12.0 | 11.1 | 15.3 | 0.73× | 750.7 | 49.14× |
| vec3/chain | 16.1 | 13.1 | 13.6 | 24.3 | 0.54× | 1768.8 | 72.67× |
| vec3/normalize | 14.7 | 12.8 | 11.3 | 16.8 | 0.67× | 700.1 | 41.74× |
| vec3/dot | 12.5 | 12.3 | 11.2 | 16.0 | 0.70× | 113.7 | 7.10× |
| vec3/length | 12.2 | 11.6 | 11.5 | 14.1 | 0.81× | 34.8 | 2.46× |
| vec3/sin | 39.5 | 35.0 | 34.4 | 40.6 | 0.85× | 690.8 | 17.02× |
| vec3/swizzle | 13.5 | 12.1 | 11.2 | 10.7 | 1.04× | 16.5 | 1.53× |
| vec3/cross | 13.8 | 13.1 | 11.8 | 19.0 | 0.62× | 121.5 | 6.39× |
| vec4/construct | 13.2 | 11.9 | 11.3 | 13.4 | 0.84× | 28.5 | 2.13× |
| vec4/copy | 13.9 | 13.3 | 11.7 | 11.3 | 1.03× | 324.3 | 28.59× |
| vec4/add | 15.2 | 14.4 | 12.7 | 18.4 | 0.69× | 1168.2 | 63.54× |
| vec4/scale | 13.6 | 13.0 | 11.8 | 16.6 | 0.71× | 849.3 | 51.19× |
| vec4/chain | 15.1 | 14.3 | 14.9 | 27.8 | 0.52× | 2122.6 | 76.36× |
| vec4/normalize | 13.2 | 14.2 | 11.9 | 18.4 | 0.65× | 836.2 | 45.56× |
| vec4/dot | 13.2 | 12.8 | 11.0 | 17.6 | 0.63× | 113.0 | 6.42× |
| vec4/length | 12.4 | 12.1 | 11.9 | 14.3 | 0.83× | 36.9 | 2.58× |
| vec4/sin | 44.1 | 42.6 | 40.4 | 47.5 | 0.85× | 833.4 | 17.54× |
| vec4/swizzle | 13.9 | 13.0 | 11.4 | 10.9 | 1.05× | 21.1 | 1.94× |

Fresh processes, varying inputs, fresh result objects, escaped allocations, and component-wise correctness checks. JS / TypeGPU near 1× means parity. Noise at nanosecond scales and shared CI runners can be substantial; results are advisory, not a timing gate. N/A means the target does not expose abstract vectors.
