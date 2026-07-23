import { lazy } from 'react';
import { Root } from '@typegpu/react';

import CausticsThumbnail from '../../examples/rendering/caustics/thumbnail.png';
import RayMarchingThumbnail from '../../examples/rendering/ray-marching/thumbnail.png';
import JellySliderThumbnail from '../../examples/rendering/jelly-slider/thumbnail.png';
import FishThumbnail from '../../examples/rendering/3d-fish/thumbnail.png';
import CubemapReflectionThumbnail from '../../examples/rendering/cubemap-reflection/thumbnail.png';
import VaporRaveThumbnail from '../../examples/simple/vaporrave/thumbnail.png';
import HoverExampleIsland from './HoverExampleIsland.tsx';

const JellySlider = lazy(() => import('./JellySlider.tsx'));
const Fish = lazy(() => import('./Fish.tsx'));
const Vaporrave = lazy(() => import('./Vaporrave.tsx'));
const CubemapReflection = lazy(() => import('./CubemapReflection.tsx'));
const Caustics = lazy(() => import('./Caustics.tsx'));
const RayMarching = lazy(() => import('./RayMarching.tsx'));

const galleryItems = [
  {
    asset: JellySliderThumbnail,
    title: 'Jelly Slider',
    key: 'rendering--jelly-slider',
    liveComponent: JellySlider,
  },
  {
    asset: FishThumbnail,
    title: '3D Fish',
    key: 'rendering--3d-fish',
    liveComponent: Fish,
  },
  {
    asset: VaporRaveThumbnail,
    title: 'Vaporrave',
    key: 'simple--vaporrave',
    liveComponent: Vaporrave,
  },
  {
    asset: CubemapReflectionThumbnail,
    title: 'Cubemap Reflection',
    key: 'rendering--cubemap-reflection',
    liveComponent: CubemapReflection,
  },
  {
    asset: CausticsThumbnail,
    title: 'Caustics',
    key: 'rendering--caustics',
    liveComponent: Caustics,
  },
  {
    asset: RayMarchingThumbnail,
    title: 'Ray Marching',
    key: 'rendering--ray-marching',
    liveComponent: RayMarching,
  },
] as const;

export default function TgpuExamples() {
  return (
    <Root>
      <div className="border-accent-500 mb-4 border px-4 py-3 text-center text-sm sm:hidden dark:text-white">
        Hint: tap the example with two fingers to preview
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-2">
        {galleryItems.map((item) => {
          const LiveComponent = item.liveComponent;
          return (
            <HoverExampleIsland
              key={item.key}
              title={item.title}
              previewImageSrc={item.asset.src}
              exampleKey={item.key}
              liveComponent={<LiveComponent />}
            />
          );
        })}
      </div>
    </Root>
  );
}
