import type { Rect, Stage } from './plum-sim.ts';

function rectOf(el: Element): Rect {
  const { left, top, right, bottom } = el.getBoundingClientRect();
  return { left, top, right, bottom };
}

function unionOf(elements: Iterable<Element>) {
  let result: Rect | null = null;
  for (const el of elements) {
    const r = rectOf(el);
    result = result
      ? {
          left: Math.min(result.left, r.left),
          top: Math.min(result.top, r.top),
          right: Math.max(result.right, r.right),
          bottom: Math.max(result.bottom, r.bottom),
        }
      : r;
  }
  return result;
}

/** The elements the plums care about */
function queryElements() {
  const cta = document.querySelector('[data-plums-cta]');
  return {
    hero: document.querySelector('[data-plums-hero]'),
    carousels: [...document.querySelectorAll('[data-plums-carousel] [data-plums-card]')].map(
      (card) => ({ card, banner: card.querySelector('[data-plums-banner]') ?? card }),
    ),
    ctaHeading: cta?.querySelector('h2') ?? null,
    ctaButton: cta?.querySelector('a') ?? null,
    header: document.querySelector('[data-site-header]'),
  };
}

/**
 * Keeps track of where the elements the plums care about are on screen. Measuring the page is
 * costly, so it only happens again after scrolling, resizing, or a change to the DOM.
 */
export function createStageTracker() {
  let elements = queryElements();
  let elementsStale = false;
  let stage: Stage | null = null;

  const invalidate = () => {
    stage = null;
  };

  // Elements that can move the others around, or the plums' targets, when they change size
  const resizeObserver = new ResizeObserver(invalidate);
  const observeElements = () => {
    resizeObserver.disconnect();
    resizeObserver.observe(document.body);
    const { hero, carousels, header } = elements;
    for (const el of [...(hero?.children ?? []), ...carousels.map((c) => c.card), header]) {
      if (el) resizeObserver.observe(el);
    }
  };
  observeElements();

  // Islands hydrating, or carousels swapping their slides
  const mutationObserver = new MutationObserver(() => {
    elementsStale = true;
    invalidate();
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('scroll', invalidate, { passive: true });
  window.addEventListener('resize', invalidate);

  return {
    measure(): Stage {
      if (stage) return stage;
      if (elementsStale) {
        elements = queryElements();
        elementsStale = false;
        observeElements();
      }

      const { hero, carousels, ctaHeading, ctaButton, header } = elements;
      const root = document.documentElement;
      stage = {
        hero: hero ? unionOf(hero.children) : null,
        carousels: carousels.map(({ card, banner }) => ({
          card: rectOf(card),
          banner: rectOf(banner),
        })),
        cta:
          ctaHeading && ctaButton
            ? { heading: rectOf(ctaHeading), button: rectOf(ctaButton) }
            : null,
        headerBottom: header?.getBoundingClientRect().bottom ?? 0,
        // The size of the fixed, fullscreen canvases the plums are drawn in
        viewport: { width: root.clientWidth, height: root.clientHeight },
        remPx: parseFloat(getComputedStyle(root).fontSize),
      };
      return stage;
    },

    destroy() {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('scroll', invalidate);
      window.removeEventListener('resize', invalidate);
    },
  };
}
