import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-react';
import TraceTree from './TraceTree.tsx';
import ExplorerEditor from './ExplorerEditor.tsx';
import type { CompileResponse } from './compiler.worker.ts';
import type { Target, TraceResult } from './trace.ts';
import { samples } from './samples.ts';
// oxlint-disable-next-line import/no-unassigned-import -- Page-scoped styles.
import './explorer.css';

export default function ExplorerApp() {
  const [source, setSource] = useState(samples['Vector math']);
  const [target, setTarget] = useState<Target>('wgsl');
  const [result, setResult] = useState<TraceResult>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedId, setSelectedId] = useState<number>();
  const [playing, setPlaying] = useState(false);
  const [dark, setDark] = useState(false);
  const [compiledSource, setCompiledSource] = useState('');
  const [copied, setCopied] = useState(false);
  const cancelRef = useRef<() => void>(() => {});
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const compileSource = (code: string, language: Target) => {
    cancelRef.current();
    setBusy(true);
    setError('');
    setPlaying(false);
    setResult(undefined);
    setStep(0);
    setSelectedId(undefined);
    const worker = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' });
    const timeout = window.setTimeout(
      () => finish('Compilation timed out after 15 seconds. Try a smaller snippet.'),
      15000,
    );
    const cleanup = () => {
      window.clearTimeout(timeout);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };
    cancelRef.current = cleanup;
    const finish = (message?: string, next?: TraceResult) => {
      cleanup();
      setBusy(false);
      if (message) setError(message);
      if (next) {
        setResult(next);
        setCompiledSource(code);
      }
    };
    worker.onmessage = (event: MessageEvent<CompileResponse>) =>
      finish(event.data.error, event.data.result);
    worker.onerror = (event) => finish(event.message || 'Could not start the compiler.');
    worker.postMessage({ source: code, target: language }, []);
  };

  useEffect(() => {
    compileSource(sourceRef.current, target);
    return () => cancelRef.current();
  }, [target]);

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

  const timeline = useMemo(
    () => (result?.nodes ?? []).toSorted((a, b) => a.step - b.step),
    [result],
  );
  const current = timeline[step - 1];
  const selected = result?.nodes.find((node) => node.id === selectedId) ?? current ?? timeline[0];
  const total = timeline.length;

  useEffect(() => {
    if (!playing) return;
    if (step >= total) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setStep((value) => value + 1);
      setSelectedId(undefined);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [playing, step, total]);

  const seek = (value: number) => {
    setPlaying(false);
    setSelectedId(undefined);
    setStep(value);
  };

  return (
    <main
      className="explorer"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          compileSource(source, target);
        }
      }}
    >
      <div className="explorer-heading">
        <div>
          <h1>Shader explorer</h1>
          <p>TypeScript to shader code, one node at a time.</p>
        </div>
        <div className="explorer-actions">
          <label className="sample-picker">
            Example
            <select
              aria-label="Load example"
              value={Object.entries(samples).find(([, code]) => code === source)?.[0] ?? ''}
              onChange={(event) => {
                const code = samples[event.target.value as keyof typeof samples];
                setSource(code);
                compileSource(code, target);
              }}
            >
              <option value="" disabled>
                Custom snippet
              </option>
              {Object.keys(samples).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <button className="run-button" onClick={() => compileSource(source, target)}>
            <Play size={15} />
            {busy ? 'Restart' : 'Resolve'}
            <kbd>⌘ ↵</kbd>
          </button>
        </div>
      </div>

      <div className="explorer-workspace">
        <section className="explorer-panel source-panel" aria-label="Source editor">
          <div className="panel-heading">
            <span>TypeScript</span>
            <span className="muted">explorer.ts</span>
          </div>
          <div className="source-editor">
            <Suspense fallback={<div className="panel-empty">Loading editor…</div>}>
              <ExplorerEditor
                value={source}
                onChange={setSource}
                onResolve={() => compileSource(source, target)}
                dark={dark}
              />
            </Suspense>
          </div>
          <div className="panel-footnote">
            Export values to include them in <code>tgpu.resolve([...])</code>.
          </div>
        </section>
        <section className="explorer-panel output-panel" aria-label="Generated shader">
          <div className="panel-heading">
            <span>Shader code</span>
            <div className="target-switch" aria-label="Shader language">
              {(['wgsl', 'glsl'] as const).map((language) => (
                <button
                  key={language}
                  aria-pressed={target === language}
                  onClick={() => setTarget(language)}
                >
                  {language.toUpperCase()}
                </button>
              ))}
              <button
                title="Copy shader code"
                aria-label="Copy shader code"
                disabled={!result?.code}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(result?.code ?? '');
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  } catch {
                    setError('Could not copy. Select the shader text and copy it manually.');
                  }
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          {busy ? (
            <div className="panel-empty" role="status">
              Resolving {target.toUpperCase()}…
            </div>
          ) : error ? (
            <pre className="compile-error" role="alert">
              {error}
            </pre>
          ) : (
            <pre className="shader-output">
              <code>{result?.code || '// No shader declarations were emitted.'}</code>
            </pre>
          )}
          <div className="panel-footnote" role="status">
            {source !== compiledSource && result
              ? 'Source changed · resolve to update'
              : result
                ? `${result.exports.join(', ')} · ${total} generation steps`
                : 'Runs locally in your browser'}
            {target === 'glsl' && ' · GLSL neutral stage'}
          </div>
        </section>
      </div>

      <section className="explorer-panel trace-panel" aria-label="Generation timeline">
        <div className="panel-heading trace-heading">
          <span>Resolution trace</span>
          <span className="muted">
            tinyest <ArrowRight size={13} /> {target.toUpperCase()}
          </span>
        </div>
        <div className="timeline-controls">
          <button aria-label="Reset timeline" disabled={!total} onClick={() => seek(0)}>
            <RotateCcw size={16} />
          </button>
          <button aria-label="Previous step" disabled={step === 0} onClick={() => seek(step - 1)}>
            <ChevronLeft size={18} />
          </button>
          <button
            aria-label={playing ? 'Pause timeline' : 'Play timeline'}
            disabled={!total}
            onClick={() => {
              if (step === total) setStep(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button aria-label="Next step" disabled={step === total} onClick={() => seek(step + 1)}>
            <ChevronRight size={18} />
          </button>
          <input
            type="range"
            aria-label="Generation step"
            min={0}
            max={total}
            value={step}
            disabled={!total}
            onChange={(event) => seek(Number(event.target.value))}
          />
          <span className="step-count">
            {step} / {total}
          </span>
        </div>
        <div className="trace-content">
          <div className="trace-tree">
            {total ? (
              <>
                <div className="trace-caption">
                  {step === total
                    ? 'All nodes resolved'
                    : step === 0
                      ? 'Select a node or step through generation'
                      : `${current?.label} resolved`}
                  <span>Select a node to inspect its result.</span>
                </div>
                <TraceTree
                  nodes={result?.nodes ?? []}
                  step={step}
                  selected={selected?.id}
                  onSelect={(node) => {
                    setPlaying(false);
                    setSelectedId(node.id);
                  }}
                />
              </>
            ) : (
              <div className="panel-empty">
                {busy
                  ? 'Capturing node transformations…'
                  : result
                    ? 'These exports resolve without visiting tinyest nodes. Try exporting a function with a “use gpu” body.'
                    : 'Resolve a snippet to inspect its nodes.'}
              </div>
            )}
          </div>
          <aside className="node-inspector" aria-label="Selected node">
            {selected ? (
              <>
                <div className="inspector-heading">
                  <strong>{selected.label}</strong>
                  <button onClick={() => seek(selected.step)}>
                    Step {selected.step} <ArrowRight size={13} />
                  </button>
                </div>
                <div className="inspector-label">tinyest node</div>
                <pre>{selected.node}</pre>
                <div className="inspector-label">
                  {selected.kind === 'expression' ? 'Snippet value' : 'Generated code'}{' '}
                  <span>{selected.dataType}</span>
                </div>
                <pre className="inspector-result">
                  {selected.output || '(empty — no code emitted)'}
                </pre>
                {selected.origin && (
                  <div className="inspector-label">
                    Origin <span>{selected.origin}</span>
                  </div>
                )}
              </>
            ) : (
              <span className="muted">Node details appear here.</span>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
