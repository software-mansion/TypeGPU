import { transform } from '@babel/standalone';
import typegpuPlugin from 'unplugin-typegpu/babel';
import * as typegpu from 'typegpu';
import * as gl from '@typegpu/gl';
import * as noise from '@typegpu/noise';
import * as sdf from '@typegpu/sdf';
import * as color from '@typegpu/color';
import {
  InspectableGlslGenerator,
  InspectableWgslGenerator,
  type Target,
  type TraceResult,
} from './trace.ts';

const modules: Record<string, unknown> = {
  typegpu,
  'typegpu/data': typegpu.d,
  'typegpu/std': typegpu.std,
  'typegpu/common': typegpu.common,
  '@typegpu/gl': gl,
  '@typegpu/noise': noise,
  '@typegpu/sdf': sdf,
  '@typegpu/color': color,
};

export function evaluateSource(
  source: string,
  filename = 'explorer.ts',
): Record<string, typegpu.ResolvableObject> {
  const transformed = transform(source, {
    filename,
    presets: ['typescript'],
    plugins: [typegpuPlugin, 'transform-modules-commonjs'],
  }).code;
  if (!transformed) throw new Error('Enter a TypeScript snippet to resolve.');
  const exports: Record<string, unknown> = {};
  const module = { exports };
  const requireModule = (id: string) => {
    if (!Object.hasOwn(modules, id)) {
      throw new Error(
        `Unsupported import "${id}". Available modules: ${Object.keys(modules).join(', ')}.`,
      );
    }
    // Babel's CommonJS interop must preserve the module's default export.
    return { ...(modules[id] as object), __esModule: true };
  };
  // Executed only inside a disposable worker by the app. No DOM or GPU device is needed.
  // oxlint-disable-next-line typescript/no-implied-eval -- The explorer intentionally evaluates user-authored modules in a terminable worker.
  new Function('require', 'module', 'exports', transformed)(requireModule, module, exports);
  const names = Object.keys(module.exports);
  if (names.length === 0) throw new Error('Export a TypeGPU function or value to resolve it.');
  // The resolver validates dynamically evaluated exports at runtime.
  return module.exports as Record<string, typegpu.ResolvableObject>;
}

export function compile(source: string, target: Target): TraceResult {
  const exports = evaluateSource(source);
  const generator =
    target === 'wgsl' ? new InspectableWgslGenerator() : new InspectableGlslGenerator();
  const code = typegpu.tgpu.resolve(Object.values(exports), {
    unstable_shaderGenerator: generator,
  });
  return { code, nodes: generator.nodes, exports: Object.keys(exports) };
}
