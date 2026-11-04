import { useEffect, useRef } from 'react';

/** Radii of the orbits, relative to the half-width of the hero text */
const ORBITS = [1.25, 1.75, 2.45, 3.4];
/** Viewing the orbit plane at an angle squashes the circles into ellipses */
const SQUASH = 0.34;
/** A slight tilt of the orbit plane, in radians */
const TILT = -0.07;
const SEGMENTS = 180;
const FRONT_ALPHA = 0.26;
const BACK_ALPHA = 0.09;

/**
 * Elliptical orbits around the hero text, gently rippling as if gravity waves were slowly
 * moving through them.
 */
export default function HeroOrbits({ targetSelector }: { targetSelector: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = document.querySelector(targetSelector);

    // Following the text color, so the orbits adapt to light and dark mode
    let color = getComputedStyle(canvas).color;
    const withAlpha = (alpha: number) =>
      `color-mix(in srgb, ${color} ${alpha * 100}%, transparent)`;

    let drawn = false;
    let lastTime = 0;
    const draw = (time: number) => {
      lastTime = time;
      const bounds = canvas.getBoundingClientRect();
      const targetRect = target?.getBoundingClientRect();
      const cx = targetRect
        ? (targetRect.left + targetRect.right) / 2 - bounds.left
        : bounds.width / 2;
      const cy = targetRect
        ? (targetRect.top + targetRect.bottom) / 2 - bounds.top
        : bounds.height / 2;
      const unit = targetRect ? (targetRect.right - targetRect.left) / 2 : bounds.width / 4;

      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.clearRect(0, 0, bounds.width, bounds.height);
      ctx.translate(cx, cy);
      ctx.rotate(TILT);
      ctx.lineWidth = 1.25;
      ctx.lineJoin = 'round';

      const t = time / 1000;
      ORBITS.forEach((orbit, i) => {
        const radius = orbit * unit;
        // Outer orbits are fainter
        const fade = 1 - i * 0.16;

        // Each orbit is a single path, so segments don't overlap and double up their opacity
        ctx.beginPath();
        for (let j = 0; j < SEGMENTS; j++) {
          const angle = (j / SEGMENTS) * Math.PI * 2;
          // Two waves travelling outwards from the center, at different speeds and directions
          const wave =
            Math.sin(radius * 0.012 - t * 0.5 + angle * 2) * 0.6 +
            Math.sin(radius * 0.007 - t * 0.32 - angle * 3 + 1.3) * 0.4;
          const r = radius + wave * (5 + radius * 0.025);
          // And one that lifts the orbit out of its plane
          const lift = Math.sin(radius * 0.01 - t * 0.7 + angle) * (3 + radius * 0.02);

          ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r * SQUASH - lift);
        }
        ctx.closePath();

        // The near side of the orbit (bottom) is more visible than the far side
        const halfHeight = radius * SQUASH;
        const gradient = ctx.createLinearGradient(0, -halfHeight, 0, halfHeight);
        gradient.addColorStop(0, withAlpha(BACK_ALPHA * fade));
        gradient.addColorStop(1, withAlpha(FRONT_ALPHA * fade));
        ctx.strokeStyle = gradient;
        ctx.stroke();
      });

      if (!drawn) {
        drawn = true;
        // Fading in once there's something drawn
        canvas.dataset.active = 'true';
      }
    };

    // Animating every frame while visible, unless motion is reduced, then only drawing when
    // something changes
    let visible = false;
    let frameId = 0;
    const frame = (time: number) => {
      frameId = 0;
      draw(reducedMotion ? 0 : time);
      if (visible && !reducedMotion) {
        frameId = requestAnimationFrame(frame);
      }
    };
    const requestDraw = () => {
      if (!frameId) frameId = requestAnimationFrame(frame);
    };

    const resizeObserver = new ResizeObserver(() => {
      canvas.width = Math.round(canvas.clientWidth * devicePixelRatio);
      canvas.height = Math.round(canvas.clientHeight * devicePixelRatio);
      // Resizing clears the canvas, drawing right away so it doesn't flash empty
      draw(lastTime);
    });
    resizeObserver.observe(canvas);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) requestDraw();
    });
    intersectionObserver.observe(canvas);

    const themeObserver = new MutationObserver(() => {
      color = getComputedStyle(canvas).color;
      requestDraw();
    });
    themeObserver.observe(document.documentElement, { attributeFilter: ['data-theme'] });

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [targetSelector]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="text-navy-100 dark:text-almost-white pointer-events-none absolute inset-0 -z-10 size-full opacity-0 transition-opacity duration-[1.5s] ease-out [mask-image:radial-gradient(closest-side,#000_55%,transparent)] data-[active=true]:opacity-100"
    />
  );
}
