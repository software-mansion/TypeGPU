import { useEffect, useRef, useState } from 'react';
import { demos, defaultParams, type DemoName } from './demos.ts';
import { createMeshViewer, type MeshViewer, type PreviewState, type Shading } from './viewer.ts';

export default function MeshPreview({ demo }: { demo: DemoName }) {
  return <Preview demo={demo} key={demo} />;
}

function Preview({ demo }: { demo: DemoName }) {
  const spec = demos[demo];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewer, setViewer] = useState<MeshViewer | null>(null);
  const [state, setState] = useState<PreviewState>({ status: 'loading' });
  const [shading, setShading] = useState<Shading>('smooth');
  const [paused, setPaused] = useState(false);
  const [params, setParams] = useState(() => defaultParams(spec));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let visible = false;
    let instance: MeshViewer | undefined;
    const updateActivity = () => instance?.setActive(visible && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      updateActivity();
    });
    observer.observe(canvas);
    document.addEventListener('visibilitychange', updateActivity);
    setPaused(window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    createMeshViewer(canvas, (value) => {
      if (!disposed) setState(value);
    })
      .then((value) => {
        if (disposed) {
          value.destroy();
          return;
        }
        instance = value;
        updateActivity();
        setViewer(value);
      })
      .catch((error: unknown) => {
        if (!disposed)
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
      });

    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener('visibilitychange', updateActivity);
      instance?.destroy();
    };
  }, []);

  useEffect(() => {
    viewer?.show(spec, params);
  }, [viewer, spec, params]);
  useEffect(() => {
    viewer?.setShading(shading);
  }, [viewer, shading]);
  useEffect(() => {
    viewer?.setPaused(paused);
  }, [viewer, paused]);

  return (
    <div className="not-content my-6 grid overflow-hidden rounded-sm border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)] md:grid-cols-[minmax(0,1fr)_13rem]">
      <div className="min-w-0 bg-[var(--sl-color-bg-inline-code)] p-3">
        <canvas
          aria-label={spec.description}
          className="block aspect-[4/3] w-full rounded-sm bg-[#171526]"
          height={300}
          ref={canvasRef}
          role="img"
          width={400}
        />
        {state.status === 'loading' && (
          <p className="mt-3 text-xs" role="status">
            Loading preview…
          </p>
        )}
        {state.status === 'error' && (
          <p className="mt-3 text-xs leading-5 text-[var(--sl-color-text)]" role="alert">
            Could not render preview: {state.message}
          </p>
        )}
      </div>
      <fieldset
        disabled={!viewer || state.status === 'error'}
        className="m-0 grid min-w-0 content-start gap-3 border-0 border-t border-[var(--sl-color-gray-5)] p-3 text-xs text-[var(--sl-color-gray-2)] md:border-l md:border-t-0"
      >
        <legend className="sr-only">Preview controls</legend>
        {spec.params.map((p) => {
          const set = (value: number) => setParams((previous) => ({ ...previous, [p.key]: value }));
          return (
            <label className="grid gap-1" key={p.key}>
              <span className="flex justify-between font-medium text-[var(--sl-color-text)]">
                <span>{p.label}</span>
                {p.kind === 'range' && <span>{params[p.key]}</span>}
              </span>
              {p.kind === 'select' ? (
                <select
                  className="rounded-sm border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)] px-2 py-1 text-[var(--sl-color-text)]"
                  onChange={(e) => set(Number(e.target.value))}
                  value={params[p.key]}
                >
                  {p.options.map((option, index) => (
                    <option key={option} value={index}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label={p.label}
                  className="w-full accent-[var(--sl-color-accent)]"
                  max={p.max}
                  min={p.min}
                  onChange={(e) => set(Number(e.target.value))}
                  step={p.step}
                  type="range"
                  value={params[p.key]}
                />
              )}
            </label>
          );
        })}
        <label className="grid gap-1 text-[var(--sl-color-text)]">
          <span className="font-medium">View</span>
          <select
            className="rounded-sm border border-[var(--sl-color-gray-5)] bg-[var(--sl-color-bg)] px-2 py-1"
            onChange={(e) => setShading(e.target.value as Shading)}
            value={shading}
          >
            <option value="smooth">Smooth</option>
            <option value="flat">Flat</option>
            <option value="wireframe">Wireframe</option>
          </select>
        </label>
        <button
          aria-pressed={paused}
          className="rounded-sm border border-[var(--sl-color-gray-5)] px-2 py-1 text-[var(--sl-color-text)]"
          onClick={() => setPaused((value) => !value)}
          type="button"
        >
          {paused ? 'Resume animation' : 'Pause animation'}
        </button>
      </fieldset>
    </div>
  );
}
