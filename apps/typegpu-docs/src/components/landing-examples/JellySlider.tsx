import { setupScene } from '../../examples/rendering/jelly-slider/scene.ts';
import HoverExampleLive from './HoverExampleLive.tsx';

export default function JellySlider() {
  return (
    <HoverExampleLive
      setup={async (root, context) => {
        const scene = await setupScene(root, context);
        scene.qualityScale = await scene.computeOptimalQuality();

        return { onCleanup: scene.onCleanup };
      }}
    />
  );
}
