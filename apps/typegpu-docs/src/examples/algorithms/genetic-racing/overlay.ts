import type { Pt } from './track.ts';

export function createTrackOverlay(canvas: HTMLCanvasElement) {
  const el = document.createElement('canvas');
  el.style.cssText =
    'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;display:none';
  canvas.insertAdjacentElement('afterend', el);
  if (canvas.parentElement) canvas.parentElement.style.position = 'relative';
  const ctx = el.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context for track overlay');
  }

  const aspect = () => (canvas.width && canvas.height ? canvas.width / canvas.height : 1);
  const toPixel = (p: Pt): [number, number] => [
    ((p.x / aspect() + 1) / 2) * el.width,
    ((1 - p.y) / 2) * el.height,
  ];

  return {
    show() {
      el.style.display = '';
    },
    hide() {
      el.style.display = 'none';
    },

    clientToTrack(clientX: number, clientY: number): Pt {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (((clientX - rect.left) / rect.width) * 2 - 1) * aspect(),
        y: 1 - ((clientY - rect.top) / rect.height) * 2,
      };
    },

    findNearest(pts: Pt[], pt: Pt, hitPx = 15): number | null {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width || canvas.width,
        h = rect.height || canvas.height;
      const a = aspect();
      const px = ((pt.x / a + 1) / 2) * w,
        py = ((1 - pt.y) / 2) * h;
      let best: number | null = null,
        bestD = hitPx * hitPx;
      pts.forEach((cp, i) => {
        const d2 = (((cp.x / a + 1) / 2) * w - px) ** 2 + (((1 - cp.y) / 2) * h - py) ** 2;
        if (d2 < bestD) {
          bestD = d2;
          best = i;
        }
      });
      return best;
    },

    render(pts: Pt[], dragIdx: number | null) {
      el.width = canvas.width;
      el.height = canvas.height;
      ctx.clearRect(0, 0, el.width, el.height);
      const n = pts.length;
      if (n === 0) return;

      if (n >= 2) {
        ctx.strokeStyle = 'rgba(255, 210, 60, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);
        ctx.beginPath();
        pts.forEach((p, i) => {
          const [x, y] = toPixel(p);
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();

        const [lx, ly] = toPixel(pts[n - 1]),
          [fx, fy] = toPixel(pts[0]);
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = 'rgba(255, 210, 60, 0.35)';
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(fx, fy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      pts.forEach((p, i) => {
        const [x, y] = toPixel(p);
        ctx.beginPath();
        ctx.arc(x, y, i === 0 ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle =
          i === dragIdx
            ? 'rgba(100,180,255,1)'
            : i === 0
              ? 'rgba(60,255,120,1)'
              : 'rgba(255,255,255,0.9)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    },
  };
}
