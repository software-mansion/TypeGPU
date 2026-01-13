// Generate by AI
export function createBezier(params: number[]) {
  const [x1, y1, x2, y2] = params;
  // Pre-calculate polynomial coefficients
  // 3*x1, 3*(x2-x1)-cx, 1-cx-bx, etc.
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  // Calculate x at time t
  function sampleCurveX(t: number) {
    return ((ax * t + bx) * t + cx) * t;
  }

  // Calculate y at time t
  function sampleCurveY(t: number) {
    return ((ay * t + by) * t + cy) * t;
  }

  // Calculate slope (derivative) of x at time t
  function sampleCurveDerivativeX(t: number) {
    return (3 * ax * t + 2 * bx) * t + cx;
  }

  // Solve for t given x (using Newton-Raphson)
  function solveCurveX(x: number) {
    let t2 = x;
    // Iteratively approximate t
    for (let i = 0; i < 8; i++) {
      const x2 = sampleCurveX(t2) - x;
      if (Math.abs(x2) < 1e-6) return t2;
      const d2 = sampleCurveDerivativeX(t2);
      if (Math.abs(d2) < 1e-6) break;
      t2 = t2 - x2 / d2;
    }
    return t2;
  }

  return (x: number) => {
    if (x <= 0) return 0; // Clamp start
    if (x >= 1) return 1; // Clamp end
    const t = solveCurveX(x);
    return sampleCurveY(t);
  };
}
