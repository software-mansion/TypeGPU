import { meshes } from '@typegpu/geometry';
import { d, std, tgpu, type TgpuRoot, type TgpuUniform } from 'typegpu';
import { Paint, type VertexSchema, type Scene } from './shaders.ts';

const TAU = Math.PI * 2;
const SHAPES = [
  'sphere',
  'box',
  'cylinder',
  'torus',
  'plane',
  'icosphere',
  'capsule',
  'rounded box',
] as const;

type Param = { key: string; label: string; value: number } & (
  | { kind: 'select'; options: readonly string[] }
  | { kind: 'range'; min: number; max: number; step: number }
);
export type PreviewMesh = meshes.BakedIndexed<VertexSchema>;
export type DemoContext = { root: TgpuRoot; uniforms: TgpuUniform<typeof Scene> };
export interface Demo {
  description: string;
  params: Param[];
  rebuild: string[];
  animated?: boolean;
  build(params: Record<string, number>, ctx: DemoContext): meshes.IndexedGeometry<VertexSchema>;
  update?(mesh: PreviewMesh, ctx: DemoContext): Promise<() => void>;
}

export const demos: Record<DemoName, Demo> = {
  primitives: {
    description: 'A primitive mesh with adjustable tessellation',
    params: [
      { key: 'shape', label: 'Shape', kind: 'select', options: SHAPES, value: 0 },
      { key: 'detail', label: 'Detail', kind: 'range', min: 3, max: 48, step: 1, value: 16 },
    ],
    rebuild: ['shape', 'detail'],
    build: ({ shape, detail }) => {
      switch (SHAPES[shape]) {
        case 'icosphere':
          return meshes.icosphere({ segments: detail });
        case 'capsule':
          return meshes.capsule({ segments: detail });
        case 'rounded box':
          return meshes.roundedBox({ segments: detail });
        case 'box':
          return meshes.box({
            widthSegments: detail,
            heightSegments: detail,
            depthSegments: detail,
          });
        case 'cylinder':
          return meshes.cylinder({ radialSegments: detail });
        case 'torus':
          return meshes.torus({ ringSegments: detail * 2, tubeSegments: detail });
        case 'plane':
          return meshes.plane({ widthSegments: detail, depthSegments: detail });
        default:
          return meshes.sphere({ segments: detail * 2, rings: detail });
      }
    },
  },
  ripple: {
    description: 'A parametric ripple sampled on an adjustable grid',
    params: [
      { key: 'cols', label: 'Columns', kind: 'range', min: 1, max: 64, step: 1, value: 24 },
      { key: 'rows', label: 'Rows', kind: 'range', min: 1, max: 64, step: 1, value: 24 },
      {
        key: 'amplitude',
        label: 'Amplitude',
        kind: 'range',
        min: 0,
        max: 0.3,
        step: 0.01,
        value: 0.1,
      },
      {
        key: 'frequency',
        label: 'Frequency',
        kind: 'range',
        min: 1,
        max: 24,
        step: 0.5,
        value: 10,
      },
    ],
    rebuild: ['cols', 'rows'],
    build: ({ cols, rows }, { uniforms }) =>
      meshes.parametric(
        {
          at: (u, v) => {
            'use gpu';
            const amplitude = uniforms.$.params.amplitude;
            const frequency = uniforms.$.params.frequency;
            const height = amplitude * std.sin(u * frequency) * std.cos(v * frequency);
            return d.vec3f(u - 0.5, height, 0.5 - v);
          },
        },
        { cols, rows },
      ),
  },
  gyroscope: {
    description: 'Torus meshes rotated and combined into concentric rings',
    params: [
      { key: 'count', label: 'Rings', kind: 'range', min: 1, max: 8, step: 1, value: 3 },
      { key: 'tilt', label: 'Tilt', kind: 'range', min: 0, max: 1.5, step: 0.05, value: 0.6 },
    ],
    rebuild: ['count'],
    build: ({ count }, { uniforms }) => {
      const ring = meshes.torus({ radius: 0.45, tube: 0.04, ringSegments: 48, tubeSegments: 12 });
      const tilted = meshes.map(ring, meshes.Surface, (v) => {
        'use gpu';
        const rotation = std.rotationX4(uniforms.$.params.tilt);
        return meshes.Surface({
          position: std.mul(rotation, d.vec4f(v.position, 1)).xyz,
          normal: std.mul(rotation, d.vec4f(v.normal, 0)).xyz,
          uv: v.uv,
        });
      });
      return meshes.concat(
        ...Array.from({ length: count }, (_, i) =>
          meshes.transform(tilted, std.rotationY4((i * Math.PI) / count)),
        ),
      );
    },
  },
  stripes: {
    description: 'A torus with vertex colors forming a twisting striped pattern',
    params: [
      { key: 'stripes', label: 'Stripes', kind: 'range', min: 1, max: 24, step: 1, value: 8 },
      { key: 'twist', label: 'Twist', kind: 'range', min: 0, max: 6, step: 0.25, value: 2 },
      { key: 'hue', label: 'Hue', kind: 'range', min: 0, max: 1, step: 0.01, value: 0 },
    ],
    rebuild: [],
    build: (_, { uniforms }) =>
      meshes.attach(meshes.torus({ ringSegments: 128, tubeSegments: 48 }), Paint, (s) => {
        'use gpu';
        const stripes = uniforms.$.params.stripes;
        const twist = uniforms.$.params.twist;
        const hue = uniforms.$.params.hue;
        const wave = std.sin((s.uv.x * stripes + s.uv.y * twist) * TAU);
        const phases = std.mul(std.add(hue + s.uv.x, d.vec3f(0, 0.33, 0.67)), TAU);
        const palette = std.add(std.mul(std.cos(phases), 0.5), 0.5);
        return Paint({ color: std.mul(palette, 0.55 + 0.45 * wave) });
      }),
  },
  deformation: {
    description: 'A subdivided plane deformed in place by a compute shader',
    params: [
      {
        key: 'amplitude',
        label: 'Amplitude',
        kind: 'range',
        min: 0,
        max: 0.3,
        step: 0.01,
        value: 0.1,
      },
      { key: 'frequency', label: 'Frequency', kind: 'range', min: 1, max: 16, step: 0.5, value: 6 },
    ],
    rebuild: [],
    animated: true,
    build: () => meshes.plane({ width: 1.4, depth: 1.4, widthSegments: 64, depthSegments: 64 }),
    update: async (mesh, { root, uniforms }) => {
      const vertices = mesh.vertices.as('mutable');
      const pipeline = root.createComputePipeline({
        compute: tgpu.computeFn({ workgroupSize: [64], in: { gid: d.builtin.globalInvocationId } })(
          ({ gid }) => {
            'use gpu';
            if (gid.x >= mesh.vertexCount) return;
            const amplitude = uniforms.$.params.amplitude;
            const frequency = uniforms.$.params.frequency;
            const v = vertices.$[gid.x];
            const phase = v.position.x * frequency + uniforms.$.time;
            v.position.y = amplitude * std.sin(phase);
            v.normal = std.normalize(d.vec3f(-amplitude * frequency * std.cos(phase), 1, 0));
          },
        ),
      });
      await pipeline.initAsync();
      const workgroups = Math.ceil(mesh.vertexCount / 64);
      return () => pipeline.dispatchWorkgroups(workgroups);
    },
  },
};

export type DemoName = 'primitives' | 'ripple' | 'gyroscope' | 'stripes' | 'deformation';

export function defaultParams(demo: Demo) {
  return Object.fromEntries(demo.params.map((p) => [p.key, p.value]));
}
