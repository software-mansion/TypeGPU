import ExternalOpenSvg from '../assets/externalopen.svg';
import CausticsGif from '../assets/hero/caustics_bg.webp';
import RayMarchingGif from '../assets/hero/rayMarch_bg.webp';
import JellySliderGif from '../assets/hero/jellySlider_bg.jpg';
import FishGif from '../assets/hero/fish_bg.webp';
import ReflectionGif from '../assets/hero/reflection_bg.jpg';
import VaporRaveGif from '../assets/hero/rave_bg.webp';

import HoverExampleIsland from './HoverExampleIsland.tsx';

import initReflection from './cubemap-reflection/index.ts';
import initJelly from './jelly-slider/index.ts';
import initVaporRave from './vaporrave/index.ts';
import initRayMarching from './ray-marching/index.ts';
import initFish from './3d-fish/index.ts';
import initCaustics from './caustics/index.ts';

// const root = await tgpu.init({
//   device: {
//     optionalFeatures: ['timestamp-query'],
//   },
// });

const galleryItems = [
  {
    asset: ReflectionGif,
    title: 'Reflection',
    key: 'cubemap-reflection',
    init: initReflection,
  },
  {
    asset: JellySliderGif,
    title: 'Jelly Slider',
    key: 'jelly-slider',
    init: initJelly,
  },
  {
    asset: VaporRaveGif,
    title: 'VaporRave',
    key: 'vaporrave',
    init: initVaporRave,
  },
  {
    asset: RayMarchingGif,
    title: 'Ray Marching',
    key: 'ray-marching',
    init: initRayMarching,
  },
  { asset: FishGif, title: '3D Fish', key: '3d-fish', init: initFish },
  {
    asset: CausticsGif,
    title: 'Caustics',
    key: 'caustics',
    init: initCaustics,
  },
] as const;

export default function TgpuExamples() {
  return (
    <>
      <div className="mb-4 border border-accent-500 px-4 py-3 text-center text-sm sm:hidden dark:text-white">
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
              <span className="max-w-[70%] truncate font-medium text-sm">{item.title}</span>
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
              className="h-full w-full object-contain transition duration-300 ease-out"
            />

            <div
              data-hover-overlay
              className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 ease-out group-hover:pointer-events-auto group-hover:opacity-100 data-[active=true]:pointer-events-auto data-[active=true]:opacity-100"
            >
              <div className="pointer-events-auto h-full w-full backdrop-blur">
                <HoverExampleIsland exampleKey={item.key} html={item.html} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
