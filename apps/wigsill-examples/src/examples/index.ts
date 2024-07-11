import { CameraThresholdingExample } from './CameraThresholdingExample';
import { GradientTilesExample } from './GradientTilesExample';
import { FluidSimExample } from './FluidSimExample';

export const examples = {
  'gradient-tiles': {
    label: 'Gradient tiles',
    component: GradientTilesExample,
  },
  'camera-thresholding': {
    label: 'Camera thresholding',
    component: CameraThresholdingExample,
  },
  'fluid-simulation': {
    label: 'Fluid simulation',
    component: () => FluidSimExample(),
  },
};
