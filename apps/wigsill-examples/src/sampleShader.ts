import { wgsl } from 'wigsill';

const factor = wgsl.slot(10);

const multiply = wgsl.fn()`() -> {
  return 12 * ${factor};
}`;

export const sampleShader = wgsl`
fn add(a: f32, b: f32) -> f32 {
  ${multiply.with(factor, 12)}();
  ${multiply.with(factor, 16)}();

  return a + ${wgsl.constant('123 + 5')};
}
`;
