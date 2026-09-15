<div align="center">

# tinyest

Tiny Embeddable Syntax Tree -
[GitHub](https://github.com/software-mansion/TypeGPU/tree/main/packages/tinyest)

</div>

A compact, fast, and embeddable JavaScript AST for transpilation.

### Source mapping

Tinyest supports source mapping. 
Use `embedSourceMap` function to obtain a new node with the source map embedded.
Use `stripSourceMap` function to restore the original node and source map.

Note that both functions create a new AST instead of modifying the existing one:

```ts
const node = [NodeTypeCatalog.identifier, 'ident'];
const sourceMap = new Map([[node, [1, 2]]]);

const sourceMappedNode = embedSourceMap(node, sourceMap);
const [restoredNode, restoredSourceMap] = stripSourceMap(sourceMappedNode);

console.log(restoredNode); // [9, 'ident'];
console.log(restoredSourceMap.get(restoredNode)); // [1, 2];

console.log(node === restoredNode); // false
console.log(restoredSourceMap.get(node)); // undefined
```

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
