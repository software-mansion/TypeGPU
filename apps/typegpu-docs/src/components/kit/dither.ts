// TypeGPU Kit's dithered look for the promo surfaces that link to it. Ported from the Kit docs
// site's painter (software-mansion/typegpu-kit, apps/typegpu-kit-docs/src/components/site/dither.ts):
// a field from 0 to 1 is printed through Kit's colour ramp in 8×8 Bayer cells on a 2D canvas, so it
// needs no GPU and redraws only when the field changes.

type Rgb = readonly [number, number, number];

const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28,
  52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7,
  39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

/** The 8×8 ordered threshold of the cell at column `i` and row `j`, in (0, 1). */
const bayer = (i: number, j: number) => ((BAYER[(j % 8) * 8 + (i % 8)] ?? 0) + 0.5) / 64;

const rgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/**
 * Kit's ramp from its raised grounds through the rules to the accent at its brightest, with a clear
 * step below them. The hex values are Kit's design tokens (`--ground-2` … `--accent-high`).
 */
const RAMP: readonly (Rgb | null)[] = [
  null,
  rgb('#0e1118'),
  rgb('#14181f'),
  rgb('#1b1f28'),
  rgb('#313844'),
  rgb('#3c528f'),
  rgb('#4d79ff'),
  rgb('#dbf0ff'),
];

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Fills `canvas` at its layout size with `cell`-wide CSS-pixel cells, `field` giving each cell's ramp position. */
function paint(canvas: HTMLCanvasElement, field: (x: number, y: number) => number, cell = 2) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const ratio = Math.max(1, Math.round(devicePixelRatio));
  const size = Math.max(1, Math.round(cell * ratio));
  const columns = Math.max(1, Math.ceil((width * ratio) / size));
  const rows = Math.max(1, Math.ceil((height * ratio) / size));

  const cells = new ImageData(columns, rows);
  const steps = RAMP.length - 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const at = clamp(field((i + 0.5) / columns, (j + 0.5) / rows)) * steps;
      const low = Math.min(Math.floor(at), steps - 1);
      const color = RAMP[at - low > bayer(i, j) ? low + 1 : low];
      if (!color) continue;
      const k = (j * columns + i) * 4;
      cells.data.set(color, k);
      cells.data[k + 3] = 255;
    }
  }

  const small = document.createElement('canvas');
  small.width = columns;
  small.height = rows;
  small.getContext('2d')?.putImageData(cells, 0, 0);
  if (canvas.width !== columns * size) canvas.width = columns * size;
  if (canvas.height !== rows * size) canvas.height = rows * size;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(small, 0, 0, canvas.width, canvas.height);
}

/**
 * The shapes of light the promos print, each from the pointer's lean: where across the canvas the
 * light sits, from 0 to 1.
 */
const FIELDS = {
  /** A pool of light rising from the foot, as under Kit's footer. */
  horizon: (lean: number) => (x: number, y: number) => {
    const across = (x - lean) / 0.36;
    return 0.86 * Math.exp(-across * across) * (1 - (2 * x - 1) ** 8) * y ** 1.8;
  },
  /** A band of light that leaves the left side dark for the text over it. */
  band: (lean: number) => (x: number, y: number) => {
    const across = (x - lean) / 0.32;
    const middle = 2 * y - 1;
    return 0.9 * Math.exp(-across * across) * (1 - middle ** 4) * clamp(x * 1.6 - 0.2);
  },
  /** A rule of light under a link, as under the current section of Kit's header. */
  rail: (lean: number) => (x: number, y: number) => {
    const across = (x - lean) / 0.55;
    return 0.95 * Math.exp(-(across ** 4)) * (1 - y) ** 1.6;
  },
} as const;

export type DitherKind = keyof typeof FIELDS;

/** Where each kind's light rests, and how far toward the pointer it leans. */
const REST: Record<DitherKind, { middle: number; reach: number }> = {
  horizon: { middle: 0.5, reach: 0.6 },
  band: { middle: 0.78, reach: 0.4 },
  rail: { middle: 0.5, reach: 0.5 },
};

interface Mounted {
  canvas: HTMLCanvasElement;
  kind: DitherKind;
  middle: number;
  target: number;
  frame: number;
  draw(): void;
}

const mounted = new Set<Mounted>();
const still = matchMedia('(prefers-reduced-motion: reduce)');

function step(entry: Mounted) {
  entry.frame = 0;
  entry.middle += (entry.target - entry.middle) * (still.matches ? 1 : 0.08);
  entry.draw();
  if (Math.abs(entry.target - entry.middle) > 0.002) {
    entry.frame = requestAnimationFrame(() => step(entry));
  }
}

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('pointermove', (event) => {
    for (const entry of mounted) {
      if (!entry.canvas.isConnected) {
        mounted.delete(entry);
        continue;
      }
      const box = entry.canvas.getBoundingClientRect();
      const near = event.clientY > box.top - 160 && event.clientY < box.bottom + 160;
      const { middle, reach } = REST[entry.kind];
      const x = clamp((event.clientX - box.left) / box.width);
      entry.target = near ? middle + (x - middle) * reach : middle;
      if (!entry.frame && Math.abs(entry.target - entry.middle) > 0.002) {
        entry.frame = requestAnimationFrame(() => step(entry));
      }
    }
  });
}

/** Paints every `canvas[data-kit-dither]` not yet painted, and keeps it painted as it resizes. */
export function mountDithers(scope: ParentNode = document) {
  for (const canvas of scope.querySelectorAll<HTMLCanvasElement>('canvas[data-kit-dither]')) {
    if (canvas.dataset.kitDitherMounted) continue;
    canvas.dataset.kitDitherMounted = '';
    const kind =
      (canvas.dataset.kitDither as DitherKind) in FIELDS
        ? (canvas.dataset.kitDither as DitherKind)
        : 'horizon';
    const cell = Number(canvas.dataset.kitDitherCell) || 2;
    const entry: Mounted = {
      canvas,
      kind,
      middle: REST[kind].middle,
      target: REST[kind].middle,
      frame: 0,
      draw: () => paint(canvas, FIELDS[kind](entry.middle), cell),
    };
    mounted.add(entry);
    new ResizeObserver(() => entry.draw()).observe(canvas);
  }
  listen();
}
