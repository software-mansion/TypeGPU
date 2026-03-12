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
  const toPixel = (x: number, y: number): [number, number] => [
    ((x / aspect() + 1) / 2) * el.width,
    ((1 - y) / 2) * el.height,
  ];

  return {
    show() {
      el.style.display = '';
    },
    hide() {
      el.style.display = 'none';
    },

    destroy() {
      el.remove();
    },

    clientToTrack(clientX: number, clientY: number): [number, number] {
      const rect = canvas.getBoundingClientRect();
      return [
        (((clientX - rect.left) / rect.width) * 2 - 1) * aspect(),
        1 - ((clientY - rect.top) / rect.height) * 2,
      ];
    },

    findNearest(pts: Float32Array, n: number, x: number, y: number, hitPx = 15): number | null {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width || canvas.width,
        h = rect.height || canvas.height;
      const a = aspect();
      const px = ((x / a + 1) / 2) * w,
        py = ((1 - y) / 2) * h;
      let best: number | null = null,
        bestD = hitPx * hitPx;
      for (let i = 0; i < n; i++) {
        const d2 =
          (((pts[i * 2] / a + 1) / 2) * w - px) ** 2 + (((1 - pts[i * 2 + 1]) / 2) * h - py) ** 2;
        if (d2 < bestD) {
          bestD = d2;
          best = i;
        }
      }
      return best;
    },

    render(pts: Float32Array, n: number, dragIdx: number | null) {
      el.width = canvas.width;
      el.height = canvas.height;
      ctx.clearRect(0, 0, el.width, el.height);
      if (n === 0) return;

      if (n >= 2) {
        ctx.strokeStyle = 'rgba(255, 210, 60, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const [x, y] = toPixel(pts[i * 2], pts[i * 2 + 1]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        const [lx, ly] = toPixel(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
        const [fx, fy] = toPixel(pts[0], pts[1]);
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = 'rgba(255, 210, 60, 0.35)';
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(fx, fy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      for (let i = 0; i < n; i++) {
        const [x, y] = toPixel(pts[i * 2], pts[i * 2 + 1]);
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
      }
    },
  };
}
