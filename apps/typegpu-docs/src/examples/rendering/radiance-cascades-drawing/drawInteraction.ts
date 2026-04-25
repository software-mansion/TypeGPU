import { d } from 'typegpu';

type Point = { x: number; y: number };

type DrawInteractionOptions = {
  canvas: HTMLCanvasElement;
  onDraw: (state: { last: Point | null; current: Point; color: d.v3f }) => void;
  onStop: () => void;
};

function hslToRgb(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l);

  function channel(n: number) {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  }

  return d.vec3f(channel(0), channel(8), channel(4));
}

export function createDrawInteraction({ canvas, onDraw, onStop }: DrawInteractionOptions) {
  let last: Point | null = null;
  let current: Point | null = null;
  let isDrawing = false;
  let activeButton: 0 | 2 = 0;
  let primaryColor = d.vec3f(1, 0.9, 0.7);
  let secondaryColor = d.vec3f(0.25, 0.55, 1);
  let animateColor = false;

  function brushColor(timestamp = performance.now()) {
    if (activeButton === 2) {
      return secondaryColor;
    }

    if (!animateColor) {
      return primaryColor;
    }

    return hslToRgb((timestamp * 0.00008) % 1, 0.82, 0.62);
  }

  function mousePosition(e: MouseEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function touchPosition(touches: TouchList): Point {
    const first = touches[0];
    const second = touches[1];
    const clientX = second ? (first.clientX + second.clientX) / 2 : first.clientX;
    const clientY = second ? (first.clientY + second.clientY) / 2 : first.clientY;

    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }

  function setButton(useSecondary: boolean) {
    activeButton = useSecondary ? 2 : 0;
  }

  function draw(point: Point, timestamp?: number) {
    if (!isDrawing) {
      return;
    }

    const previous = last;
    last = point;
    current = point;
    onDraw({ last: previous, current: point, color: brushColor(timestamp) });
  }

  function start(point: Point, useSecondary: boolean) {
    setButton(useSecondary);
    isDrawing = true;
    last = null;
    draw(point);
  }

  function stop() {
    if (!isDrawing) {
      return;
    }

    onStop();
    isDrawing = false;
    last = null;
    current = null;
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0 && e.button !== 2) {
      return;
    }

    start(mousePosition(e), e.button === 2);
  }

  function onMouseMove(e: MouseEvent) {
    draw(mousePosition(e));
  }

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 0) {
      return;
    }

    e.preventDefault();
    start(touchPosition(e.touches), e.touches.length >= 2);
  }

  function onTouchMove(e: TouchEvent) {
    if (e.touches.length === 0) {
      return;
    }

    e.preventDefault();
    setButton(e.touches.length >= 2);
    draw(touchPosition(e.touches));
  }

  function onTouchEnd(e: TouchEvent) {
    if (e.touches.length === 0) {
      stop();
    } else {
      start(touchPosition(e.touches), e.touches.length >= 2);
    }
  }

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', stop);
  canvas.addEventListener('mouseleave', stop);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
  canvas.addEventListener('touchcancel', stop);

  return {
    controls: {
      'Primary Color': {
        initial: primaryColor,
        onColorChange(value: d.v3f) {
          primaryColor = value;
        },
      },
      'Secondary Color': {
        initial: secondaryColor,
        onColorChange(value: d.v3f) {
          secondaryColor = value;
        },
      },
      'Animated Color': {
        initial: false,
        onToggleChange(value: boolean) {
          animateColor = value;
        },
      },
    },

    update(timestamp: number) {
      if (isDrawing && animateColor && activeButton === 0 && current) {
        onDraw({ last: null, current, color: brushColor(timestamp) });
      }
    },

    stop,
  };
}
