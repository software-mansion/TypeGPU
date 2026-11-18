/**
 * Builds the shaders PixiJS 3D would compile, without a renderer or a canvas.
 *
 * PixiJS 3D has no public way to do this, so these helpers reach into its build output.
 * They only exist to check generated code against the shaders it actually ends up in.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  type BaseMaterial3D,
  type EffectFragment,
  Mesh3D,
  type ShaderBit,
  SphereGeometry,
  View3D,
} from '@pixi/3d';
import { DOMAdapter, type UNIFORM_TYPES } from 'pixi.js';

const dist = dirname(createRequire(import.meta.url).resolve('@pixi/3d'));

// oxlint-disable-next-line typescript/no-explicit-any -- PixiJS 3D's internals have no types
type Internal = any;

function internal(path: string): Promise<Record<string, Internal>> {
  return import(join(dist, path));
}

// PixiJS asks a WebGL context for its float precision when it creates a GLSL program
DOMAdapter.set({
  ...DOMAdapter.get(),
  createCanvas: () =>
    ({
      getContext: () => ({
        FRAGMENT_SHADER: 0x8b30,
        HIGH_FLOAT: 0x8df2,
        getShaderPrecisionFormat: () => ({ precision: 23 }),
        getExtension: () => null,
      }),
    }) as unknown as HTMLCanvasElement,
});

const fakeRenderer = {
  gpu: {
    device: {
      limits: { maxSamplersPerShaderStage: 1000, maxSampledTexturesPerShaderStage: 1000 },
    },
  },
  renderPipes: { view3d: { materialStoreBuffer: { register() {} } } },
  pipeline: { getPipelineKey: () => 0 },
};

export interface CompiledShaders {
  /** One module with both entry points, `mainVertex` and `mainFragment` */
  wgsl: string;
  glsl: { vertex: string; fragment: string };
}

/** The shaders of a sphere mesh drawn with `material`, in a view with default settings */
export async function compileMaterialShaders(
  createMaterial: () => BaseMaterial3D,
): Promise<CompiledShaders> {
  const { MaterialSystemGpu } = await internal('core/gpu/shader/MaterialSystemGpu.mjs');
  const { MaterialSystemGl } = await internal('core/gl/shader/MaterialSystemGl.mjs');

  const compile = (System: new (renderer: unknown) => Internal) => {
    const mesh = new Mesh3D({
      geometry: new SphereGeometry({ radius: 1 }),
      material: createMaterial(),
    });
    const view3d = new View3D({ width: 100, height: 100 });
    new System(fakeRenderer).ensureMaterial(mesh, { instanceStoreBuffer: undefined }, view3d);

    const caches = Object.values((mesh as unknown as { _passCache: object })._passCache);
    return (caches.find(Boolean) as { shader: Internal }).shader;
  };

  const gpuShader = compile(MaterialSystemGpu);
  const glShader = compile(MaterialSystemGl);

  return {
    wgsl: gpuShader.gpuProgram.vertex.source,
    glsl: { vertex: glShader.glProgram.vertex, fragment: glShader.glProgram.fragment },
  };
}

/** The shaders of a `FullscreenPass` that draws `fragment`, reading colour and depth */
export async function compileEffectShaders(
  fragment: EffectFragment,
  uniformTypes: Record<string, UNIFORM_TYPES> = {},
): Promise<CompiledShaders> {
  const { compileWgslSource } = await internal('core/gpu/codegen/compileWgslSource.mjs');
  const { compileGlslSource } = await internal('core/gl/codegen/compileGlslSource.mjs');
  const { globalBitGpu } = await internal('core/gpu/shader/globalBitGpu.mjs');
  const { globalBitGl } = await internal('core/gl/shader/globalBitGl.mjs');
  const { cameraBit } = await internal('core/shader/bits/cameraBit.mjs');
  const fx = await internal('post-processing/effects/fullscreenEffectShader.mjs');

  // What `FullscreenPass` builds around an effect's fragment
  const fragmentBit: ShaderBit = {
    name: 'effectFragment:test',
    bindings: { fx: uniformTypes },
    gpu: { header: fragment.gpu },
    gl: { header: fragment.gl },
  };
  const bits = (depthReadBit: ShaderBit) => [
    fx.fxhBit,
    fx.colorReadBit,
    fx.color2ReadBit,
    depthReadBit,
    fragmentBit,
  ];

  const gpu = compileWgslSource({
    bits: [globalBitGpu, cameraBit, ...bits(fx.depthReadBitGpu)],
    template: fx.fullscreenEffectTemplate,
  });
  const gl = compileGlslSource({
    bits: [globalBitGl, cameraBit, ...bits(fx.depthReadBitGl)],
    template: fx.fullscreenEffectTemplate,
    useLocations: false,
  });

  return { wgsl: gpu.vertex.source, glsl: { vertex: gl.vertex, fragment: gl.fragment } };
}
