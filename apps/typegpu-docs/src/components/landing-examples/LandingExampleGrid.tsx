import { Root } from '@typegpu/react';
import ExternalOpenSvg from '../../assets/externalopen.svg';
import CausticsThumbnail from '../../examples/rendering/caustics/thumbnail.png';
import RayMarchingThumbnail from '../../examples/rendering/ray-marching/thumbnail.png';
import JellySliderThumbnail from '../../examples/rendering/jelly-slider/thumbnail.png';
import FishThumbnail from '../../examples/rendering/3d-fish/thumbnail.png';
import CubemapReflectionThumbnail from '../../examples/rendering/cubemap-reflection/thumbnail.png';
import VaporRaveThumbnail from '../../examples/simple/vaporrave/thumbnail.png';

import HoverExampleIsland from './HoverExampleIsland.tsx';

import { setupScene as setupReflection } from '../../examples/rendering/cubemap-reflection/scene.ts';
import { setupScene as setupJelly } from '../../examples/rendering/jelly-slider/scene.ts';
import { setupScene as setupVaporRave } from '../../examples/simple/vaporrave/scene.ts';
import { setupScene as setupRayMarching } from '../../examples/rendering/ray-marching/scene.ts';
import { setupScene as setupFish } from '../../examples/rendering/3d-fish/scene.ts';
import { setupScene as setupCaustics } from '../../examples/rendering/caustics/scene.ts';

const galleryItems = [
  {
    asset: JellySliderThumbnail,
    title: 'Jelly Slider',
    key: 'rendering--jelly-slider',
    setup: setupJelly,
  },
  {
    asset: FishThumbnail,
    title: '3D Fish',
    key: 'rendering--3d-fish',
    setup: setupFish,
  },
  {
    asset: VaporRaveThumbnail,
    title: 'VaporRave',
    key: 'simple--vaporrave',
    setup: setupVaporRave,
  },
  {
    asset: CubemapReflectionThumbnail,
    title: 'Cubemap Reflection',
    key: 'rendering--cubemap-reflection',
    setup: setupReflection,
  },
  {
    asset: CausticsThumbnail,
    title: 'Caustics',
    key: 'rendering--caustics',
    setup: setupCaustics,
  },
  {
    asset: RayMarchingThumbnail,
    title: 'Ray Marching',
    key: 'rendering--ray-marching',
    setup: setupRayMarching,
  },
] as const;

export default function TgpuExamples() {
  return (
    <Root>
      <div className="border-accent-500 mb-4 border px-4 py-3 text-center text-sm sm:hidden dark:text-white">
        Hint: tap the example with two fingers to preview
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-2">
        {galleryItems.map((item) => (
          <div
            key={item.key}
            className="group relative aspect-square overflow-hidden"
            data-example-card
            style={{ touchAction: 'pan-x pan-y' }}
          >
            <a
              href={`/TypeGPU/examples/#example=${item.key}`}
              className="absolute inset-x-6 bottom-6 z-10 flex h-16 items-center justify-between gap-3 bg-white px-4 text-blue-900 no-underline"
            >
              <span className="max-w-[70%] truncate text-sm font-medium">
                {item.title}
              </span>
              <img
                src={ExternalOpenSvg.src}
                alt="Open example"
                className="h-6 w-6 flex-shrink-0"
                loading="lazy"
              />
            </a>

            <img
              src={item.asset.src}
              alt={item.title}
              className="h-full w-full object-cover transition duration-300 ease-out"
            />

            <div
              data-hover-overlay
              className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 ease-out group-hover:pointer-events-auto group-hover:opacity-100 data-[active=true]:pointer-events-auto data-[active=true]:opacity-100"
            >
              <div className="pointer-events-auto h-full w-full backdrop-blur">
                <HoverExampleIsland exampleKey={item.key} setup={item.setup} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Root>
  );
}
