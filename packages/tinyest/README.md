<div align="center">

# tinyest

Tiny Embeddable Syntax Tree -
[GitHub](https://github.com/software-mansion/TypeGPU/tree/main/packages/tinyest)

</div>

A compact, fast, and embeddable JavaScript AST for transpilation.

### Source mapping

Tinyest supports source mapping. To map a node, wrap it in an extra node:

```ts
const node: AnyNode = [9 /* identifier */, "variable"];
const sourceMappedNode: SourceMappedNode = [
  -1, /* source map */
  10, /* line */
  1, /* column */
  node
]
```

Source maps are not included in `Expression`, `Statement` and `AnyNode` types, use `SourceMappedNode` type instead.
Source maps can be stripped with the `stripSourceMap` function, that returns a node and a sourcemap.

### Projects using tinyest

- [TypeGPU](https://typegpu.com) - A TypeScript library that enhances the WebGPU
  API, allowing resource management in a type-safe way.

## tinyest is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=tinyest&utm_medium=readme).
