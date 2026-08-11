import { setupScene } from '../../examples/rendering/3d-fish/scene.ts';
import HoverExampleLive from './HoverExampleLive.tsx';

export default function Fish() {
  return <HoverExampleLive setup={setupScene} />;
}
