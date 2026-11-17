import { WgslGenerator, type Snippet, type FunctionDefinitionOptions } from 'typegpu/~internal';
import {
  CrossShaderStageState,
  GlslGenerator,
} from '../../../../../packages/typegpu-gl/src/glslGenerator.ts';

import { NodeTypeCatalog } from '../../../../../packages/tinyest/src/index.ts';

const nodeNames = Object.fromEntries(
  Object.entries(NodeTypeCatalog).map(([name, id]) => [id, name]),
);

export type Target = 'wgsl' | 'glsl';
export interface TraceNode {
  id: number;
  parent: number | null;
  kind: 'function' | 'block' | 'statement' | 'expression';
  label: string;
  node: string;
  output: string;
  dataType?: string;
  origin?: string;
  step: number;
}
export interface TraceResult {
  code: string;
  nodes: TraceNode[];
  exports: string[];
}

// Use a zero-argument adapter so both backends share exactly the same instrumentation.
class NeutralGlslGenerator extends GlslGenerator {
  constructor() {
    super('neutral', new CrossShaderStageState());
  }
}

function inspectable(Base: typeof WgslGenerator) {
  return class extends Base {
    readonly nodes: TraceNode[] = [];
    #stack: number[] = [];
    #step = 0;

    #capture<T>(
      kind: TraceNode['kind'],
      node: unknown,
      run: () => T,
      describe: (value: T) => Pick<TraceNode, 'output' | 'dataType' | 'origin'>,
      label?: string,
    ): T {
      if (this.nodes.length >= 5000)
        throw new Error('Trace exceeds 5,000 nodes. Try a smaller snippet.');
      const entry: TraceNode = {
        id: this.nodes.length,
        parent: this.#stack.at(-1) ?? null,
        kind,
        label:
          label ?? (Array.isArray(node) ? (nodeNames[node[0]] ?? String(node[0])) : String(node)),
        node: JSON.stringify(node, null, 2),
        output: '',
        step: 0,
      };
      this.nodes.push(entry);
      this.#stack.push(entry.id);
      try {
        const value = run();
        Object.assign(entry, describe(value));
        entry.step = ++this.#step;
        return value;
      } finally {
        this.#stack.pop();
      }
    }

    override functionDefinition(options: FunctionDefinitionOptions): string {
      return this.#capture(
        'function',
        options.body,
        () => super.functionDefinition(options),
        (output) => ({ output }),
        options.name,
      );
    }

    protected override _block(...args: Parameters<WgslGenerator['_block']>) {
      return this.#capture(
        'block',
        args[0],
        () => super._block(...args),
        (value) => ({ output: value.code }),
      );
    }

    protected override _statement(...args: Parameters<WgslGenerator['_statement']>) {
      return this.#capture(
        'statement',
        args[0],
        () => super._statement(...args),
        (value) => ({ output: value.code }),
      );
    }

    protected override _expression(...args: Parameters<WgslGenerator['_expression']>): Snippet {
      return this.#capture(
        'expression',
        args[0],
        () => super._expression(...args),
        (value) => ({
          // Do not resolve values for inspection: doing so would alter the trace and
          // can register dependencies that the generator would otherwise prune.
          output: displayValue(value.value),
          dataType: typeof value.dataType === 'symbol' ? 'unknown' : value.dataType.type,
          origin: value.origin,
        }),
      );
    }
  };
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value == null)
    return String(value);
  if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`;
  // These are compile-time objects, not necessarily shader text.
  return '[compile-time object]';
}

export const InspectableWgslGenerator = inspectable(WgslGenerator);
export const InspectableGlslGenerator = inspectable(NeutralGlslGenerator);
