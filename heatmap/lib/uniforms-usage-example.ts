/**
 * Example usage of UniformsBuilder in the 3D plotting library context
 */

import type { TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import {
  type BuiltUniforms,
  createUniformsBuilder,
  UniformPresets,
  type Uniforms,
  UniformsBuilder,
} from './uniforms-builder.js';

// ============================================================================
// Basic Plot Renderer Example
// ============================================================================

export class SurfaceRenderer {
  private uniforms?: Uniforms<{
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
  }>;

  async initialize(root: TgpuRoot) {
    // Using preset for standard PBR rendering
    const uniformsConfig = UniformPresets.pbr().build();

    // Create the actual GPU buffers
    const builder = UniformPresets.pbr();
    this.uniforms = await builder.createBuffers(root);

    // Now you can access typed buffers:
    // this.uniforms.cameraBuffer - camera data
    // this.uniforms.lightingBuffer - lighting data
    // this.uniforms.materialBuffer - material data

    console.log('Generated WGSL:', builder.generateWGSL());
  }

  updateCamera(viewMatrix: Float32Array, projectionMatrix: Float32Array) {
    if (this.uniforms) {
      // Type-safe access to camera buffer
      this.uniforms.cameraBuffer.write({
        view: viewMatrix,
        projection: projectionMatrix,
      });
    }
  }

  updateMaterial(
    albedo: [number, number, number],
    roughness: number,
    metallic: number,
  ) {
    if (this.uniforms) {
      // Type-safe access to material buffer
      this.uniforms.materialBuffer.write({
        albedo,
        roughness,
        metallic,
        opacity: 1.0,
      });
    }
  }
}

// ============================================================================
// Custom Plot Renderer Example
// ============================================================================

export class HeatmapRenderer {
  private uniforms?: Uniforms<{
    camera: d.WgslStruct<{ view: d.Mat4x4f; projection: d.Mat4x4f }>;
    plot: d.WgslStruct<{
      minValue: d.f32;
      maxValue: d.f32;
      colorScale: d.f32;
      pointSize: d.f32;
    }>;
    colormap: d.WgslStruct<{
      colors: d.WgslArray<d.Vec3f>;
      numColors: d.u32;
      scale: d.f32;
    }>;
  }>;

  private uniformsBuilder = createUniformsBuilder()
    .addCameraBuffer()
    .addPlotBuffer()
    .addBuffer(
      'colormap',
      d.struct({
        colors: d.arrayOf(d.vec3f, 256), // 256 colors for colormap
        numColors: d.u32,
        scale: d.f32,
      }),
      {
        numColors: 256,
        scale: 1.0,
      },
    );

  async initialize(root: TgpuRoot) {
    this.uniforms = await this.uniformsBuilder.createBuffers(root);

    // Initialize colormap with viridis colors
    const viridisColors = this.generateViridisColors(256);
    this.uniforms.colormapBuffer.write({
      colors: viridisColors,
      numColors: 256,
      scale: 1.0,
    });
  }

  updateDataRange(minValue: number, maxValue: number) {
    if (this.uniforms) {
      this.uniforms.plotBuffer.write({
        minValue,
        maxValue,
        colorScale: 1.0 / (maxValue - minValue),
        pointSize: 1.0,
      });
    }
  }

  private generateViridisColors(count: number): Float32Array {
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      // Simplified viridis approximation
      colors[i * 3 + 0] = 0.267004 + t * (0.993248 - 0.267004); // R
      colors[i * 3 + 1] = 0.004874 + t * (0.906157 - 0.004874); // G
      colors[i * 3 + 2] = 0.329415 + t * (0.143936 - 0.329415); // B
    }
    return colors;
  }

  getWGSL(): string {
    return this.uniformsBuilder.generateWGSL();
  }
}

// ============================================================================
// Animated Scatter Plot Example
// ============================================================================

export class AnimatedScatterRenderer {
  private uniforms?: Uniforms<{
    camera: d.WgslStruct<{ view: d.Mat4x4f; projection: d.Mat4x4f }>;
    time: d.WgslStruct<{ elapsed: d.f32; delta: d.f32 }>;
    animation: d.WgslStruct<{
      speed: d.f32;
      amplitude: d.f32;
      frequency: d.f32;
      phase: d.f32;
    }>;
    particles: d.WgslStruct<{
      count: d.u32;
      size: d.f32;
      color: d.Vec4f;
      fadeDistance: d.f32;
    }>;
  }>;

  private uniformsBuilder = createUniformsBuilder()
    .addCameraBuffer()
    .addTimeBuffer()
    .addBuffer(
      'animation',
      d.struct({
        speed: d.f32,
        amplitude: d.f32,
        frequency: d.f32,
        phase: d.f32,
      }),
      {
        speed: 1.0,
        amplitude: 1.0,
        frequency: 1.0,
        phase: 0.0,
      },
    )
    .addBuffer(
      'particles',
      d.struct({
        count: d.u32,
        size: d.f32,
        color: d.vec4f,
        fadeDistance: d.f32,
      }),
      {
        count: 1000,
        size: 2.0,
        color: [0.2, 0.6, 1.0, 1.0],
        fadeDistance: 50.0,
      },
    );

  async initialize(root: TgpuRoot) {
    this.uniforms = await this.uniformsBuilder.createBuffers(root);
  }

  updateTime(elapsed: number, delta: number) {
    if (this.uniforms) {
      this.uniforms.timeBuffer.write({ elapsed, delta });
    }
  }

  updateAnimation(speed: number, amplitude: number, frequency: number) {
    if (this.uniforms) {
      this.uniforms.animationBuffer.write({
        speed,
        amplitude,
        frequency,
        phase: performance.now() * 0.001,
      });
    }
  }

  setParticleProperties(
    count: number,
    size: number,
    color: [number, number, number, number],
  ) {
    if (this.uniforms) {
      this.uniforms.particlesBuffer.write({
        count,
        size,
        color,
        fadeDistance: 50.0,
      });
    }
  }
}

// ============================================================================
// Multi-Renderer Manager Example
// ============================================================================

export class PlotRendererManager {
  private renderers = new Map<string, {
    renderer: any;
    uniformsConfig: BuiltUniforms<any>;
  }>();

  async addRenderer(
    name: string,
    rendererType: 'surface' | 'heatmap' | 'scatter',
    root: TgpuRoot,
  ) {
    let renderer: any;
    let uniformsConfig: BuiltUniforms<any>;

    switch (rendererType) {
      case 'surface':
        renderer = new SurfaceRenderer();
        uniformsConfig = UniformPresets.pbr().build();
        break;

      case 'heatmap':
        renderer = new HeatmapRenderer();
        uniformsConfig = renderer.uniformsBuilder.build();
        break;

      case 'scatter':
        renderer = new AnimatedScatterRenderer();
        uniformsConfig = renderer.uniformsBuilder.build();
        break;

      default:
        throw new Error(`Unknown renderer type: ${rendererType}`);
    }

    await renderer.initialize(root);
    this.renderers.set(name, { renderer, uniformsConfig });

    return renderer;
  }

  getRenderer(name: string) {
    return this.renderers.get(name)?.renderer;
  }

  getAllWGSL(): Record<string, string> {
    const wgsl: Record<string, string> = {};

    for (const [name, { renderer }] of this.renderers) {
      if (renderer.getWGSL) {
        wgsl[name] = renderer.getWGSL();
      } else if (renderer.uniformsBuilder) {
        wgsl[name] = renderer.uniformsBuilder.generateWGSL();
      }
    }

    return wgsl;
  }

  updateAllCameras(viewMatrix: Float32Array, projectionMatrix: Float32Array) {
    for (const { renderer } of this.renderers.values()) {
      if (renderer.updateCamera) {
        renderer.updateCamera(viewMatrix, projectionMatrix);
      }
    }
  }
}

// ============================================================================
// Complete Usage Example
// ============================================================================

export async function completeExample(root: TgpuRoot) {
  // 1. Create a manager
  const manager = new PlotRendererManager();

  // 2. Add different types of renderers
  const surfaceRenderer = await manager.addRenderer('surface', 'surface', root);
  const heatmapRenderer = await manager.addRenderer('heatmap', 'heatmap', root);
  const scatterRenderer = await manager.addRenderer('scatter', 'scatter', root);

  // 3. Update camera for all renderers
  const viewMatrix = new Float32Array(16); // ... fill with view matrix
  const projectionMatrix = new Float32Array(16); // ... fill with projection matrix
  manager.updateAllCameras(viewMatrix, projectionMatrix);

  // 4. Update renderer-specific properties
  surfaceRenderer.updateMaterial([0.8, 0.2, 0.1], 0.5, 0.1);
  heatmapRenderer.updateDataRange(-1.0, 1.0);
  scatterRenderer.setParticleProperties(5000, 3.0, [1.0, 0.5, 0.0, 1.0]);

  // 5. Animation loop
  const animate = () => {
    const elapsed = performance.now() * 0.001;
    const delta = 1 / 60; // 60 FPS

    scatterRenderer.updateTime(elapsed, delta);
    scatterRenderer.updateAnimation(1.0, 2.0, 0.5);

    requestAnimationFrame(animate);
  };
  animate();

  // 6. Get all WGSL code for debugging
  const allWGSL = manager.getAllWGSL();
  console.log('Generated WGSL for all renderers:', allWGSL);

  return {
    manager,
    renderers: {
      surface: surfaceRenderer,
      heatmap: heatmapRenderer,
      scatter: scatterRenderer,
    },
  };
}

// ============================================================================
// Type Demonstrations
// ============================================================================

export namespace TypeDemos {
  // Demonstrate compile-time type safety
  export function typeSafetyDemo() {
    const builder = createUniformsBuilder()
      .addCameraBuffer('mainCamera')
      .addLightingBuffer('sceneLight');

    // This will have the correct type:
    type BuilderType = typeof builder;
    // BuilderType is UniformsBuilder<{
    //   mainCamera: d.WgslStruct<{ view: d.Mat4x4f; projection: d.Mat4x4f }>;
    //   sceneLight: d.WgslStruct<{ ambient: d.Vec3f; ... }>;
    // }>

    const config = builder.build();
    // config.uniforms will have:
    // - mainCameraBuffer: TgpuBuffer<...> & UniformFlag
    // - sceneLightBuffer: TgpuBuffer<...> & UniformFlag

    return config;
  }

  // Demonstrate method chaining
  export function chainingDemo() {
    const complexBuilder = createUniformsBuilder()
      .addCameraBuffer('camera')
      .addLightingBuffer('light')
      .addMaterialBuffer('material')
      .addTimeBuffer('time')
      .addPlotBuffer('plot')
      .addBuffer(
        'custom',
        d.struct({
          customValue: d.f32,
          customArray: d.arrayOf(d.vec3f, 100),
        }),
      );

    // Each method returns a new builder with extended types
    return complexBuilder.build();
  }
}
