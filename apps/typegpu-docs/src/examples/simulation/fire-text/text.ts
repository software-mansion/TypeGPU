import type { TgpuUniform } from 'typegpu';
import { defaults, type SimParams } from './params.ts';

type WritableTexture = { write(data: Uint8Array): void };

const OUTLINE_CHANNEL = 0;
const FILL_CHANNEL = 1;

export interface CreateTextMaskOptions {
  getTextGrid: () => WritableTexture;
  textureSize: number;
  simUniform: TgpuUniform<typeof SimParams>;
}

export function createTextMask(options: CreateTextMaskOptions) {
  const { getTextGrid, simUniform } = options;

  let currentTextureSize = options.textureSize;
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = currentTextureSize;
  maskCanvas.height = currentTextureSize;
  const maybeMaskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
  if (!maybeMaskCtx) {
    throw new Error('Failed to get 2D context');
  }
  const maskCtx = maybeMaskCtx;

  let textData = new Uint8Array(currentTextureSize * currentTextureSize * 2);

  let text = defaults.text;

  function readAlphaInto(channel: 0 | 1) {
    const pixels = maskCtx.getImageData(0, 0, currentTextureSize, currentTextureSize).data;
    const texelCount = currentTextureSize * currentTextureSize;
    for (let i = 0; i < texelCount; i++) {
      textData[i * 2 + channel] = pixels[i * 4 + 3];
    }
  }

  function uploadMask() {
    const BASE_FONT_SIZE = Math.round(currentTextureSize * 0.15);
    const MARGIN = Math.round(currentTextureSize * 0.047);

    maskCtx.clearRect(0, 0, currentTextureSize, currentTextureSize);

    const lines = text.split('\n');

    let fontSize = BASE_FONT_SIZE;
    maskCtx.font = `${fontSize}px sans-serif`;
    const widest = Math.max(1, ...lines.map((l) => maskCtx.measureText(l).width));
    const maxWidth = currentTextureSize - MARGIN * 2;
    if (widest > maxWidth) {
      fontSize = Math.max(14, Math.floor(fontSize * (maxWidth / widest)));
      maskCtx.font = `${fontSize}px sans-serif`;
    }

    const lineHeight = fontSize * 1.3;
    const blockHeight = lines.length * lineHeight;
    const firstBaseline = (currentTextureSize - blockHeight) / 2 + fontSize;

    maskCtx.textBaseline = 'alphabetic';
    maskCtx.lineWidth = defaults.textOutlineWidth;
    maskCtx.lineJoin = 'round';
    maskCtx.lineCap = 'round';
    maskCtx.strokeStyle = 'rgba(255, 255, 255, 1)';

    const layout = lines.map((line, i) => {
      const width = maskCtx.measureText(line).width;
      const x = (currentTextureSize - width) / 2;
      const y = firstBaseline + i * lineHeight;
      return { line, x, y, width };
    });

    const { x, y, width } = layout[layout.length - 1];
    simUniform.patch({
      caretRect: [x + width + 4, y - fontSize * 0.8, x + width + 8, y + fontSize * 0.1],
    });

    maskCtx.globalCompositeOperation = 'source-over';
    for (const { line, x, y } of layout) {
      if (line.length > 0) {
        maskCtx.strokeText(line, x, y);
      }
    }

    maskCtx.globalCompositeOperation = 'destination-out';
    maskCtx.fillStyle = 'rgba(255, 255, 255, 1)';
    for (const { line, x, y } of layout) {
      if (line.length > 0) {
        maskCtx.fillText(line, x, y);
      }
    }

    readAlphaInto(OUTLINE_CHANNEL);

    maskCtx.clearRect(0, 0, currentTextureSize, currentTextureSize);
    maskCtx.globalCompositeOperation = 'source-over';
    maskCtx.fillStyle = 'rgba(255, 255, 255, 1)';
    for (const { line, x, y } of layout) {
      if (line.length > 0) {
        maskCtx.fillText(line, x, y);
      }
    }
    readAlphaInto(FILL_CHANNEL);
    getTextGrid().write(textData);
  }

  function setCursorBlink(enabled: boolean) {
    simUniform.patch({ cursorBlink: enabled ? 1 : 0, caretBlinkStart: performance.now() / 1000 });
  }

  function setText(newText: string) {
    text = newText;
    simUniform.patch({ caretBlinkStart: performance.now() / 1000 });
    uploadMask();
  }

  function setTextureSize(newSize: number) {
    currentTextureSize = newSize;
    maskCanvas.width = newSize;
    maskCanvas.height = newSize;
    textData = new Uint8Array(newSize * newSize * 2);
    uploadMask();
  }

  function onKeyDown(e: KeyboardEvent) {
    const target = e.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLButtonElement
    ) {
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) {
      return;
    }

    if (e.key === 'Backspace') {
      text = text.slice(0, -1);
    } else if (e.key === 'Enter') {
      text += '\n';
    } else if (e.key.length === 1) {
      text += e.key;
    } else {
      return;
    }

    e.preventDefault();
    setText(text);
  }

  function cleanup() {
    window.removeEventListener('keydown', onKeyDown);
  }

  setCursorBlink(defaults.cursorBlink);
  uploadMask();
  window.addEventListener('keydown', onKeyDown);

  return {
    setText,
    setCursorBlink,
    setTextureSize,
    cleanup,
  };
}
