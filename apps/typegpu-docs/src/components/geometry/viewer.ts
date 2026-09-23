import { tgpu, type TgpuCommandEncoder, type TgpuRoot } from 'typegpu';
import { meshes } from '@typegpu/geometry';
import { type Demo, type PreviewMesh } from './demos.ts';
import { createRenderer } from './renderer.ts';
import { Parameters, Scene } from './shaders.ts';

export type Shading = 'smooth' | 'flat' | 'wireframe';
export type PreviewState = { status: 'loading' | 'ready' } | { status: 'error'; message: string };
export interface MeshViewer {
  show(demo: Demo, params: Record<string, number>): void;
  setShading(shading: Shading): void;
  setActive(active: boolean): void;
  setPaused(paused: boolean): void;
  destroy(): void;
}

let sharedRoot: Promise<TgpuRoot> | undefined;

export async function createMeshViewer(
  canvas: HTMLCanvasElement,
  onState: (state: PreviewState) => void = () => {},
): Promise<MeshViewer> {
  const root = await (sharedRoot ??= tgpu.init());
  const uniforms = root.createUniform(Scene);
  const renderer = createRenderer(root, canvas, uniforms);
  const ctx = { root, uniforms };
  let current:
    | {
        demo: Demo;
        params: Record<string, number>;
        mesh: PreviewMesh;
        update(encoder: TgpuCommandEncoder): void;
        draw(encoder: TgpuCommandEncoder, wireframe: boolean): void;
      }
    | undefined;
  let pending: { demo: Demo; params: Record<string, number> } | undefined;
  let building = false;
  let disposed = false;
  let failed = false;
  let active = true;
  let paused = false;
  let dirty = true;
  let shading: Shading = 'smooth';
  let seconds = 0;
  let previous: number | undefined;

  function fail(error: unknown) {
    failed = true;
    active = false;
    cancelAnimationFrame(frame);
    onState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
  }

  async function build(demo: Demo, params: Record<string, number>) {
    building = true;
    if (!current) onState({ status: 'loading' });
    let allocated: PreviewMesh | undefined;
    try {
      const mesh = await meshes.bakeAsync(root, demo.build(params, ctx));
      allocated = mesh;
      if (disposed) {
        mesh.destroy();
        return;
      }
      const [draw, deform] = await Promise.all([renderer.prepare(mesh), demo.update?.(mesh, ctx)]);
      if (disposed) {
        mesh.destroy();
        return;
      }
      const update = deform ?? ((encoder: TgpuCommandEncoder) => mesh.updateVertices({ encoder }));
      current?.mesh.destroy();
      current = { demo, params, mesh, update, draw };
      dirty = deform !== undefined;
      onState({ status: 'ready' });
    } catch (error) {
      allocated?.destroy();
      if (!disposed) fail(error);
    } finally {
      building = false;
    }
  }

  function render(now: number) {
    if (!active || disposed) return;
    try {
      if (!paused && previous !== undefined) seconds += Math.min((now - previous) * 0.001, 0.1);
      previous = now;
      uniforms.patch({ time: seconds });
      if (pending && !building) {
        const { demo, params } = pending;
        pending = undefined;
        const values = Parameters();
        for (const key of Object.keys(values) as (keyof typeof values)[]) {
          values[key] = params[key] ?? 0;
        }
        uniforms.patch({ params: values });
        const displayed = current;
        if (
          displayed?.demo === demo &&
          demo.rebuild.every((key) => displayed.params[key] === params[key])
        ) {
          displayed.params = params;
          dirty = true;
        } else {
          void build(demo, params);
        }
      }
      renderer.updateCamera(seconds);
      if (current) {
        const encoder = root['~unstable'].createCommandEncoder();
        if (dirty || (current.demo.animated && !paused)) current.update(encoder);
        current.draw(encoder, shading === 'wireframe');
        encoder.submit();
        dirty = false;
      }
      if (active) frame = requestAnimationFrame(render);
    } catch (error) {
      fail(error);
    }
  }
  let frame = requestAnimationFrame(render);

  return {
    show(demo, params) {
      pending = { demo, params };
    },
    setShading(value) {
      shading = value;
      uniforms.patch({
        flat: value === 'flat' ? 1 : 0,
        wireframe: value === 'wireframe' ? 1 : 0,
      });
    },
    setActive(value) {
      if (disposed || failed || active === value) return;
      active = value;
      previous = undefined;
      if (active) frame = requestAnimationFrame(render);
      else cancelAnimationFrame(frame);
    },
    setPaused(value) {
      paused = value;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      current?.mesh.destroy();
      renderer.destroy();
      uniforms.buffer.destroy();
    },
  };
}
