import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { TraceNode } from './trace.ts';
import { layoutTree, NODE_HEIGHT, NODE_WIDTH } from './treeLayout.ts';

type Camera = { x: number; y: number; scale: number };
const clampZoom = (scale: number) => Math.max(0.05, Math.min(2.5, scale));

export default function TraceTree({
  nodes,
  step,
  selected,
  onSelect,
}: {
  nodes: TraceNode[];
  step: number;
  selected: number | undefined;
  onSelect: (node: TraceNode) => void;
}) {
  const layout = useMemo(() => layoutTree(nodes), [nodes]);
  const positions = useMemo(
    () => new Map(layout.nodes.map((item) => [item.node.id, item])),
    [layout],
  );
  const visibleNodes = useMemo(() => {
    const hidden = new Set<number>();
    // Keep the original positions, but hide every descendant of a resolved node.
    return layout.nodes.filter(({ node }) => {
      if (node.parent === null) return true;
      const parent = positions.get(node.parent);
      if (hidden.has(node.parent) || (parent && parent.node.step <= step)) {
        hidden.add(node.id);
        return false;
      }
      return true;
    });
  }, [layout, positions, step]);
  const viewport = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const zoom = (factor: number, point?: { x: number; y: number }) => {
    const element = viewport.current;
    if (!element) return;
    const anchor = point ?? { x: element.clientWidth / 2, y: element.clientHeight / 2 };
    setCamera((previous) => {
      const scale = clampZoom(previous.scale * factor);
      const ratio = scale / previous.scale;
      return {
        x: anchor.x - (anchor.x - previous.x) * ratio,
        y: anchor.y - (anchor.y - previous.y) * ratio,
        scale,
      };
    });
  };
  const fit = () => {
    const element = viewport.current;
    if (!element) return;
    const scale = clampZoom(
      Math.min(
        1,
        (element.clientWidth - 64) / layout.width,
        (element.clientHeight - 64) / layout.height,
      ),
    );
    setCamera({
      x: (element.clientWidth - layout.width * scale) / 2,
      y: (element.clientHeight - layout.height * scale) / 2,
      scale,
    });
  };

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    // Start at a readable scale with the root centered. Fit is available for a full overview.
    const scale = Math.max(0.55, Math.min(1, (element.clientWidth - 64) / layout.width));
    setCamera({ x: element.clientWidth / 2 - (layout.width * scale) / 2, y: 40, scale });
  }, [layout]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey || (!event.deltaX && event.deltaMode !== 0)) {
        const rect = element.getBoundingClientRect();
        zoom(Math.exp(-event.deltaY * 0.01), {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      } else {
        setCamera((previous) => ({
          ...previous,
          x: previous.x - event.deltaX,
          y: previous.y - event.deltaY,
        }));
      }
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  return (
    <div className="tree-shell">
      <div className="tree-toolbar">
        <span>Drag to pan · pinch or Ctrl + scroll to zoom</span>
        <div>
          <button
            aria-label="Zoom out"
            disabled={camera.scale <= 0.05}
            onClick={() => zoom(1 / 1.2)}
          >
            <Minus size={15} />
          </button>
          <output aria-label="Tree zoom">{Math.round(camera.scale * 100)}%</output>
          <button aria-label="Zoom in" disabled={camera.scale >= 2.5} onClick={() => zoom(1.2)}>
            <Plus size={15} />
          </button>
          <button aria-label="Fit tree" onClick={fit}>
            <Maximize size={15} />
            <span>Fit</span>
          </button>
        </div>
      </div>
      <div
        ref={viewport}
        className={`tree-viewport ${dragging ? 'is-dragging' : ''}`}
        tabIndex={0}
        role="region"
        aria-label="Shader tree canvas. Arrow keys pan, plus and minus zoom, zero fits the tree."
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [60, 0],
            ArrowRight: [-60, 0],
            ArrowUp: [0, 60],
            ArrowDown: [0, -60],
          };
          const delta = directions[event.key];
          if (delta) {
            event.preventDefault();
            setCamera((previous) => ({
              ...previous,
              x: previous.x + delta[0],
              y: previous.y + delta[1],
            }));
          } else if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            zoom(1.2);
          } else if (event.key === '-') {
            event.preventDefault();
            zoom(1 / 1.2);
          } else if (event.key === '0') {
            event.preventDefault();
            fit();
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          if (!pointers.current.size) {
            moved.current = false;
            dragStart.current = { x: event.clientX, y: event.clientY };
          }
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          // Capture on the original target so a stationary node click still selects it.
          (event.target as Element).setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const previous = pointers.current.get(event.pointerId);
          if (!previous) return;
          const next = { x: event.clientX, y: event.clientY };
          const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
          if (other) {
            const rect = event.currentTarget.getBoundingClientRect();
            const oldCenter = {
              x: (previous.x + other.x) / 2 - rect.left,
              y: (previous.y + other.y) / 2 - rect.top,
            };
            const newCenter = {
              x: (next.x + other.x) / 2 - rect.left,
              y: (next.y + other.y) / 2 - rect.top,
            };
            const oldDistance = Math.hypot(previous.x - other.x, previous.y - other.y);
            const newDistance = Math.hypot(next.x - other.x, next.y - other.y);
            setCamera((camera) => {
              const scale = clampZoom((camera.scale * newDistance) / Math.max(1, oldDistance));
              return {
                x: newCenter.x - ((oldCenter.x - camera.x) * scale) / camera.scale,
                y: newCenter.y - ((oldCenter.y - camera.y) * scale) / camera.scale,
                scale,
              };
            });
            moved.current = true;
          } else {
            if (Math.hypot(next.x - dragStart.current.x, next.y - dragStart.current.y) > 4)
              moved.current = true;
            if (moved.current)
              setCamera((camera) => ({
                ...camera,
                x: camera.x + next.x - previous.x,
                y: camera.y + next.y - previous.y,
              }));
          }
          pointers.current.set(event.pointerId, next);
        }}
        onLostPointerCapture={(event) => {
          pointers.current.delete(event.pointerId);
          if (!pointers.current.size) setDragging(false);
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId);
          if (!pointers.current.size) setDragging(false);
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          moved.current = true;
          if (!pointers.current.size) setDragging(false);
        }}
        onClickCapture={(event) => {
          if (moved.current) {
            event.stopPropagation();
            event.preventDefault();
            moved.current = false;
          }
        }}
      >
        <div
          className="tree-world"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
          }}
        >
          <svg
            className="tree-edges"
            width={layout.width}
            height={layout.height}
            aria-hidden="true"
          >
            {visibleNodes.map(({ node, x, y }) => {
              const parent = positions.get(node.parent ?? -1);
              if (!parent) return null;
              const startX = parent.x + NODE_WIDTH / 2;
              const startY = parent.y + NODE_HEIGHT;
              const endX = x + NODE_WIDTH / 2;
              const middleY = (startY + y) / 2;
              return (
                <path
                  key={node.id}
                  d={`M ${startX} ${startY} V ${middleY} H ${endX} V ${y}`}
                  className={node.step <= step ? 'resolved' : ''}
                />
              );
            })}
          </svg>
          {visibleNodes.map(({ node, x, y }) => (
            <button
              key={node.id}
              className={`trace-node ${node.step <= step ? 'resolved' : ''} ${selected === node.id ? 'selected' : ''}`}
              style={{ left: x, top: y, width: NODE_WIDTH, height: NODE_HEIGHT }}
              onClick={() => onSelect(node)}
              aria-pressed={selected === node.id}
              aria-label={`${node.kind}: ${node.label}, step ${node.step}`}
              title={node.step <= step ? node.output : node.label}
            >
              <span className="node-kind">
                {node.kind}
                <span>{node.step <= step ? (node.dataType ?? 'code') : `#${node.step}`}</span>
              </span>
              <code>{node.step <= step ? node.output || '∅' : node.label}</code>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
