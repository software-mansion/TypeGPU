---
title: Parametrized Functions
description: A guide on how parametrized functions can help manage large programs.
---

Lets say we want to create a cellular automata simulation that involves producing a new grid state based on the previous state,
without mutating it in place.

<!-- TODO: Link to an implementation of Conway's Game of Life in wigsill -->
:::note
Examples of cellular automata include [Conway's Game of Life](https://playgameoflife.com/), our [Fluid Simulation](LINK_HERE)
example and many more.
:::

First, we should define two buffers that will each hold the state of the grid. One will be used for reading the previous
state, and the other will be updated and become the next state. After every cell moves into its new state, the buffers get
swapped.

```ts
import wgsl, { plum } from 'wigsill';
import { arrayOf, f32 } from 'wigsill/data';

const gridSize = plum(512);

function makeGridBuffer() {
  return plum((get) => {
    // if `gridSize` changes value, we recreate the buffer.
    const gridArea = get(gridSize) ** 2;

    return wgsl
      .buffer(arrayOf(f32, gridArea))
      // How can we use this buffer?
      .$allowReadonlyStorage()
      .$allowMutableStorage()
  });
}

const evenGridBuffer = makeGridBuffer();
const oddGridBuffer = makeGridBuffer();
  
```

To access the buffers in WGSL code, we need to do it through bindings. This allows WebGPU to optimize, since
we define how we want to use the buffer explicitly.

```ts
const readonlyEvenGrid = plum((get) => get(evenGridBuffer).asReadonlyStorage());
const readonlyOddGrid = plum((get) => get(oddGridBuffer).asReadonlyStorage());

const mutableEvenGrid = plum((get) => get(evenGridBuffer).asMutableStorage());
const mutableOddGrid = plum((get) => get(oddGridBuffer).asMutableStorage());
```

```ts
// Creating slots that will be filled with proper buffers
// depending on which cycle we are in (even/odd).
const inGridSlot = wgsl.slot<ReadableBuffer<GridState>>();
const outGridSlot = wgsl.slot<MutableBuffer<GridState>>();
```

```ts
// `addToCell` should read from the `input` buffer,
// and write to the `output` buffer, whichever are
// currently bound to the program.

const addToCell = wgsl.fn()`(x: i32, y: i32, value: f32) => {
  let index = x + y * ${gridSize};
  ${outGridSlot}[index] = ${inGridSlot}[index] + value;
}`;
```