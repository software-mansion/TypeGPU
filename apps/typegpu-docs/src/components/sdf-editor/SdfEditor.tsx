import { Suspense, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import ExplorerEditor from '../explorer/ExplorerEditor.tsx';
import { defaultScene } from './defaultScene.ts';
import { createRenderer, type SceneRenderer } from './renderer.ts';
import type { SceneResponse } from './compiler.worker.ts';
// oxlint-disable-next-line import/no-unassigned-import -- Page-scoped styles.
import './sdf-editor.css';

export default function SdfEditor() {
  const [source, setSource] = useState(defaultScene);
  const [dark, setDark] = useState(false);
  const [renderer, setRenderer] = useState<SceneRenderer>();
  const [status, setStatus] = useState('Starting WebGPU…');
  const [error, setError] = useState('');
  const [gpuError, setGpuError] = useState('');
  const [paused, setPaused] = useState(false);
  const [revision, setRevision] = useState(0);
  const [hasPreview, setHasPreview] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<{ id: number; x: number; y: number } | undefined>(undefined);

  useEffect(() => {
    const update = () => setDark(document.documentElement.dataset.theme === 'dark');
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let active = true;
    let current: SceneRenderer | undefined;
    void createRenderer(element, (message) => {
      if (active) setGpuError(message);
    })
      .then((value) => {
        if (!active) {
          value.destroy();
          return;
        }
        current = value;
        setRenderer(value);
      })
      .catch((reason: unknown) => {
        if (active) setGpuError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
      current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!renderer) return;
    const element = canvas.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      renderer.zoom(event.deltaY);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [renderer]);

  useEffect(() => {
    renderer?.setPaused(paused);
  }, [renderer, paused]);

  useEffect(() => {
    if (!renderer) return;
    let active = true;
    let worker: Worker | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setStatus('Waiting for edits…');
    renderer.invalidate();
    const debounce = setTimeout(() => {
      setStatus('Compiling…');
      setError('');
      worker = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' });
      const fail = (message: string) => {
        if (!active) return;
        clearTimeout(timeout);
        worker?.terminate();
        setError(message);
        setStatus('Could not compile');
      };
      timeout = setTimeout(
        () => fail('Compilation timed out. Simplify the scene and try again.'),
        15000,
      );
      worker.onerror = (event) => fail(event.message || 'Could not start the shader compiler.');
      worker.onmessage = (event: MessageEvent<SceneResponse>) => {
        clearTimeout(timeout);
        worker?.terminate();
        if (!active) return;
        if (event.data.error !== undefined) {
          fail(event.data.error);
          return;
        }
        setStatus('Building preview…');
        void renderer
          .setShader(event.data.code)
          .then((applied) => {
            if (active && applied) {
              setStatus('Live');
              setHasPreview(true);
              setError('');
            }
          })
          .catch((reason: unknown) =>
            fail(reason instanceof Error ? reason.message : String(reason)),
          );
      };
      worker.postMessage(source, []);
    }, 450);
    return () => {
      active = false;
      clearTimeout(debounce);
      clearTimeout(timeout);
      worker?.terminate();
      renderer.invalidate();
    };
  }, [source, renderer, revision]);

  return (
    <main className="sdf-editor">
      <header className="sdf-heading">
        <div>
          <h1>SDF editor</h1>
          <p>Edit the scene. See it in 3D.</p>
        </div>
        <span className="sdf-status" role="status">
          {gpuError ? 'WebGPU unavailable' : status}
        </span>
      </header>
      <div className="sdf-workspace">
        <section className="sdf-source" aria-label="Scene source">
          <div className="sdf-panel-heading">
            <span>scene.ts</span>
            <span>TypeScript · auto compile</span>
          </div>
          <div className="sdf-code">
            <Suspense fallback={<div className="sdf-loading">Loading editor…</div>}>
              <ExplorerEditor
                value={source}
                onChange={setSource}
                onResolve={() => setRevision((value) => value + 1)}
                dark={dark}
                path="sdf-editor/scene.ts"
                tsoverEnabled
              />
            </Suspense>
          </div>
          <div className="sdf-footnote">
            Export <code>scene(point, time)</code> → <code>{'{ dist, color }'}</code>
          </div>
        </section>
        <section className="sdf-preview" aria-label="Ray-marched preview">
          <div className="sdf-panel-heading">
            <span>Preview</span>
            <div className="sdf-controls">
              <button
                aria-label={paused ? 'Resume animation' : 'Pause animation'}
                onClick={() => setPaused(!paused)}
                disabled={!renderer}
              >
                {paused ? <Play size={14} /> : <Pause size={14} />}
              </button>
              <button onClick={() => renderer?.reset()} disabled={!renderer}>
                <RotateCcw size={14} /> Reset view
              </button>
            </div>
          </div>
          <div className="sdf-canvas-wrap">
            <canvas
              ref={canvas}
              aria-label="SDF scene. Drag to orbit, scroll to zoom. Arrow keys orbit and plus or minus zoom."
              tabIndex={0}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const last = pointer.current;
                if (!last || last.id !== event.pointerId) return;
                renderer?.orbit(event.clientX - last.x, event.clientY - last.y);
                pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
              }}
              onPointerUp={() => {
                pointer.current = undefined;
              }}
              onPointerCancel={() => {
                pointer.current = undefined;
              }}
              onLostPointerCapture={() => {
                pointer.current = undefined;
              }}
              onKeyDown={(event) => {
                const directions: Record<string, [number, number]> = {
                  ArrowLeft: [-12, 0],
                  ArrowRight: [12, 0],
                  ArrowUp: [0, -12],
                  ArrowDown: [0, 12],
                };
                const delta = directions[event.key];
                if (delta) {
                  event.preventDefault();
                  renderer?.orbit(...delta);
                } else if (event.key === '+' || event.key === '=') {
                  event.preventDefault();
                  renderer?.zoom(-120);
                } else if (event.key === '-') {
                  event.preventDefault();
                  renderer?.zoom(120);
                }
              }}
            />
            {!hasPreview && !gpuError && (
              <div className="sdf-overlay">
                {error ? 'Fix the scene to start the preview.' : status}
              </div>
            )}
            {gpuError && (
              <div className="sdf-overlay" role="alert">
                {gpuError}
              </div>
            )}
          </div>
          <div className="sdf-footnote">
            Drag to orbit · scroll to zoom<span>Soft shadows · ambient occlusion</span>
          </div>
          {error && (
            <div className="sdf-error" role="alert">
              <span>{hasPreview ? 'Showing the last working scene.' : 'Scene error'}</span>
              <pre>{error}</pre>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
