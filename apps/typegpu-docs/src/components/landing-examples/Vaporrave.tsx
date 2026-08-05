import { setupScene } from '../../examples/simple/vaporrave/scene.ts';
import HoverExampleLive from './HoverExampleLive.tsx';

export default function Vaporrave() {
  return <HoverExampleLive setup={setupScene} />;
}
