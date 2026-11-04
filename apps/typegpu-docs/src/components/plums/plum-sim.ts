import { d } from 'typegpu';
import { PLUM_PALETTES } from './palette.ts';
import type { PlumInstance } from './plum-renderer.ts';

type Vec2 = { x: number; y: number };
type Vec3 = [number, number, number];
type Mat3Rows = [number, number, number, number, number, number, number, number, number];
export type Rect = { left: number; top: number; right: number; bottom: number };

interface PlumLook {
  bodyTop: d.v3f;
  bodyBottom: d.v3f;
  ringTop: d.v3f;
  ringBottom: d.v3f;
  tailTop: d.v3f;
  tailBottom: d.v3f;
  /** Resting eyelids: upper left, upper right, lower left, lower right */
  lids: [number, number, number, number];
}

const hex = (value: number) =>
  d.vec3f(((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255);

/** The three plums from the mascot drawings */
const LIDS: PlumLook['lids'][] = [
  // Green, with a smug squint
  [0, 0, 0.42, 0.42],
  // Red, a little skeptical
  [0, 0, 0.36, 0],
  // Blue, wide-eyed
  [0, 0, 0, 0],
];

const LOOKS: PlumLook[] = PLUM_PALETTES.map((palette, i) => ({
  bodyTop: hex(palette.bodyTop),
  bodyBottom: hex(palette.bodyBottom),
  ringTop: hex(palette.ringTop),
  ringBottom: hex(palette.ringBottom),
  tailTop: hex(palette.tailTop),
  tailBottom: hex(palette.tailBottom),
  lids: LIDS[i] ?? [0, 0, 0, 0],
}));

/**
 * Where the tail hangs relative to the body, in plum units (y up). Like the stalk in the
 * TypeGPU logo, it rises from the top-left of the head.
 */
const TAIL_ANCHOR: [number, number] = [-0.5, 2.05];
/** Resting tilt of the tail, leaning slightly to the left */
const TAIL_ROLL = 0.12;
// Tail flicks, like a dog twitching its ear. A stiff, bouncy spring kicked by a quick impulse.
const FLICK_STIFFNESS = 500;
const FLICK_DAMPING = 14;
/** Angular speed of the kick, in radians per second. Peaks at roughly 30 degrees. */
const FLICK_IMPULSE = 12;
/** How much the tail twists around its own axis while flicking, relative to the swing */
const FLICK_TWIST = 0.6;

const BASE_YAW = -Math.PI / 4;
const BASE_PITCH = 0.5;
/**
 * How far in front of the plums (in CSS pixels) the screen is. The gaze is the ray from the
 * middle of the head to the point being looked at on the screen.
 */
const GAZE_DEPTH = 300;
/** How far the irises can move from the middle of the eyes (1 would be the eyeball's radius) */
const MAX_IRIS_OFFSET = 0.55;
/** How far the irises can move down, tighter than the rest, so they don't sink under the lower lids */
const MAX_IRIS_DROP = 0.3;
/**
 * Projecting the gaze straight onto the screen centers the irises when looking at the viewer,
 * which reads as looking slightly down, since the head is tilted towards the viewer and the
 * upper lids cover the top of the eyes. Lifting them by a part of the physically correct
 * offset compensates.
 */
const VIEWER_GAZE_LIFT = 0.35;
/** Right, as seen from the front of the head, in body space */
const EYES_RIGHT: Vec3 = [Math.SQRT1_2, 0, -Math.SQRT1_2];
const POINTER_ATTENTION_MS = 2500;
/** The plum drawn behind the page content, by its index in `PLUM_PALETTES` (blue) */
const BEHIND_CONTENT = 2;
/** Extra room kept between the plums and the sections they hang around, in rem */
const SECTION_CLEARANCE_REM = 1;

/** Rotation matrix R = Rz(roll) * Rx(pitch) * Ry(yaw), returned as rows */
function rotation(yaw: number, pitch: number, roll: number): number[] {
  const [cy, sy] = [Math.cos(yaw), Math.sin(yaw)];
  const [cp, sp] = [Math.cos(pitch), Math.sin(pitch)];
  const [cr, sr] = [Math.cos(roll), Math.sin(roll)];
  // Rx * Ry
  const m = [cy, 0, sy, sp * sy, cp, -sp * cy, -cp * sy, sp, cp * cy];
  // Rz * (Rx * Ry)
  return [
    cr * m[0] - sr * m[3],
    cr * m[1] - sr * m[4],
    cr * m[2] - sr * m[5],
    sr * m[0] + cr * m[3],
    sr * m[1] + cr * m[4],
    sr * m[2] + cr * m[5],
    m[6],
    m[7],
    m[8],
  ];
}

/**
 * The inverse of a rotation is its transpose. A column-major matrix built from the rows of R
 * is exactly R transposed.
 */
function inverseRotation(yaw: number, pitch: number, roll: number) {
  return d.mat3x3f(...(rotation(yaw, pitch, roll) as Mat3Rows));
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/**
 * The iris position, shared by both eyes. It's the offset on the face plane that, once the
 * head's rotation is applied, points the same way on screen as the gaze does. Looking at the
 * plane of the screen straight on keeps the irises almost centered, see `VIEWER_GAZE_LIFT`.
 *
 * @param bodyRows Body-to-view rotation, as rows
 * @param gaze Gaze direction in view space
 * @returns Iris offset on the face plane (right and up, as seen from the front of the head)
 */
function irisOffset(bodyRows: number[], gaze: Vec3): [number, number] {
  // Where the face's right and up axes end up on screen (x right, y up)
  const rows: Vec3[] = [
    [bodyRows[0], bodyRows[1], bodyRows[2]],
    [bodyRows[3], bodyRows[4], bodyRows[5]],
  ];
  const right = rows.map((row) => dot(row, EYES_RIGHT));
  const up = rows.map((row) => row[1]);
  // Solving right * x + up * y = gaze.xy
  const det = right[0] * up[1] - right[1] * up[0];
  if (Math.abs(det) < 1e-4) return [0, 0];
  // Where the iris would physically be when looking at the viewer
  const towardsViewer: Vec3 = [bodyRows[6], bodyRows[7], bodyRows[8]];
  let x =
    (gaze[0] * up[1] - gaze[1] * up[0]) / det +
    dot(towardsViewer, EYES_RIGHT) * gaze[2] * VIEWER_GAZE_LIFT;
  let y =
    (right[0] * gaze[1] - right[1] * gaze[0]) / det + towardsViewer[1] * gaze[2] * VIEWER_GAZE_LIFT;
  const offset = Math.hypot(x, y);
  if (offset > MAX_IRIS_OFFSET) {
    x *= MAX_IRIS_OFFSET / offset;
    y *= MAX_IRIS_OFFSET / offset;
  }
  return [x, Math.max(y, -MAX_IRIS_DROP)];
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const random = (min: number, max: number) => min + Math.random() * (max - min);
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

class Spring2 {
  pos: Vec2;
  vel: Vec2 = { x: 0, y: 0 };

  constructor(
    pos: Vec2,
    private stiffness: number,
    private damping: number,
    private maxSpeed = Infinity,
  ) {
    this.pos = { ...pos };
  }

  step(target: Vec2, dt: number) {
    this.vel.x += (this.stiffness * (target.x - this.pos.x) - this.damping * this.vel.x) * dt;
    this.vel.y += (this.stiffness * (target.y - this.pos.y) - this.damping * this.vel.y) * dt;
    const speed = Math.hypot(this.vel.x, this.vel.y);
    if (speed > this.maxSpeed) {
      this.vel.x *= this.maxSpeed / speed;
      this.vel.y *= this.maxSpeed / speed;
    }
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
  }
}

interface Plum {
  look: PlumLook;
  phase: number;
  body: Spring2;
  tail: Spring2;
  gaze: { x: number; y: number; z: number };
  /** Lags behind the gaze, so the eyes move first and the body turns after them */
  headTurn: Spring2;
  /** A point near what the plum is looking at, so eyes dart around instead of staring */
  glance: Vec2;
  nextGlance: number;
  nextBlink: number;
  blinkStart: number;
  /** Swing of the tail flick in radians, and how fast it's swinging */
  flick: number;
  flickVel: number;
  nextFlick: number;
  /** Seconds left of looking straight at the viewer */
  lookAtViewer: number;
  depth: number;
  scaleFactor: number;
}

export interface Stage {
  /** Text block the plums circle around at the top of the page */
  hero: Rect | null;
  /** The carousels, with the banner the plums should look at */
  carousels: { card: Rect; banner: Rect }[];
  /** The call to action at the bottom, and the button in it */
  cta: { heading: Rect; button: Rect } | null;
  /** Bottom edge of the site header */
  headerBottom: number;
  viewport: { width: number; height: number };
  /** CSS pixels per rem */
  remPx: number;
}

type Focus =
  | { kind: 'hero'; rect: Rect }
  | { kind: 'carousel'; index: number; card: Rect; banner: Rect }
  | { kind: 'cta'; heading: Rect; button: Rect };

const center = (r: Rect): Vec2 => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });

export function createPlumSim(reducedMotion: boolean) {
  const start = { x: window.innerWidth / 2, y: window.innerHeight / 3 };
  const plums: Plum[] = LOOKS.map((look, i) => ({
    look,
    phase: i * 2.1,
    body: new Spring2(start, 26, 7.5, 2400),
    tail: new Spring2(start, 95, 7, 4000),
    gaze: { x: 0, y: 0, z: 1 },
    // Critically damped, so the body eases into the turn without overshooting
    headTurn: new Spring2({ x: 0, y: 0 }, 9, 6),
    glance: { ...start },
    nextGlance: 0,
    nextBlink: random(1, 4),
    blinkStart: -10,
    flick: 0,
    flickVel: 0,
    nextFlick: random(2, 6),
    lookAtViewer: 0,
    depth: 0,
    scaleFactor: 1,
  }));

  const pointer = { x: 0, y: 0, lastMove: -Infinity };
  let time = 0;
  /** Seconds left of everyone looking at the banner, after the carousel changed */
  let bannerAttention = 0;
  let focus: Focus | null = null;

  function pickFocus(stage: Stage): Focus | null {
    const viewCenter = stage.viewport.height * 0.45;
    let best: Focus | null = null;
    let bestDist = Infinity;
    const consider = (candidate: Focus, rect: Rect) => {
      const dist = Math.abs(center(rect).y - viewCenter);
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    };
    if (stage.hero) consider({ kind: 'hero', rect: stage.hero }, stage.hero);
    stage.carousels.forEach((c, index) =>
      consider({ kind: 'carousel', index, card: c.card, banner: c.banner }, c.card),
    );
    if (stage.cta) consider({ kind: 'cta', ...stage.cta }, stage.cta.heading);
    return best;
  }

  /** Where each plum wants to be, and what it wants to look at */
  function choreograph(stage: Stage, unit: number) {
    if (!focus) {
      return null;
    }

    const { width, height } = stage.viewport;
    const plumWidth = unit * 3;
    const targets: { pos: Vec2; lookAt: Vec2; depth: number; scale: number }[] = [];
    const wander = (i: number, amount: number): Vec2 =>
      reducedMotion
        ? { x: 0, y: 0 }
        : {
            x: Math.sin(time * 0.9 + plums[i].phase * 1.7) * amount,
            y: Math.cos(time * 1.3 + plums[i].phase) * amount * 0.8,
          };

    if (focus.kind === 'hero') {
      // Circling around the text, on an ellipse wide enough to clear its corners
      const c = center(focus.rect);
      const halfW = (focus.rect.right - focus.rect.left) / 2;
      const halfH = (focus.rect.bottom - focus.rect.top) / 2;
      const rx = Math.min(halfW * 1.45 + plumWidth * 0.6, width / 2 - plumWidth * 0.45);
      const ry = halfH * 1.35 + plumWidth * 0.35;
      const minY = stage.headerBottom + plumWidth * 0.8;
      const orbitAngle = reducedMotion ? 0.6 : time * 0.32;

      for (let i = 0; i < plums.length; i++) {
        const angle = orbitAngle + (i * Math.PI * 2) / plums.length;
        // The near side of the orbit is at the bottom, plums there are bigger and drawn on top
        const near = Math.sin(angle);
        targets.push({
          pos: {
            x: c.x + Math.cos(angle) * rx,
            y: Math.max(minY, c.y + near * ry),
          },
          lookAt: { x: c.x, y: c.y - halfH * 0.4 },
          depth: near,
          scale: 0.92 + near * 0.12,
        });
      }
      return targets;
    }

    // Around the sides of a carousel, or of the call to action
    const rect = focus.kind === 'carousel' ? focus.card : focus.heading;
    const lookRect = focus.kind === 'carousel' ? focus.banner : focus.button;
    const clearance = SECTION_CLEARANCE_REM * stage.remPx;
    const side = Math.min(rect.left, width - rect.right);
    const roomy = side > plumWidth * 1.3 + clearance;
    const cy = (rect.top + rect.bottom) / 2;
    // Keeping the two plums on one side apart, even next to something short
    const spread = Math.max((rect.bottom - rect.top) * 0.25, plumWidth * 0.75);
    const gap = plumWidth * 0.78 + clearance;

    const slots: Vec2[] = roomy
      ? [
          { x: rect.left - gap, y: cy - spread },
          { x: rect.left - gap * 1.05, y: cy + spread },
          { x: rect.right + gap, y: cy - spread * 0.2 },
        ]
      : // Not enough room on the sides, so they perch along the top edge instead
        [
          { x: rect.left + plumWidth * 0.55, y: rect.top - unit * 1.3 - clearance },
          { x: rect.right - plumWidth * 0.55, y: rect.top - unit * 1.1 - clearance },
          {
            x: rect.left + (rect.right - rect.left) * 0.62,
            y: rect.top - unit * 1.45 - clearance,
          },
        ];

    // Each section shuffles which plum takes which spot
    const shift = focus.kind === 'carousel' ? focus.index : 1;
    for (let i = 0; i < plums.length; i++) {
      const slot = slots[(i + shift) % slots.length];
      const w = wander(i, roomy ? unit * 0.7 : unit * 0.25);
      targets.push({
        pos: { x: slot.x + w.x, y: slot.y + w.y },
        lookAt: center(lookRect),
        depth: 0,
        scale: roomy ? 1 : 0.8,
      });
    }

    // When their spot scrolls out of view, they wait at the edge of the screen closest to it
    for (const target of targets) {
      target.pos.y = clamp(target.pos.y, stage.headerBottom + unit * 2.5, height - unit * 2);
    }
    return targets;
  }

  function stepEyes(plum: Plum, lookAt: Vec2, lookRect: Rect | null, dt: number) {
    const pointerActive = performance.now() - pointer.lastMove < POINTER_ATTENTION_MS;

    let target: Vec2 = lookAt;
    if (pointerActive && bannerAttention <= 0) {
      target = pointer;
    } else if (lookRect) {
      // Eyes dart around the thing they're inspecting
      if (time > plum.nextGlance) {
        plum.glance = {
          x: random(lookRect.left, lookRect.right),
          y: random(lookRect.top, lookRect.bottom),
        };
        plum.nextGlance = time + random(0.7, 2.2);
      }
      target = plum.glance;
    }

    // Straight ahead when looking at the viewer
    let gx = 0;
    let gy = 0;
    let gz = 1;
    if (plum.lookAtViewer <= 0) {
      gx = (target.x - plum.body.pos.x) / GAZE_DEPTH;
      gy = -(target.y - plum.body.pos.y) / GAZE_DEPTH;
    }
    const len = Math.hypot(gx, gy, gz);
    gx /= len;
    gy /= len;
    gz /= len;

    // Quick, saccade-like eye movement
    const k = damp(16, dt);
    plum.gaze.x += (gx - plum.gaze.x) * k;
    plum.gaze.y += (gy - plum.gaze.y) * k;
    plum.gaze.z += (gz - plum.gaze.z) * k;
  }

  function lids(plum: Plum): [number, number, number, number] {
    const base = plum.look.lids;
    const blinkT = (time - plum.blinkStart) / 0.16;
    const blink = blinkT >= 0 && blinkT <= 1 ? 1 - Math.abs(blinkT * 2 - 1) : 0;
    return [Math.max(base[0], blink), Math.max(base[1], blink), base[2], base[3]];
  }

  return {
    onPointerMove(x: number, y: number) {
      pointer.x = x;
      pointer.y = y;
      pointer.lastMove = performance.now();
    },

    /** The carousel switched to another project */
    onSlideChange() {
      bannerAttention = 1.4;
    },

    /** Returns the plums drawn in front of the content, and the ones drawn behind it */
    step(stage: Stage, dtSeconds: number): { front: PlumInstance[]; back: PlumInstance[] } {
      const dt = Math.min(dtSeconds, 1 / 30);
      time += dt;
      bannerAttention = Math.max(0, bannerAttention - dt);

      focus = pickFocus(stage);
      const unit = clamp(stage.viewport.width * 0.021, 16, 32);
      const targets = choreograph(stage, unit);
      const lookRect =
        focus?.kind === 'carousel' ? focus.banner : focus?.kind === 'cta' ? focus.button : null;

      const layered = plums.map((plum, i) => {
        const target = targets?.[i];
        if (target) {
          plum.body.step(target.pos, dt);
          plum.depth = target.depth;
          plum.scaleFactor += (target.scale - plum.scaleFactor) * damp(4, dt);
          stepEyes(plum, target.lookAt, lookRect, dt);
        }
        plum.headTurn.step({ x: plum.gaze.x, y: plum.gaze.y }, dt);

        if (time > plum.nextBlink) {
          plum.blinkStart = time;
          // Sometimes a quick double blink
          plum.nextBlink = time + (Math.random() < 0.2 ? 0.3 : random(2.5, 6));
        }
        if (!reducedMotion && time > plum.nextFlick) {
          plum.flickVel += FLICK_IMPULSE * (Math.random() < 0.5 ? -1 : 1) * random(0.7, 1);
          // Often flicking twice in a row, the way ears do
          plum.nextFlick = time + (Math.random() < 0.35 ? random(0.18, 0.28) : random(3, 8));
        }
        plum.flickVel += (-FLICK_STIFFNESS * plum.flick - FLICK_DAMPING * plum.flickVel) * dt;
        plum.flick += plum.flickVel * dt;

        plum.lookAtViewer = Math.max(0, plum.lookAtViewer - dt);
        if (focus?.kind === 'hero' && Math.random() < dt * 0.05) {
          plum.lookAtViewer = random(1, 2.2);
        }

        const scale = unit * plum.scaleFactor;
        const bob = reducedMotion ? 0 : Math.sin(time * 2.1 + plum.phase) * unit * 0.22;
        const bodyPos = { x: plum.body.pos.x, y: plum.body.pos.y + bob };

        // Leaning into the movement, and turning towards whatever the eyes found a moment ago
        const vel = plum.body.vel;
        const roll =
          clamp(-vel.x * 0.0011, -0.4, 0.4) +
          (reducedMotion ? 0 : Math.sin(time * 1.3 + plum.phase) * 0.05);
        const pitch = BASE_PITCH + clamp(vel.y * 0.0006, -0.25, 0.25) - plum.headTurn.pos.y * 0.3;
        const yaw =
          BASE_YAW +
          plum.headTurn.pos.x * 0.5 +
          (reducedMotion ? 0 : Math.sin(time * 0.7 + plum.phase) * 0.06);

        // The tail hangs from a point above the body, and follows it on a looser spring
        const [ax, ay] = TAIL_ANCHOR;
        const anchor = {
          x: bodyPos.x + (ax * Math.cos(roll) - ay * Math.sin(roll)) * scale,
          y: bodyPos.y - (ax * Math.sin(roll) + ay * Math.cos(roll)) * scale,
        };
        plum.tail.step(anchor, dt);
        // Not letting it lag outside of the quad it's drawn in
        const lagX = clamp((plum.tail.pos.x - anchor.x) / scale, -1.1, 1.1);
        const lagY = clamp((plum.tail.pos.y - anchor.y) / scale, -0.6, 0.6);
        plum.tail.pos.x = anchor.x + lagX * scale;
        plum.tail.pos.y = anchor.y + lagY * scale;

        const bodyRows = rotation(yaw, pitch, roll);
        const iris = irisOffset(bodyRows, [plum.gaze.x, plum.gaze.y, plum.gaze.z]);

        const tailRoll = TAIL_ROLL + roll - lagX * 0.5 + plum.flick;
        const tailYaw =
          (reducedMotion ? 0.3 : Math.sin(time * 0.8 + plum.phase) * 0.45) +
          plum.flick * FLICK_TWIST;

        const instance: PlumInstance = {
          center: d.vec2f(bodyPos.x, bodyPos.y),
          scale,
          opacity: 1,
          bodyInvRot: d.mat3x3f(...(bodyRows as Mat3Rows)),
          tailOffset: d.vec3f(
            (plum.tail.pos.x - bodyPos.x) / scale,
            -(plum.tail.pos.y - bodyPos.y) / scale,
            0,
          ),
          tailInvRot: inverseRotation(tailYaw, 0, tailRoll),
          iris: d.vec2f(...iris),
          lids: d.vec4f(...lids(plum)),
          bodyTop: plum.look.bodyTop,
          bodyBottom: plum.look.bodyBottom,
          ringTop: plum.look.ringTop,
          ringBottom: plum.look.ringBottom,
          tailTop: plum.look.tailTop,
          tailBottom: plum.look.tailBottom,
        };
        return { instance, depth: plum.depth, behind: i === BEHIND_CONTENT };
      });

      // Drawn back to front, so overlapping plums layer correctly
      layered.sort((a, b) => a.depth - b.depth);
      const front: PlumInstance[] = [];
      const back: PlumInstance[] = [];
      for (const { instance, behind } of layered) {
        (behind ? back : front).push(instance);
      }
      return { front, back };
    },
  };
}
