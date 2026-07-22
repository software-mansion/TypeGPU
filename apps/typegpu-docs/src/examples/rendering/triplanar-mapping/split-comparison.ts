type SplitComparisonOptions = {
  leftLabel: string;
  rightLabel: string;
  initialRatio?: number;
  onChange: (ratio: number) => void;
};

export type SplitComparison = {
  readonly ratio: number;
  sync(): void;
  destroy(): void;
};

const MIN_RATIO = 0.02;
const MAX_RATIO = 0.98;
const LABEL_MARGIN = 28;

const clampRatio = (ratio: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));

function withStyle<T extends HTMLElement>(element: T, cssText: string) {
  element.style.cssText = cssText;
  return element;
}

function makePill(text: string, side: 'left' | 'right') {
  const pill = withStyle(
    document.createElement('span'),
    `
      position: absolute;
      top: 12px;
      box-sizing: border-box;
      max-width: 0;
      overflow: hidden;
      padding: 6px 12px;
      border: 2px solid rgba(225, 220, 244, 0.92);
      border-radius: 100px;
      background: rgba(255, 255, 255, 0.88);
      color: rgb(30, 27, 42);
      box-shadow: 0 4px 14px rgba(30, 27, 42, 0.08);
      backdrop-filter: blur(10px);
      font: 500 13px/1.2 ui-sans-serif, system-ui, sans-serif;
      letter-spacing: 0;
      text-overflow: ellipsis;
      white-space: nowrap;
      transform: translateX(${side === 'left' ? 'calc(-100% - 10px)' : '10px'});
    `,
  );
  pill.textContent = text;
  return pill;
}

export function createSplitComparison(
  canvas: HTMLCanvasElement,
  { leftLabel, rightLabel, initialRatio = 0.5, onChange }: SplitComparisonOptions,
): SplitComparison {
  const host = canvas.parentElement;
  if (!host) {
    throw new Error('Split comparison requires the canvas to have a parent element.');
  }

  let ratio = clampRatio(initialRatio);
  let pointerId: number | undefined;

  const handle = withStyle(
    document.createElement('div'),
    `
      position: absolute;
      inset: 0 auto 0 50%;
      z-index: 4;
      display: flex;
      width: 16px;
      cursor: ew-resize;
      justify-content: center;
      opacity: 0.68;
      outline: none;
      touch-action: none;
      transform: translateX(-50%);
    `,
  );
  const labels = withStyle(
    document.createElement('div'),
    'position:absolute;inset:0;z-index:5;pointer-events:none;',
  );
  const line = withStyle(
    document.createElement('div'),
    `
      width: 1px;
      background: rgba(30, 27, 42, 0.22);
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5);
      pointer-events: none;
    `,
  );
  const grip = withStyle(
    document.createElement('div'),
    `
      position: absolute;
      top: 48px;
      width: 6px;
      height: 28px;
      border: 1px solid rgba(126, 115, 169, 0.46);
      border-radius: 100px;
      background: rgba(255, 255, 255, 0.9);
      box-shadow: 0 4px 12px rgba(30, 27, 42, 0.14);
      pointer-events: none;
    `,
  );
  const leftPill = makePill(leftLabel, 'left');
  const rightPill = makePill(rightLabel, 'right');

  handle.dataset.triplanarSplitHandle = 'true';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'slider');
  handle.setAttribute('aria-label', 'Compare triplanar mapping and mesh UVs');
  handle.setAttribute('aria-valuemin', `${MIN_RATIO * 100}`);
  handle.setAttribute('aria-valuemax', `${MAX_RATIO * 100}`);

  function sync() {
    const splitPercent = `${ratio * 100}%`;
    const splitX = canvas.clientWidth * ratio;

    handle.style.left = splitPercent;
    handle.setAttribute('aria-valuenow', `${Math.round(ratio * 100)}`);
    leftPill.style.left = splitPercent;
    leftPill.style.maxWidth = `${Math.max(0, splitX - LABEL_MARGIN)}px`;
    rightPill.style.left = splitPercent;
    rightPill.style.maxWidth = `${Math.max(0, canvas.clientWidth - splitX - LABEL_MARGIN)}px`;
    onChange(ratio);
  }

  function setRatio(nextRatio: number) {
    ratio = clampRatio(nextRatio);
    sync();
  }

  function setRatioFromClientX(clientX: number) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0) {
      setRatio((clientX - rect.left) / rect.width);
    }
  }

  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    pointerId = event.pointerId;
    handle.style.opacity = '1';
    handle.setPointerCapture(pointerId);
    setRatioFromClientX(event.clientX);
  });
  handle.addEventListener('pointermove', (event) => {
    if (event.pointerId === pointerId) {
      setRatioFromClientX(event.clientX);
    }
  });

  const stopDrag = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) {
      return;
    }

    if (handle.hasPointerCapture(pointerId)) {
      handle.releasePointerCapture(pointerId);
    }
    handle.style.opacity = '0.68';
    pointerId = undefined;
  };
  handle.addEventListener('pointerup', stopDrag);
  handle.addEventListener('pointercancel', stopDrag);
  handle.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setRatio(ratio + step * (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });

  handle.append(line, grip);
  labels.append(leftPill, rightPill);
  host.append(handle, labels);
  sync();

  return {
    get ratio() {
      return ratio;
    },
    sync,
    destroy() {
      handle.remove();
      labels.remove();
    },
  };
}
