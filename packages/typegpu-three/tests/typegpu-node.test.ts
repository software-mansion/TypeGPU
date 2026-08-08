import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import WGSLNodeBuilder from 'three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js';
import { describe, expect, it, vi } from 'vitest';
import { tgpu, d } from 'typegpu';
import { fromTSL, toTSL } from '@typegpu/three';

class ObservableFloatNode extends THREE.Node {
  analyzeCount = 0;
  generateCount = 0;

  getNodeType() {
    return 'float';
  }

  analyze() {
    this.analyzeCount += 1;
  }

  generate() {
    this.generateCount += 1;
    return '1.0';
  }
}

function observableAccessor() {
  const node = new ObservableFloatNode();
  return {
    node,
    accessor: fromTSL(TSL.nodeObject(node), d.f32),
  };
}

function builderFor(stage: 'analyze' | 'generate') {
  const builder = new WGSLNodeBuilder();
  builder.setShaderStage('fragment');
  builder.setBuildStage(stage);
  return builder;
}

describe('TypeGPU node generation context', () => {
  it.each(['analyze', 'generate'] as const)(
    'restores the outer context after nested %s traversal',
    (stage) => {
      const before = observableAccessor();
      const inner = observableAccessor();
      const after = observableAccessor();

      const innerNode = toTSL(() => {
        'use gpu';
        return inner.accessor.$;
      });
      const innerNodeAccessor = fromTSL(innerNode, d.f32);

      const outerNode = toTSL(() => {
        'use gpu';
        return before.accessor.$ + innerNodeAccessor.$ + after.accessor.$;
      });

      expect(() => outerNode.build(builderFor(stage))).not.toThrow();

      if (stage === 'analyze') {
        expect(before.node.analyzeCount).toBe(1);
        expect(inner.node.analyzeCount).toBe(1);
        expect(after.node.analyzeCount).toBe(1);
      } else {
        expect(before.node.generateCount).toBe(1);
        expect(inner.node.generateCount).toBe(1);
        expect(after.node.generateCount).toBe(1);
      }
    },
  );

  it('restores the outer context when nested generation throws and is caught', () => {
    const before = observableAccessor();
    const after = observableAccessor();
    const fail = tgpu.comptime(() => {
      throw new Error('inner failure');
    });

    class CatchingNode extends THREE.Node {
      getNodeType() {
        return 'float';
      }

      generate(builder: THREE.NodeBuilder) {
        const throwingInner = toTSL(() => {
          'use gpu';
          fail();
          return d.f32(0);
        });

        expect(() => throwingInner.getNodeType(builder)).toThrow('inner failure');
        return '2.0';
      }
    }

    const catchingAccessor = fromTSL(TSL.nodeObject(new CatchingNode()), d.f32);
    const outerNode = toTSL(() => {
      'use gpu';
      return before.accessor.$ + catchingAccessor.$ + after.accessor.$;
    });

    expect(() => outerNode.build(builderFor('generate'))).not.toThrow();
    expect(before.node.generateCount).toBe(1);
    expect(after.node.generateCount).toBe(1);
  });
});
