import { setupScene } from '../../examples/rendering/ray-marching/scene.ts';
import HoverExampleLive from './HoverExampleLive.tsx';

export default function RayMarching() {
  return <HoverExampleLive setup={setupScene} />;
}
