import { useEffect, useRef } from 'react';
import { PLUM_PALETTES, type PlumPalette, toCssHex } from '../plums/palette.ts';

const HOLD_MS = 1690;
const WINDUP_MS = 280;
const SWEEP_MS = 650;
/** Where the text pulls back to before springing, in em (x right, y down) */
const WINDUP_OFFSET = { x: -0.05, y: 0.05 };
/** The kick towards the top right when the text is let go, in em per second */
const RELEASE_VELOCITY = { x: 1.8, y: -1.8 };
// Underdamped, so the text wobbles past its rest position a couple of times before settling
const STIFFNESS = 100;
const DAMPING = 7;
/**
 * How far the text tilts when pulled back, bringing its bottom left towards the screen and
 * pushing its top right away. A negative X rotation brings the bottom forward, a positive Y
 * rotation brings the left forward.
 */
const TILT_X_DEG = -6.6;
const TILT_Y_DEG = 9;
/** Perspective distance, in em. The foreshortening is inversely proportional to it */
const PERSPECTIVE = 8.75;
// Stiffer than the position spring, so the tilt wobbles a little while the text settles
const TILT_STIFFNESS = 160;
const TILT_DAMPING = 9;
/** Width of the soft edge between the old and the new colors, in % of the sweep */
const SWEEP_EDGE = 25;

const gradientOf = (palette: PlumPalette) =>
  `linear-gradient(to bottom, ${toCssHex(palette.bodyTop)}, ${toCssHex(palette.bodyBottom)})`;

const sweepMask = (progress: number) => {
  // Sweeping from the bottom left to the top right, edge included
  const p = progress * (100 + SWEEP_EDGE);
  return `linear-gradient(to top right, #000 ${p - SWEEP_EDGE}%, transparent ${p}%)`;
};

const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

const layerClass = 'inline-block bg-clip-text text-transparent';
/** Below this, the springs count as settled */
const REST_EPSILON = 1e-4;

/** A title that cycles between the colors of the plums, springing into each one */
export default function PlumTitle({ title }: { title: string }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const baseRef = useRef<HTMLSpanElement>(null);
  const overlayRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const base = baseRef.current;
    const overlay = overlayRef.current;
    if (!root || !base || !overlay) return;

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const setMask = (mask: string) => {
      overlay.style.maskImage = mask;
      overlay.style.webkitMaskImage = mask;
    };

    let index = 0;
    let phase: 'hold' | 'windup' | 'release' = 'hold';
    let phaseTime = 0;
    const pos = { x: 0, y: 0 };
    const vel = { x: 0, y: 0 };
    // 1 is fully tilted, 0 is flat
    let tilt = 0;
    let tiltVel = 0;

    let transform = '';
    let frameId = 0;
    let lastTime: number | undefined;
    const frame = (timestamp: number) => {
      frameId = requestAnimationFrame(frame);
      // Clamped, so coming back to a hidden tab doesn't fling the text away
      const dtMs = lastTime === undefined ? 0 : Math.min(timestamp - lastTime, 1000 / 30);
      lastTime = timestamp;
      phaseTime += dtMs;

      if (phase === 'hold' && phaseTime >= HOLD_MS) {
        overlay.style.backgroundImage = gradientOf(
          PLUM_PALETTES[(index + 1) % PLUM_PALETTES.length],
        );
        phase = 'windup';
        phaseTime = 0;
      }

      if (phase === 'windup') {
        const t = easeInOutSine(Math.min(phaseTime / WINDUP_MS, 1));
        pos.x = WINDUP_OFFSET.x * t;
        pos.y = WINDUP_OFFSET.y * t;
        tilt = t;
        if (phaseTime >= WINDUP_MS) {
          vel.x = RELEASE_VELOCITY.x;
          vel.y = RELEASE_VELOCITY.y;
          phase = 'release';
          phaseTime = 0;
        }
      } else {
        const dt = dtMs / 1000;
        vel.x += (-STIFFNESS * pos.x - DAMPING * vel.x) * dt;
        vel.y += (-STIFFNESS * pos.y - DAMPING * vel.y) * dt;
        pos.x += vel.x * dt;
        pos.y += vel.y * dt;
        tiltVel += (-TILT_STIFFNESS * tilt - TILT_DAMPING * tiltVel) * dt;
        tilt += tiltVel * dt;
        // Snapping to rest, so the transform stops changing while the colors hold
        if ([pos.x, pos.y, vel.x, vel.y, tilt, tiltVel].every((v) => Math.abs(v) < REST_EPSILON)) {
          pos.x = pos.y = vel.x = vel.y = tilt = tiltVel = 0;
        }
      }

      if (phase === 'release') {
        const t = Math.min(phaseTime / SWEEP_MS, 1);
        setMask(sweepMask(easeOutCubic(t)));
        if (t === 1) {
          // The new colors become the base, ready for the next sweep
          index = (index + 1) % PLUM_PALETTES.length;
          base.style.backgroundImage = gradientOf(PLUM_PALETTES[index]);
          setMask(sweepMask(0));
          phase = 'hold';
          phaseTime = 0;
        }
      }

      const nextTransform = reducedMotion
        ? ''
        : `perspective(${PERSPECTIVE}em) translate(${pos.x}em, ${pos.y}em) ` +
          `rotateX(${tilt * TILT_X_DEG}deg) rotateY(${tilt * TILT_Y_DEG}deg)`;
      if (nextTransform !== transform) {
        transform = nextTransform;
        root.style.transform = transform;
      }
    };

    // Only animating while the title is on screen
    const observer = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frameId);
      if (entry?.isIntersecting) {
        lastTime = undefined;
        frameId = requestAnimationFrame(frame);
      }
    });
    observer.observe(root);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, []);

  return (
    <span ref={rootRef} className="relative inline-block font-bold will-change-transform">
      <span
        ref={baseRef}
        className={layerClass}
        style={{ backgroundImage: gradientOf(PLUM_PALETTES[0]) }}
      >
        {title}
      </span>
      <span
        ref={overlayRef}
        aria-hidden="true"
        className={`absolute inset-0 ${layerClass}`}
        style={{ maskImage: sweepMask(0), WebkitMaskImage: sweepMask(0) }}
      >
        {title}
      </span>
    </span>
  );
}
