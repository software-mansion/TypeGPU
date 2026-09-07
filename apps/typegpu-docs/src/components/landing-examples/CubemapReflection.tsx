import { setupScene } from '../../examples/rendering/cubemap-reflection/scene.ts';
import HoverExampleLive from './HoverExampleLive.tsx';

export default function CubemapReflection() {
  return <HoverExampleLive setup={setupScene} />;
}
