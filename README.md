# TypeGPU

> WORK-IN-PROGRESS

## Addressed problems

- Minimizing mismatches between what we write to buffers on the CPU and what we receive on the GPU by generating WGSL types from typed-binary schemas.
- Ability to compose code blocks in a reusable way, opening up the possibility of WebGPU/WGSL JavaScript libraries that expose utility code.
- Automatically resolves conflicts in variable names, function names and binding indices.
- Allows to easily define memory shared between JS and WebGPU.
