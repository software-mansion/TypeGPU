import { setupScene } from '../../examples/rendering/caustics/scene.ts';
import HoverExampleLive from './HoverExampleLive.tsx';

export default function Caustics() {
  return <HoverExampleLive setup={setupScene} />;
}
