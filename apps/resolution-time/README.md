# Procedural TypeGPU function generator for benchmarking WGSL resolution time

## Adding a new instruction

Each instruction is a `tgpu.comptime` that returns a `tgpu.fn(() => void)`. There are two kinds: **leaf** (no function calls) and **recursive** (branches into other instructions).

### Leaf instruction

```ts
const myLeafFn = tgpu.comptime(() => {
  return tgpu.fn(() => {
    'use gpu';
    // ...
    popDepth(); // REQUIRED — always call at the end
  }).$name('myLeafFn');
});
```

### Recursive instruction

Use `tgpu.unroll` over `arrayForUnroll(BRANCHING)` and call `instructions[choice()]()()` to branch into other instructions. The `choice()` function handles depth tracking and picks a leaf when at max depth.

```ts
const myRecursiveFn = tgpu.comptime(() => {
  return tgpu.fn(() => {
    'use gpu';
    // ...
    for (const _i of tgpu.unroll(arrayForUnroll(BRANCHING))) {
      instructions[choice()]()();
    }
    popDepth(); // REQUIRED — always call at the end, after the unroll
  }).$name('myRecursiveFn');
});
```

### Registering

Add your function to the `instructions.push(...)` call. **Leaves must come first**, followed by recursive functions. Update `LEAF_COUNT` if you add a new leaf.

### Rules

- Every instruction **must** call `popDepth()` exactly once, as the last statement
- No direct function calls inside instructions — branching happens only via the `tgpu.unroll` + `choice()` pattern
