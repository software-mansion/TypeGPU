import type { ImageMetadata } from 'astro';
import BoneTideImage from '../../assets/showcase/bone-tide.webp';
import DStanceImage from '../../assets/showcase/d-stance.webp';
import DiffusionStudioImage from '../../assets/showcase/diffusion-studio.webp';
import LittleGiantImage from '../../assets/showcase/little-giant.webp';
import LumenApeironImage from '../../assets/showcase/lumen-apeiron.webp';
import LuxscuraImage from '../../assets/showcase/luxscura.webp';
import PurrkourImage from '../../assets/showcase/purrkour.webp';
import ReactNativeShineImage from '../../assets/showcase/react-native-shine.webp';
import RedrawImage from '../../assets/showcase/redraw.webp';
import RunntimeImage from '../../assets/showcase/runntime.webp';
import ScreenStudioImage from '../../assets/showcase/screen-studio.webp';
import ShadercnImage from '../../assets/showcase/shadercn.webp';
import ShadersImage from '../../assets/showcase/shaders.webp';
import TypegpuConfettiImage from '../../assets/showcase/typegpu-confetti.webp';
import VivariumImage from '../../assets/showcase/vivarium.webp';

export interface ShowcaseLink {
  label: string;
  href: string;
}

export interface ShowcaseProject {
  key: string;
  name: string;
  /** Who made it — a person, a team or a company. */
  author: string;
  description: string;
  /** The first link is the primary one, the banner links to it too. */
  links: ShowcaseLink[];
  /** Shown in the banner and as the thumbnail. Projects without one get a generated cover. */
  image?: ImageMetadata;
  /**
   * How the image fills the banner. `cover` (the default) crops it to fill the whole banner,
   * `contain` shows all of it, leaving bars on the sides that don't fit. Thumbnails always cover.
   */
  bannerFit?: 'cover' | 'contain';
  /** Optional muted, looping clip shown in the banner instead of the image. */
  video?: string;
}

export interface ShowcaseCategory {
  key: string;
  title: string;
  description: string;
  projects: ShowcaseProject[];
}

export const showcaseCategories: ShowcaseCategory[] = [
  {
    key: 'apps',
    title: 'Apps',
    description:
      'Products and creative apps that bring TypeGPU into their interfaces and GPU-driven features.',
    projects: [
      {
        key: 'screen-studio',
        name: 'Screen Studio',
        author: 'Screen Studio',
        description:
          'A macOS screen recorder with automatic zoom and smooth animations, for product demos, tutorials and social media videos.',
        image: ScreenStudioImage,
        bannerFit: 'contain',
        links: [{ label: 'Visit website', href: 'https://screen.studio/' }],
      },
      {
        key: 'lumen-apeiron',
        name: 'Lumen Apeiron',
        author: 'deluksic & Komediruzecki',
        description:
          'A free, GPU-accelerated editor for creating, exploring and animating IFS fractal flames in real time, running entirely in the browser.',
        image: LumenApeironImage,
        bannerFit: 'contain',
        links: [{ label: 'Open the editor', href: 'https://lumenapeiron.com/' }],
      },
      {
        key: 'diffusion-studio',
        name: 'Diffusion Studio',
        author: 'Diffusion Studio',
        description:
          'An open-source video editor built for AI agents, where compositions are code. It analyzes frames on the GPU with TypeGPU, and lets you write TypeGPU shaders for your own effects.',
        image: DiffusionStudioImage,
        bannerFit: 'contain',
        links: [
          { label: 'Open the editor', href: 'https://app.diffusion.studio/' },
          { label: 'Visit website', href: 'https://diffusion.studio/' },
          { label: 'GitHub', href: 'https://github.com/diffusionstudio/editor' },
        ],
      },
      {
        key: 'appjs-conf',
        name: 'App.js Conf',
        author: 'Software Mansion',
        description:
          'The official app of the App.js Conference, with an interactive 3D map of the venue rendered with TypeGPU.',
        links: [{ label: 'App Store', href: 'https://apps.apple.com/app/id6447059416' }],
      },
      {
        key: '3d-scanner',
        name: 'On-device 3D Scanner',
        author: 'Norbert Klockiewicz',
        description:
          'Take 8 photos with your phone and get a 3D scan in about 3 seconds, without leaving the device. Depth Anything 3 does the reconstruction, and TypeGPU renders the result as Gaussian splats.',
        links: [
          {
            label: 'View on GitHub',
            href: 'https://github.com/NorbertKlockiewicz/on-device-3d-scanner',
          },
        ],
      },
    ],
  },
  {
    key: 'games',
    title: 'Games & Experiences',
    description:
      'Games and interactive experiences, with their rendering and logic written in TypeScript, running on the web and in app stores.',
    projects: [
      {
        key: 'bone-tide',
        name: 'Bone Tide',
        author: 'Konrad Reczko',
        description:
          'A horde survival game written from scratch, with both its game logic and shaders in TypeScript. The mobile app runs the exact same TypeGPU engine as the web version.',
        image: BoneTideImage,
        links: [
          { label: 'Play on the web', href: 'https://reczkok.github.io/typegpu-adventure/' },
          {
            label: 'App Store',
            href: 'https://apps.apple.com/pl/app/bone-tide-horde-survival/id6791994827',
          },
          {
            label: 'Google Play',
            href: 'https://play.google.com/store/apps/details?id=com.swmansion.bonetide',
          },
        ],
      },
      {
        key: 'purrkour',
        name: 'Purrkour',
        author: 'Błażej Kustra',
        description:
          'A cozy puzzle game in which you help cats jump across compact living rooms and find their way into boxes.',
        image: PurrkourImage,
        links: [
          { label: 'Play on the web', href: 'https://blazejkustra.github.io/purrkour/' },
          {
            label: 'App Store',
            href: 'https://apps.apple.com/pl/app/purrkour-cat-puzzle-game/id6793995936',
          },
        ],
      },
      {
        key: 'little-giant',
        name: 'Little Giant: Ninh Bình',
        author: 'VGANG',
        description:
          'A 3D action RPG in React Native, with no game engine and no native code. Every one of its Blender materials is compiled into a TypeGPU shader.',
        image: LittleGiantImage,
        links: [
          {
            label: 'View on GitHub',
            href: 'https://github.com/vietgangzz/vg-battle-webgpu/tree/game',
          },
        ],
      },
    ],
  },
  {
    key: 'tools',
    title: 'Tools',
    description: 'Libraries, editors and building blocks for other developers, built on TypeGPU.',
    projects: [
      {
        key: 'shaders',
        name: 'Shaders.com',
        author: 'Shaders',
        description:
          'Open-source WebGPU shader components for every major framework, plus an editor to compose them. Its v3 engine is built on TypeGPU.',
        image: ShadersImage,
        links: [
          { label: 'Visit website', href: 'https://shaders.com/' },
          {
            label: 'Introducing Shaders v3',
            href: 'https://shaders.com/updates/introducing-shaders-v3',
          },
        ],
      },
      {
        key: 'redraw',
        name: 'Redraw',
        author: 'William Candillon',
        description:
          'A 2D graphics library built on top of WebGPU, with support for vector feathering and advanced vector-based effects.',
        image: RedrawImage,
        links: [{ label: 'Visit website', href: 'https://wcandillon.github.io/redraw/' }],
      },
      {
        key: 'runntime',
        name: 'ruNNtime',
        author: 'Software Mansion',
        description:
          'A framework for running AI models in the browser and other WebGPU environments, with ready-to-use models for text embeddings, speech to text and computer vision. Its kernels are written in TypeGPU.',
        image: RunntimeImage,
        links: [
          {
            label: 'Get started',
            href: 'https://docs.swmansion.com/runntime/zoo/getting-started/',
          },
        ],
      },
      {
        key: 'shadercn',
        name: 'shadercn',
        author: 'shadcn-labs',
        description:
          'Shader components you copy and paste into your project, in the spirit of shadcn/ui. Their props are typed with TypeGPU.',
        image: ShadercnImage,
        bannerFit: 'contain',
        links: [
          { label: 'Visit website', href: 'https://shadercn.run/' },
          { label: 'GitHub', href: 'https://github.com/shadcn-labs/shadercn' },
        ],
      },
      {
        key: 'luxscura',
        name: 'Luxscura',
        author: 'Alex Wayne',
        description:
          'A ray marching renderer for TypeGPU apps. You describe shapes as signed distance functions, pick a camera and an appearance, and it handles the rest.',
        image: LuxscuraImage,
        bannerFit: 'contain',
        links: [
          { label: 'Visit website', href: 'https://alexjwayne.github.io/luxscura/' },
          { label: 'GitHub', href: 'https://github.com/AlexJWayne/luxscura' },
        ],
      },
      {
        key: 'd-stance',
        name: 'd-stance',
        author: 'collectioneur',
        description:
          'A browser-based 3D editor for modeling with signed distance functions, which exports your shapes as ready-to-use TypeGPU, WGSL or GLSL code.',
        image: DStanceImage,
        links: [
          { label: 'Open the editor', href: 'https://collectioneur.github.io/d-stance/' },
          { label: 'GitHub', href: 'https://github.com/collectioneur/d-stance' },
        ],
      },
      {
        key: 'glyph',
        name: 'Glyph',
        author: 'Poimandres',
        description:
          'A typography engine for web graphics, handling font baking, Unicode shaping and paragraph layout, with experimental TypeGPU renderers.',
        links: [{ label: 'View on GitHub', href: 'https://github.com/pmndrs/glyph' }],
      },
      {
        key: 'shallot',
        name: 'Shallot',
        author: 'Dylan Ebert',
        description:
          'A WebGPU game engine built around an entity component system and declarative scenes. Its shaders are written in TypeScript with TypeGPU.',
        links: [
          { label: 'See the demos', href: 'https://dylanebert.com/shallot/' },
          { label: 'GitHub', href: 'https://github.com/dylanebert/shallot' },
        ],
      },
      {
        key: 'typegpu-confetti',
        name: 'typegpu-confetti',
        author: 'Software Mansion',
        description:
          'Customizable confetti for React and React Native, simulated and rendered entirely on the GPU.',
        image: TypegpuConfettiImage,
        links: [
          {
            label: 'View on GitHub',
            href: 'https://github.com/software-mansion-labs/typegpu-confetti',
          },
        ],
      },
      {
        key: 'react-native-shine',
        name: 'react-native-shine',
        author: 'Software Mansion',
        description:
          'Holographic and shine effects for React Native, which react to the tilt of the device.',
        image: ReactNativeShineImage,
        links: [
          {
            label: 'View on GitHub',
            href: 'https://github.com/software-mansion-labs/react-native-shine',
          },
        ],
      },
      {
        key: 'vivarium',
        name: 'Vivarium',
        author: 'WonderYard',
        description:
          'A WebGPU toolkit for creating your own cellular automata, with rules that read almost like plain English.',
        image: VivariumImage,
        links: [
          { label: 'Visit website', href: 'https://vivarium.orangenote.dev/' },
          { label: 'See the demos', href: 'https://vivarium-demo.netlify.app/' },
        ],
      },
    ],
  },
];
