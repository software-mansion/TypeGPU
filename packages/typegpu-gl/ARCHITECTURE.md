## Resource management

I (@iwoplaza) was initially planning to defer buffer creation to the root, but its unclear how to replicate full `TgpuBuffer` behavior anyways. It's way more straightforward to allow just buffer shorthands (`root.createUniform`, etc.) and return simplified implementations. For apps that want to optimize the non-fallback
path, it's very easy to do with accessors for example.

```ts
const root = await initWithGLFallback();
const isGL = isGLRoot(root);

const Positions = d.arrayOf(d.vec3f, 64);
const positions = isGL ? root.createUniform(Positions) : root.createReadonly(Positions);

function updatePosition(index: number) {
  'use gpu';
  positions.$[index] += d.vec3f(0, 1, 0);
}
```
