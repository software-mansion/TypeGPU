import { useSetAtom } from 'jotai';
import type { MouseEvent } from 'react';
import { examples } from '../examples/exampleContent.ts';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom.ts';
import type { Example } from '../utils/examples/types.ts';

// These lists are intentionally curated by hand for now. Primary sections use
// first-match semantics. Featured examples are repeated above them.
export const FEATURED_EXAMPLE_KEYS = [
  'image-processing--monocular-light-injection',
  'image-processing--selfie-segmentation',
  'rendering--jelly-slider',
  'rendering--jelly-switch',
  'simulation--slime-mold-3d',
  'rendering--3d-fish',
] as const;

export const INTEGRATION_EXAMPLE_KEYS = [
  'image-processing--background-segmentation',
  'algorithms--probability',
  'react--spinning-triangle',
  'react--shifting-gradient',
  'react--confetti',
  'threejs--simple',
  'threejs--varyings',
  'threejs--texture-access',
  'threejs--compute-geometry',
  'threejs--compute-particles',
  'threejs--compute-particles-snow',
  'threejs--attractors',
  'threejs--compute-cloth',
] as const;

export const FROM_SCRATCH_EXAMPLE_KEYS = [
  'rendering--radiance-cascades',
  'algorithms--jump-flood-distance',
  'algorithms--jump-flood-voronoi',
] as const;

export const BEGINNER_EXAMPLE_KEYS = [
  'simple--triangle',
  'simple--increment',
  'simple--square',
  'simple--gradient-tiles',
  'simple--stencil',
  'simple--triangle-gl',
  'simple--texture-gl',
  'rendering--perlin-noise',
  'image-processing--camera-thresholding',
  'image-processing--chroma-keying',
  'image-processing--blur',
] as const;

export const ADVANCED_EXAMPLE_KEYS = [
  'algorithms--genetic-racing',
  'algorithms--matrix-multiplication',
  'algorithms--matrix-next',
  'algorithms--mnist-inference',
  'image-processing--ascii-filter',
  'image-processing--image-tuning',
  'image-processing--monocular-light-injection',
  'image-processing--selfie-segmentation',
  'rendering--3d-fish',
  'rendering--area-light',
  'rendering--box-raytracing',
  'rendering--caustics',
  'rendering--caustics-gl',
  'rendering--clouds',
  'rendering--cubemap-reflection',
  'rendering--function-visualizer',
  'rendering--jelly-slider',
  'rendering--jelly-switch',
  'rendering--os-awards',
  'rendering--phong-reflection',
  'rendering--point-light-shadow',
  'rendering--disco',
  'rendering--pom',
  'rendering--radiance-cascades-drawing',
  'rendering--ray-marching',
  'rendering--render-bundles',
  'rendering--render-bundles-with',
  'rendering--simple-shadow',
  'rendering--smoky-triangle',
  'rendering--suika-sdf',
  'rendering--trippy-raymarching',
  'rendering--two-boxes',
  'rendering--xor-dev-centrifuge-2',
  'rendering--xor-dev-runner',
  'simple--liquid-glass',
  'simple--mesh-skinning',
  'simple--oklab',
  'simple--ripple-cube',
  'simple--vaporrave',
  'simulation--boids',
  'simulation--confetti',
  'simulation--fluid-double-buffering',
  'simulation--fluid-with-atomics',
  'simulation--game-of-life',
  'simulation--gravity',
  'simulation--slime-mold',
  'simulation--slime-mold-3d',
  'simulation--stable-fluid',
] as const;

const SHOWCASE_SECTIONS = [
  {
    id: 'beginner-friendly',
    title: 'Beginner friendly',
    description: 'Small, focused references for learning the TypeGPU fundamentals.',
    keys: BEGINNER_EXAMPLE_KEYS,
  },
  {
    id: 'advanced',
    title: 'Advanced',
    description: 'Deeper rendering, simulation, image processing, and GPU compute projects.',
    keys: ADVANCED_EXAMPLE_KEYS,
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'TypeGPU working alongside tools like Three.js, React, ONNX Runtime, and more.',
    keys: INTEGRATION_EXAMPLE_KEYS,
  },
  {
    id: 'from-scratch',
    title: 'From scratch',
    description: 'Core techniques built without their matching ecosystem package.',
    keys: FROM_SCRATCH_EXAMPLE_KEYS,
  },
] as const;

function resolveExamples(keys: readonly string[]): Example[] {
  return keys.flatMap((key) => {
    const example = examples[key];
    return example && !example.metadata.dev ? [example] : [];
  });
}

function ShowcaseCard({ example }: { example: Example }) {
  const setCurrentExample = useSetAtom(currentExampleAtom);

  const openExample = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setCurrentExample(example.key);
    requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  };

  return (
    <a
      href={`#example=${example.key}`}
      onClick={openExample}
      className="group border-tameplum-100 dark:border-white/10 dark:bg-[#232736] dark:hover:border-accent-200/50 relative flex min-w-0 flex-col overflow-hidden border bg-white no-underline transition-[border-color,box-shadow] duration-200 hover:border-accent-600/40 hover:shadow-[0_10px_28px_rgba(46,41,95,0.10)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
    >
      <div className="bg-tameplum-50 dark:bg-[#171a25] relative aspect-[4/3] w-full overflow-hidden">
        {example.thumbnails ? (
          <picture className="block size-full">
            <source media="(min-width: 1025px)" srcSet={example.thumbnails.small} />
            <img
              src={example.thumbnails.large}
              alt=""
              className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.025] motion-reduce:transition-none"
              loading="lazy"
            />
          </picture>
        ) : (
          <span className="text-tameplum-600 dark:text-gray-400 grid size-full place-items-center px-4 text-center text-xs">
            Preview unavailable
          </span>
        )}
        {example.metadata.tags?.includes('webgl') && (
          <span className="bg-navy-100 dark:bg-almost-white dark:text-navy-100 absolute top-3 left-3 px-2 py-1 font-mono text-[9px] font-semibold tracking-[0.08em] text-white">
            WebGPU + WebGL
          </span>
        )}
      </div>
      <div className="flex min-h-15 items-center justify-between gap-3 px-4 py-3">
        <h3 className="text-navy-100 dark:text-almost-white m-0 min-w-0 line-clamp-2 text-sm leading-tight font-medium">
          {example.metadata.title}
        </h3>
        <span
          aria-hidden="true"
          className="text-accent-600 dark:text-accent-200 shrink-0 text-lg transition-transform duration-200 group-hover:translate-x-0.5"
        >
          &rarr;
        </span>
      </div>
    </a>
  );
}

function ShowcaseGrid({ keys }: { keys: readonly string[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 min-[1200px]:grid-cols-3">
      {resolveExamples(keys).map((example) => (
        <ShowcaseCard key={example.key} example={example} />
      ))}
    </div>
  );
}

export function ExampleShowcase() {
  return (
    <div className="pb-12">
      <section aria-labelledby="featured-examples" className="mb-14 pt-2">
        <div className="mb-5">
          <h2
            id="featured-examples"
            className="text-navy-100 dark:text-almost-white m-0 text-3xl font-semibold tracking-[-0.025em] sm:text-4xl"
          >
            Featured
          </h2>
        </div>
        <ShowcaseGrid keys={FEATURED_EXAMPLE_KEYS} />
      </section>

      <div className="flex flex-col gap-14">
        {SHOWCASE_SECTIONS.map((section) => (
          <section key={section.id} aria-labelledby={`${section.id}-examples`}>
            <div className="mb-5">
              <h2
                id={`${section.id}-examples`}
                className="text-navy-100 dark:text-almost-white m-0 text-2xl font-semibold tracking-[-0.02em]"
              >
                {section.title}
              </h2>
              <p className="text-tameplum-800 dark:text-gray-300 mt-2 mb-0 max-w-2xl text-sm leading-relaxed">
                {section.description}
              </p>
            </div>
            <ShowcaseGrid keys={section.keys} />
          </section>
        ))}
      </div>
    </div>
  );
}
