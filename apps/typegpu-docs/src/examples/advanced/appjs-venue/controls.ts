import { d, std } from 'typegpu';
import { mat4n } from 'wgpu-matrix';
import { createSpring } from './spring.ts';

const FOV = Math.PI / 4;
const MAX_VELOCITY = 8;
const VELOCITY_SAMPLE_WINDOW_MS = 100;

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Asymptotic max overshoot past the bound, in world units. */
  overshoot: number;
}

export interface ControlsOptions {
  bounds: Bounds;
  initialAnchor: d.v2f;
  initialYaw: number;
  /** How far (in radians) the camera can be rotated away from `initialYaw`. */
  maxYawOffset: number;
  minZoom: number;
  maxZoom: number;
  signal: AbortSignal;
}

// iOS-style hyperbolic rubber-band: the further past the bound, the more resistance,
// asymptotically approaching `overshoot` units beyond the bound.
function rubberBandClamp(x: number, min: number, max: number, overshoot: number) {
  if (x < min) {
    const o = min - x;
    return min - (overshoot * o) / (overshoot + o);
  }
  if (x > max) {
    const o = x - max;
    return max + (overshoot * o) / (overshoot + o);
  }
  return x;
}

/**
 * Scales `v` down (in place) so that its length doesn't exceed `max`.
 */
function clampLength(v: d.v2f, max: number) {
  const len = std.length(v);
  if (len > max) {
    v.x *= max / len;
    v.y *= max / len;
  }
}

/**
 * Pan (with inertia and rubber-banded bounds), zoom and rotate controls for a camera
 * orbiting a point on the ground plane. Works with mouse, touch and pen input.
 *
 * - Drag (one finger / left mouse button): pan
 * - Pinch / mouse wheel / trackpad pinch: zoom
 * - Two-finger twist / right mouse button drag / Shift + drag: rotate
 */
export function createControls(canvas: HTMLCanvasElement, options: ControlsOptions) {
  const { bounds, signal } = options;

  // World-space point the camera rotates around (before rubber-banding)
  const anchor = d.vec2f(options.initialAnchor);
  // Velocity of the anchor point
  const velocity = d.vec2f();

  let yaw = options.initialYaw;
  let zoom = 1;
  const yawSpring = createSpring(yaw, { stiffness: 200, dampingRatio: 1 });
  const zoomSpring = createSpring(zoom, { stiffness: 200, dampingRatio: 1 });

  // Animates from a top-down view into the 3d view
  const in3dTransition = createSpring(0);
  in3dTransition.target = 1;

  const minYaw = options.initialYaw - options.maxYawOffset;
  const maxYaw = options.initialYaw + options.maxYawOffset;
  const logMinZoom = Math.log(options.minZoom);
  const logMaxZoom = Math.log(options.maxZoom);

  const displayedAnchor = () =>
    d.vec3f(
      rubberBandClamp(anchor.x, bounds.minX, bounds.maxX, bounds.overshoot),
      0,
      rubberBandClamp(anchor.y, bounds.minZ, bounds.maxZ, bounds.overshoot),
    );
  const displayedYaw = () => rubberBandClamp(yaw, minYaw, maxYaw, Math.PI / 6);
  const displayedZoom = () =>
    Math.exp(rubberBandClamp(Math.log(zoom), logMinZoom, logMaxZoom, 0.3));

  function cameraPosition() {
    const fadeIn = in3dTransition.value;
    const trueYaw = std.mix(0, displayedYaw(), fadeIn);
    const trueDistance = std.mix(2, 3 / displayedZoom(), fadeIn);
    return d
      .vec3f(Math.sin(trueYaw), 1 + (1 - fadeIn) * 2, Math.cos(trueYaw))
      .mul(trueDistance)
      .add(displayedAnchor());
  }

  /**
   * Casts a ray from the camera through a point on the canvas (in CSS pixels),
   * and intersects it with the ground plane.
   */
  function projectScreenPointOnFloor(screenX: number, screenY: number): d.v3f | undefined {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ndc = d.vec2f((screenX / width) * 2 - 1, 1 - (screenY / height) * 2);

    const position = cameraPosition();
    const forward = std.normalize(displayedAnchor().sub(position));
    const right = std.normalize(std.cross(forward, d.vec3f(0, 1, 0)));
    const up = std.cross(right, forward);
    const halfHeight = Math.tan(FOV / 2);
    const dir = forward
      .add(right.mul(ndc.x * halfHeight * (width / height)))
      .add(up.mul(ndc.y * halfHeight));

    if (dir.y > -1e-4) {
      // The ray never hits the ground
      return undefined;
    }
    return position.add(dir.mul(position.y / -dir.y));
  }

  /**
   * Runs `transform` (which changes zoom and/or yaw), then moves the anchor so that
   * the ground point that was under `from` ends up under `to`.
   */
  function keepPointUnder(from: d.v2f, to: d.v2f, transform?: () => void) {
    const before = projectScreenPointOnFloor(from.x, from.y);
    transform?.();
    const after = projectScreenPointOnFloor(to.x, to.y);
    if (before && after) {
      anchor.x += before.x - after.x;
      anchor.y += before.z - after.z;
    }
  }

  // Input handling

  const pointers = new Map<number, d.v2f>();
  let mouseMode: 'pan' | 'rotate' = 'pan';
  let velocitySamples: { time: number; x: number; z: number }[] = [];

  const toLocal = (event: PointerEvent | WheelEvent) => {
    const rect = canvas.getBoundingClientRect();
    return d.vec2f(event.clientX - rect.left, event.clientY - rect.top);
  };

  const centroid = () =>
    [...pointers.values()].reduce((sum, p) => sum.add(p), d.vec2f()).div(pointers.size);

  const pinchShape = () => {
    const [a, b] = [...pointers.values()] as [d.v2f, d.v2f];
    const diff = b.sub(a);
    return { distance: std.length(diff), angle: Math.atan2(diff.y, diff.x) };
  };

  const recordVelocitySample = (time: number) => {
    velocitySamples.push({ time, x: anchor.x, z: anchor.y });
    velocitySamples = velocitySamples.filter((s) => time - s.time <= VELOCITY_SAMPLE_WINDOW_MS);
  };

  function settle() {
    // Committing whatever overshoot the user ended up with, and springing back from there
    yaw = displayedYaw();
    zoom = displayedZoom();
    yawSpring.value = yaw;
    yawSpring.velocity = 0;
    zoomSpring.value = zoom;
    zoomSpring.velocity = 0;
  }

  const previousTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'none';
  signal.addEventListener('abort', () => {
    canvas.style.touchAction = previousTouchAction;
  });

  canvas.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });

  canvas.addEventListener(
    'pointerdown',
    (event) => {
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, toLocal(event));

      if (event.pointerType === 'mouse') {
        mouseMode = event.button === 2 || event.shiftKey ? 'rotate' : 'pan';
      }

      velocity.x = 0;
      velocity.y = 0;
      velocitySamples = [];
      recordVelocitySample(event.timeStamp);
    },
    { signal },
  );

  canvas.addEventListener(
    'pointermove',
    (event) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) {
        return;
      }
      const current = toLocal(event);

      if (event.pointerType === 'mouse' && mouseMode === 'rotate') {
        pointers.set(event.pointerId, current);
        yaw -= (current.x - previous.x) * 0.005;
        return;
      }

      const prevCentroid = centroid();
      const prevPinch = pointers.size === 2 ? pinchShape() : undefined;
      pointers.set(event.pointerId, current);
      const nextCentroid = centroid();
      const nextPinch = pointers.size === 2 ? pinchShape() : undefined;

      keepPointUnder(prevCentroid, nextCentroid, () => {
        if (prevPinch && nextPinch && prevPinch.distance > 0) {
          zoom *= nextPinch.distance / prevPinch.distance;
          let deltaAngle = nextPinch.angle - prevPinch.angle;
          // Unwrapping the angle, so that crossing ±PI doesn't cause a full spin
          deltaAngle = ((deltaAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          yaw += deltaAngle;
        }
      });

      recordVelocitySample(event.timeStamp);
    },
    { signal },
  );

  const onPointerEnd = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) {
      return;
    }
    if (pointers.size > 0) {
      // The gesture continues with the remaining pointers
      velocitySamples = [];
      recordVelocitySample(event.timeStamp);
      return;
    }

    settle();

    // Flinging the map, based on how fast it was moving right before release
    recordVelocitySample(event.timeStamp);
    const first = velocitySamples[0];
    const last = velocitySamples[velocitySamples.length - 1];
    if (first && last && last.time - first.time > 0) {
      const dt = (last.time - first.time) * 0.001;
      velocity.x = (last.x - first.x) / dt;
      velocity.y = (last.z - first.z) / dt;
      clampLength(velocity, MAX_VELOCITY);
    }
    velocitySamples = [];
  };

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    canvas.addEventListener(type, onPointerEnd, { signal });
  }

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const unit: Record<number, number> = {
        [WheelEvent.DOM_DELTA_LINE]: 16,
        [WheelEvent.DOM_DELTA_PAGE]: canvas.clientHeight,
      };
      const delta = event.deltaY * (unit[event.deltaMode] ?? 1);
      // Trackpad pinches arrive as wheel events with `ctrlKey` set, and with much smaller deltas
      const sensitivity = event.ctrlKey ? 0.01 : 0.002;
      const cursor = toLocal(event);

      keepPointUnder(cursor, cursor, () => {
        zoom = std.clamp(zoom * Math.exp(-delta * sensitivity), options.minZoom, options.maxZoom);
        zoomSpring.value = zoom;
        zoomSpring.velocity = 0;
      });
    },
    { passive: false, signal },
  );

  // Per-frame update

  const projection = d.mat4x4f();
  const view = d.mat4x4f();
  const viewProjection = d.mat4x4f();

  function update(dt: number) {
    in3dTransition.step(dt);

    if (pointers.size === 0) {
      anchor.x += velocity.x * dt;
      anchor.y += velocity.y * dt;

      // Friction
      const friction = Math.exp(-10 * dt);
      velocity.x *= friction;
      velocity.y *= friction;

      const o = bounds.overshoot;
      const ox =
        rubberBandClamp(anchor.x, bounds.minX, bounds.maxX, o) -
        std.clamp(anchor.x, bounds.minX, bounds.maxX);
      const oz =
        rubberBandClamp(anchor.y, bounds.minZ, bounds.maxZ, o) -
        std.clamp(anchor.y, bounds.minZ, bounds.maxZ);
      // Resistance
      velocity.x -= ox * dt * 100;
      velocity.y -= oz * dt * 100;
      clampLength(velocity, MAX_VELOCITY);

      // Springing back into the allowed zoom and rotation range
      yawSpring.target = std.clamp(yaw, minYaw, maxYaw);
      zoomSpring.target = std.clamp(zoom, options.minZoom, options.maxZoom);
      yawSpring.step(dt);
      zoomSpring.step(dt);
      yaw = yawSpring.value;
      zoom = zoomSpring.value;
    }

    const aspect = canvas.clientWidth / canvas.clientHeight || 1;
    mat4n.perspective(FOV, aspect, 0.1, 1000, projection);
    mat4n.lookAt(cameraPosition(), displayedAnchor(), d.vec3f(0, 1, 0), view);
    mat4n.multiply(projection, view, viewProjection);
  }

  return {
    update,
    camera: { view, viewProjection },
    /** World-space point the camera is looking at */
    get focus() {
      return displayedAnchor();
    },
    get in3dTransition() {
      return in3dTransition.value;
    },
  };
}
