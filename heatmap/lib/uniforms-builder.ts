/**
 * UniformsBuilder - Flexible builder pattern for creating typed uniform buffer configurations
 */

import type { TgpuBuffer, TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';

// Base uniform flag type
export interface UniformFlag {
  readonly __uniformFlag: unique symbol;
}

// Generic uniforms interface
export interface Uniforms<TBuffers extends Record<string, d.WgslType> = {}> {
  [K in keyof TBuffers as `${K & string}Buffer`]: TgpuBuffer<TBuffers[K]> & UniformFlag;
}

// Buffer descriptor for configuration
export interface BufferDescriptor<T extends d.WgslType = d.WgslType> {
  name: string;
  type: T;
  initialData?: any;
  usage?: GPUBufferUsageFlags;
}

// Built uniform result
export interface BuiltUniforms<T extends Record<string, d.WgslType>> {
  uniforms: Uniforms<T>;
  descriptors: BufferDescriptor[];
  bindGroupLayout: GPUBindGroupLayoutDescriptor;
  createBindGroup: (device: GPUDevice) => GPUBindGroup;
}

/**
 * UniformsBuilder class for creating typed uniform buffer configurations
 */
export class UniformsBuilder<T extends Record<string, d.WgslType> = {}> {
  private buffers: Map<string, BufferDescriptor> = new Map();
  private bindingCounter = 0;

  /**
   * Add a uniform buffer to the configuration
   */
  addBuffer<K extends string, V extends d.WgslType>(
    name: K,
    type: V,
    initialData?: any,
    usage?: GPUBufferUsageFlags
  ): UniformsBuilder<T & Record<K, V>> {
    const descriptor: BufferDescriptor<V> = {
      name,
      type,
      initialData,
      usage: usage || GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    };

    const newBuilder = new UniformsBuilder<T & Record<K, V>>();

    // Copy existing buffers
    for (const [key, value] of this.buffers) {
      newBuilder.buffers.set(key, value);
    }

    // Add new buffer
    newBuilder.buffers.set(name, descriptor);
    newBuilder.bindingCounter = this.bindingCounter + 1;

    return newBuilder;
  }

  /**
   * Add a camera buffer with standard view/projection matrices
   */
  addCameraBuffer(
    name: string = 'camera',
    initialData?: { view?: Float32Array; projection?: Float32Array }
  ): UniformsBuilder<T & Record<typeof name, d.WgslStruct<{ view: d.Mat4x4f; projection: d.Mat4x4f }>>> {
    return this.addBuffer(
      name,
      d.struct({
        view: d.mat4x4f,
        projection: d.mat4x4f,
      }),
      initialData
    ) as any;
  }

  /**
   * Add a lighting buffer with common lighting properties
   */
  addLightingBuffer(
    name: string = 'lighting',
    initialData?: {
      ambient?: [number, number, number];
      directional?: [number, number, number];
      position?: [number, number, number];
      color?: [number, number, number];
      intensity?: number;
    }
  ): UniformsBuilder<T & Record<typeof name, d.WgslStruct<{
    ambient: d.Vec3f;
    directional: d.Vec3f;
    position: d.Vec3f;
    color: d.Vec3f;
    intensity: d.f32;
  }>>> {
    return this.addBuffer(
      name,
      d.struct({
        ambient: d.vec3f,
        directional: d.vec3f,
        position: d.vec3f,
        color: d.vec3f,
        intensity: d.f32,
      }),
      initialData
    ) as any;
  }

  /**
   * Add a material buffer with PBR properties
   */
  addMaterialBuffer(
    name: string = 'material',
    initialData?: {
      albedo?: [number, number, number];
      roughness?: number;
      metallic?: number;
      opacity?: number;
    }
  ): UniformsBuilder<T & Record<typeof name, d.WgslStruct<{
    albedo: d.Vec3f;
    roughness: d.f32;
    metallic: d.f32;
    opacity: d.f32;
  }>>> {
    return this.addBuffer(
      name,
      d.struct({
        albedo: d.vec3f,
        roughness: d.f32,
        metallic: d.f32,
        opacity: d.f32,
      }),
      initialData
    ) as any;
  }

  /**
   * Add a time buffer for animations
   */
  addTimeBuffer(
    name: string = 'time',
    initialData?: { elapsed?: number; delta?: number }
  ): UniformsBuilder<T & Record<typeof name, d.WgslStruct<{
    elapsed: d.f32;
    delta: d.f32;
  }>>> {
    return this.addBuffer(
      name,
      d.struct({
        elapsed: d.f32,
        delta: d.f32,
      }),
      initialData
    ) as any;
  }

  /**
   * Add a plot-specific buffer for plot parameters
   */
  addPlotBuffer(
    name: string = 'plot',
    initialData?: {
      minValue?: number;
      maxValue?: number;
      colorScale?: number;
      pointSize?: number;
    }
  ): UniformsBuilder<T & Record<typeof name, d.WgslStruct<{
    minValue: d.f32;
    maxValue: d.f32;
    colorScale: d.f32;
    pointSize: d.f32;
  }>>> {
    return this.addBuffer(
      name,
      d.struct({
        minValue: d.f32,
        maxValue: d.f32,
        colorScale: d.f32,
        pointSize: d.f32,
      }),
      initialData
    ) as any;
  }

  /**
   * Build the final uniforms configuration
   */
  build(): BuiltUniforms<T> {
    const descriptors = Array.from(this.buffers.values());
    const bindGroupLayoutEntries: GPUBindGroupLayoutEntry[] = [];

    let binding = 0;
    for (const descriptor of descriptors) {
      bindGroupLayoutEntries.push({
        binding,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: {
          type: 'uniform',
        },
      });
      binding++;
    }

    const bindGroupLayout: GPUBindGroupLayoutDescriptor = {
      entries: bindGroupLayoutEntries,
    };

    return {
      uniforms: {} as Uniforms<T>, // This will be populated when buffers are created
      descriptors,
      bindGroupLayout,
      createBindGroup: (device: GPUDevice) => this.createBindGroup(device, descriptors),
    };
  }

  /**
   * Create actual GPU buffers and bind group
   */
  async createBuffers(root: TgpuRoot): Promise<Uniforms<T>> {
    const uniforms: any = {};

    for (const [name, descriptor] of this.buffers) {
      const buffer = root
        .createBuffer(descriptor.type, descriptor.initialData)
        .$usage('uniform');

      uniforms[`${name}Buffer`] = buffer;
    }

    return uniforms as Uniforms<T>;
  }

  /**
   * Create a bind group from the descriptors
   */
  private createBindGroup(device: GPUDevice, descriptors: BufferDescriptor[]): GPUBindGroup {
    // This is a placeholder - in practice, you'd need the actual GPU buffers
    // This method would be called after createBuffers()
    throw new Error('createBindGroup should be called with actual GPU buffers');
  }

  /**
   * Generate WGSL struct definitions for the uniforms
   */
  generateWGSL(): string {
    let wgsl = '';
    let binding = 0;

    for (const [name, descriptor] of this.buffers) {
      wgsl += `@binding(${binding}) @group(0) var<uniform> ${name}: ${this.typeToWGSL(descriptor.type)};\n`;
      binding++;
    }

    return wgsl;
  }

  /**
   * Convert TypeGPU type to WGSL string (simplified)
   */
  private typeToWGSL(type: d.WgslType): string {
    // This is a simplified implementation
    // In practice, you'd need to handle all TypeGPU types properly
    if ('fields' in type) {
      // Struct type
      const fields = Object.entries(type.fields as any)
        .map(([name, fieldType]) => `${name}: ${this.typeToWGSL(fieldType as d.WgslType)}`)
        .join(',\n  ');
      return `struct {\n  ${fields}\n}`;
    }

    // Handle primitive types
    const typeStr = type.toString();
    if (typeStr.includes('mat4x4')) return 'mat4x4<f32>';
    if (typeStr.includes('vec3')) return 'vec3<f32>';
    if (typeStr.includes('vec4')) return 'vec4<f32>';
    if (typeStr.includes('f32')) return 'f32';
    if (typeStr.includes('i32')) return 'i32';
    if (typeStr.includes('u32')) return 'u32';

    return 'f32'; // fallback
  }

  /**
   * Get the number of buffers configured
   */
  get bufferCount(): number {
    return this.buffers.size;
  }

  /**
   * Get buffer names
   */
  get bufferNames(): string[] {
    return Array.from(this.buffers.keys());
  }
}

/**
 * Create a new UniformsBuilder
 */
export function createUniformsBuilder(): UniformsBuilder {
  return new UniformsBuilder();
}

/**
 * Predefined uniform configurations for common use cases
 */
export const UniformPresets = {
  /**
   * Basic 3D rendering uniforms (camera only)
   */
  basic(): UniformsBuilder<{
    camera: d.WgslStruct<{ view: d.Mat4x4f; projection: d.Mat4x4f }>;
  }> {
    return createUniformsBuilder().addCameraBuffer();
  },

  /**
   * Standard 3D rendering with lighting
   */
  standard(): UniformsBuilder<{
    camera: d.WgslStruct<{ view: d.Mat4x4f; projection: d.Mat4x4f }>;
    lighting: d.WgslStruct<{
      ambient: d.Vec3f;
      directional: d.Vec3f;
      position: d.Vec3f;
      color: d.Vec3f;
      intensity: d.f32;
    }>;
  }> {
    return createUniformsBuilder()
      .addCameraBuffer()
      .addLightingBuffer();
  },

  /**
   * PBR rendering uniforms
   */
  pbr(): UniformsBuilder<{
    camera: d.WgslStruct<{ view: d.Mat4x4f; projection: d.Mat4x4f }>;
    lighting: d.WgslStruct<{
      ambient: d.Vec3f;
      directional: d.Vec3f;
      position: d.Vec3f;
      color: d.Vec3f;
      intensity: d.f32;
    }>;
    material: d.WgslStruct<{
      albedo: d.Vec3f;
      roughness: d.f32;
      metallic: d.f32;
      opacity: d.f32;
    }>;
  }> {
    return createUniformsBuilder()
      .addCameraBuffer()
      .addLightingBuffer()
      .addMaterialBuffer();
  },

  /**
   * Plot rendering with animation support
   */
  plot(): UniformsBuilder<{
    camera: d.WgslStruct<{ view: d.Mat4x4f; projection: d.Mat4x4f }>;
    plot: d.WgslStruct<{
      minValue: d.f32;
      maxValue: d.f32;
      colorScale: d.f32;
      pointSize: d.f32;
    }>;
    time: d.WgslStruct<{
      elapsed: d.f32;
      delta: d.f32;
    }>;
  }> {
    return createUniformsBuilder()
      .addCameraBuffer()
      .addPlotBuffer()
      .addTimeBuffer();
  },
};

/**
 * Example usage and type demonstrations
 */
export namespace Examples {
  // Basic usage
  export function basicExample() {
    const builder = createUniformsBuilder()
      .addCameraBuffer('mainCamera')
      .addLightingBuffer('sceneLight')
      .addMaterialBuffer('defaultMaterial');

    const config = builder.build();
    // Type: BuiltUniforms<{
    //   mainCamera: d.WgslStruct<{ view: d.Mat4x4f; projection: d.Mat4x4f }>;
    //   sceneLight: d.WgslStruct<{ ambient: d.Vec3f; ... }>;
    //   defaultMaterial: d.WgslStruct<{ albedo: d.Vec3f; ... }>;
    // }>

    return config;
  }

  // Preset usage
  export function presetExample() {
    const pbrUniforms = UniformPresets.pbr().build();
    // Automatically includes camera, lighting, and material buffers

    return pbrUniforms;
  }

  // Custom buffer types
  export function customExample() {
    const customBuilder = createUniformsBuilder()
      .addCameraBuffer()
      .addBuffer('custom', d.struct({
        customValue: d.f32,
        customColor: d.vec3f,
        customMatrix: d.mat4x4f,
      }), {
        customValue: 1.0,
        customColor: [1.0, 0.0, 0.0],
        customMatrix: new Float32Array(16),
      });

    return customBuilder.build();
  }

  // Plot-specific example
  export function plotExample() {
    const plotBuilder = UniformPresets.plot()
      .addMaterialBuffer('surfaceMaterial')
      .addBuffer('colormap', d.struct({
        colors: d.array(d.vec3f, 256),
        scale: d.f32,
      }));

    return plotBuilder.build();
  }
}
