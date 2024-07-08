import { wgsl } from 'wigsill';

export const sampleShader = wgsl`
fn add(a: f32, b: f32) -> f32 {
  return a + ${wgsl.constant('123 + 5')};
}
`;
