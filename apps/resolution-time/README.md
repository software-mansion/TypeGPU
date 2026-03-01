# Resolution Time App

Procedural TypeGPU function generator for benchmarking WGSL resolution time.

## Instruction feature coverage

| Function | Leaf/Recursive | Buffers | Accessors | Slots | std functions |
|---|---|---|---|---|---|
| baseFn | leaf | | | | |
| waveFn | recursive | | | | |
| blendFn | leaf | | `timeAccessor`, `colorAccessor` | | `fract`, `mix`, `dot` |
| accFn | recursive | `dataLayout` (offset, scale) | | | |
| rotateFn | recursive | | `timeAccessor` | `phaseSlot` (vec2f) | |
| thresholdFn | leaf | | | `tintSlot` (vec3f) | `length`, `smoothstep` |
| spiralFn | recursive | `dataLayout` (offset) | `timeAccessor` | | `length` |

## Adding a new instruction

Each instruction is a `tgpu.comptime` that returns a `tgpu.fn(() => void)`. There are two kinds: **leaf** (no recursion) and **recursive** (branches into other instructions).

### Leaf instruction

```ts
const myLeafFn = tgpu.comptime(() => {
  return tgpu.fn(() => {
    'use gpu';
    // ... your GPU logic ...
    popDepth(); // REQUIRED — always call at the end
  }).$name('myLeafFn');
});
```

### Recursive instruction

Use `tgpu.unroll` over `arrayForUnroll(BRANCHING)` and call `instructions[choice()]()()` to branch into other instructions. The `choice()` comptime function handles depth tracking and picks a leaf when at max depth.

```ts
const myRecursiveFn = tgpu.comptime(() => {
  return tgpu.fn(() => {
    'use gpu';
    // ... your GPU logic ...
    for (const _i of tgpu.unroll(arrayForUnroll(BRANCHING))) {
      // @ts-expect-error trust me
      instructions[choice()]()();
    }
    popDepth(); // REQUIRED — always call at the end, after the unroll
  }).$name('myRecursiveFn');
});
```

### Registering

Add your function to the `instructions.push(...)` call. **Leaves must come first**, followed by recursive functions. Update `LEAF_COUNT` if you add a new leaf.

```ts
const LEAF_COUNT = 4; // bump this when adding a leaf
instructions.push(baseFn, blendFn, thresholdFn, myLeafFn, waveFn, accFn, rotateFn, spiralFn);
```

### Rules

- Every instruction **must** call `popDepth()` exactly once, as the last statement
- No direct function calls inside instructions — branching happens only via the `tgpu.unroll` + `choice()` pattern
- Recursive instructions call `popDepth()` **after** the unroll loop, not inside it
