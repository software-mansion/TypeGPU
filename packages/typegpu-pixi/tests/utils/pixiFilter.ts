/**
 * Just enough of a PixiJS renderer for `createFilter`, without a canvas.
 */
import {
  type BindGroup,
  DOMAdapter,
  type Filter,
  type Renderer,
  RendererType,
  type WebGPURenderer,
} from 'pixi.js';

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

/**
 * A WebGPU renderer that has nothing but its device, and a bind group system
 * that can't build bind groups of its own
 */
export function fakeWebGPURenderer(device: GPUDevice): Renderer {
  return {
    type: RendererType.WEBGPU,
    gpu: { device },
    bindGroup: {
      getBindGroup(): GPUBindGroup {
        throw new Error('This renderer only binds what TypeGPU built');
      },
    },
  } as unknown as Renderer;
}

/** The bind group PixiJS would set at `index` when it draws with the filter */
export function gpuBindGroupOf(renderer: Renderer, filter: Filter, index: number): GPUBindGroup {
  return (renderer as WebGPURenderer).bindGroup.getBindGroup(
    filter.groups[index] as BindGroup,
    filter.gpuProgram,
    index,
  );
}

/** A WebGL renderer that has nothing but its type */
export function fakeWebGLRenderer(): Renderer {
  return { type: RendererType.WEBGL } as unknown as Renderer;
}

/** One module with both entry points */
export function wgslOf(filter: Filter): string {
  const program = filter.gpuProgram;
  if (!program) {
    throw new Error('The filter has no WGSL');
  }
  return program.vertex?.source ?? '';
}

/** The GLSL as PixiJS compiles it, after its own changes */
export function glslOf(filter: Filter): { vertex: string; fragment: string } {
  const program = filter.glProgram;
  if (!program) {
    throw new Error('The filter has no GLSL');
  }
  return { vertex: program.vertex ?? '', fragment: program.fragment ?? '' };
}
