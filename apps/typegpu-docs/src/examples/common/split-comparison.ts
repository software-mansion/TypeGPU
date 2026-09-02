const pillStyle = `
  position: absolute;
  top: 12px;
  padding: 6px 12px;
  border: 2px solid rgba(225, 220, 244, 0.92);
  border-radius: 100px;
  background: rgba(255, 255, 255, 0.88);
  color: rgb(30, 27, 42);
  font: 500 13px/1.2 ui-sans-serif, system-ui, sans-serif;
  white-space: nowrap;
  pointer-events: none;
  transition: opacity 0.15s;
`;

function createPill(text: string, side: 'left' | 'right') {
  const pill = document.createElement('span');
  pill.style.cssText = `${pillStyle} ${side}: calc(100% + 8px);`;
  pill.textContent = text;
  return pill;
}

export function createSplitComparison(
  canvas: HTMLCanvasElement,
  leftLabel: string,
  rightLabel: string,
  onChange: (ratio: number) => void,
) {
  let ratio = 0.5;

  const handle = document.createElement('div');
  handle.style.cssText = `
    position: absolute;
    inset: 0 auto 0 50%;
    width: 16px;
    transform: translateX(-50%);
    cursor: ew-resize;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    background: linear-gradient(90deg, transparent 7px, rgba(30, 27, 42, 0.3) 7px 9px, transparent 9px);
  `;
  const leftPill = createPill(leftLabel, 'right');
  const rightPill = createPill(rightLabel, 'left');
  handle.append(leftPill, rightPill);

  function sync() {
    const splitX = canvas.clientWidth * ratio;
    handle.style.left = `${ratio * 100}%`;
    leftPill.style.opacity = splitX > leftPill.offsetWidth + 16 ? '1' : '0';
    rightPill.style.opacity = canvas.clientWidth - splitX > rightPill.offsetWidth + 16 ? '1' : '0';
    onChange(ratio);
  }

  function drag(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    ratio = Math.min(0.98, Math.max(0.02, (event.clientX - rect.left) / rect.width));
    sync();
  }

  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    drag(event);
  });
  handle.addEventListener('pointermove', (event) => {
    if (handle.hasPointerCapture(event.pointerId)) {
      drag(event);
    }
  });

  canvas.parentElement?.append(handle);
  sync();

  return { sync, destroy: () => handle.remove() };
}
