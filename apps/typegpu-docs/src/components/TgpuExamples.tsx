import ExternalOpenSvg from '../assets/externalopen.svg';
import CausticsGif from '../assets/hero/caustics_bg.webp';
import RayMarchingGif from '../assets/hero/rayMarch_bg.webp';
import JellySliderGif from '../assets/hero/jellySlider_bg.jpg';
import FishGif from '../assets/hero/fish_bg.webp';
import ReflectionGif from '../assets/hero/reflection_bg.jpg';
import vaporRaveGif from '../assets/hero/rave_bg.webp';

import HoverExampleIsland from './HoverExampleIsland';
import fishHtml from '../pages/landing-examples/3d-fish/index.html?raw';
import causticsHtml from '../pages/landing-examples/caustics/index.html?raw';
import reflectionHtml from '../pages/landing-examples/cubemap-reflection/index.html?raw';
import jellyHtml from '../pages/landing-examples/jelly-slider/index.html?raw';
import rayMarchingHtml from '../pages/landing-examples/ray-marching/index.html?raw';
import vaporRaveHtml from '../pages/landing-examples/vaporrave/index.html?raw';

const examplesBasePath = '../pages/landing-examples';

const galleryItems = [
    {
        asset: ReflectionGif,
        title: 'Reflection',
        exampleKey: 'cubemap-reflection',
        html: reflectionHtml,
    },
    {
        asset: JellySliderGif,
        title: 'Jelly Slider',
        exampleKey: 'jelly-slider',
        html: jellyHtml,
    },
    {
        asset: vaporRaveGif,
        title: 'VaporRave',
        exampleKey: 'vaporrave',
        html: vaporRaveHtml,
    },
    {
        asset: RayMarchingGif,
        title: 'Ray Marching',
        exampleKey: 'ray-marching',
        html: rayMarchingHtml,
    },
    {
        asset: FishGif,
        title: '3D Fish',
        exampleKey: '3d-fish',
        html: fishHtml,
    },
    {
        asset: CausticsGif,
        title: 'Caustics',
        exampleKey: 'caustics',
        html: causticsHtml,
    },
];

const examplesConfig = Object.fromEntries(
    galleryItems.map((item) => [
        item.exampleKey,
        { html: item.html, tsPath: `${examplesBasePath}/${item.exampleKey}/index.ts` },
    ]),
);

export default function TgpuExamples() {
    return (
        <>
            {/* Interactive gallery */}
            <div className="sm:hidden mb-4 px-4 py-3 border dark:text-white border-accent-500 text-sm text-center">
                Hint: tap the example with two fingers to preview
            </div>
            <div className="gap-6 grid sm:grid-cols-2 xl:grid-cols-2">
                {galleryItems.map((item) => (
                    <div
                        key={item.exampleKey}
                        className="group relative aspect-square overflow-hidden"
                        data-example-card
                        style={{ touchAction: 'pan-x pan-y' }}
                    >
                        <a
                            href={`/TypeGPU/examples/#example=${item.exampleKey}`}
                            className="bottom-6 no-underline inset-x-6 px-4 z-10 absolute flex items-center justify-between gap-3 bg-white h-16 text-blue-900"
                        >
                            <span className="truncate font-medium text-sm max-w-[70%]">
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
                            alt="TypeGPU Example"
                            className="w-full h-full object-contain transition duration-300 ease-out"
                        />

                        <div
                            data-hover-overlay
                            className="absolute inset-0 flex justify-center items-center opacity-0 pointer-events-none transition duration-300 ease-out group-hover:opacity-100 group-hover:pointer-events-auto data-[active=true]:opacity-100 data-[active=true]:pointer-events-auto"
                        >
                            <div className="backdrop-blur w-full h-full pointer-events-auto">
                                <HoverExampleIsland
                                    exampleKey={item.exampleKey}
                                    examplesConfig={examplesConfig}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}
