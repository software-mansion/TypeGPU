export const DEFAULT_WGSL = `@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
  let pos = array<vec2<f32>, 3>(
    vec2<f32>(-0.5, -0.5),
    vec2<f32>( 0.5, -0.5),
    vec2<f32>( 0.0,  0.5)
  );
  return vec4<f32>(pos[vertex_index], 0.0, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
  return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}`;

export const LANGUAGE_MAP: Record<string, string> = {
  wgsl: 'wgsl',
  glsl: 'cpp',
  hlsl: 'cpp',
  metal: 'cpp',
  spirv: 'plaintext',
  'spirv-asm': 'plaintext',
};

export const commonEditorOptions = {
  minimap: { enabled: false },
  fontSize: 14,
  fontFamily: 'Monaco, "Cascadia Code", "Roboto Mono", monospace',
  wordWrap: 'off' as const,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  renderWhitespace: 'selection' as const,
  lineNumbers: 'on' as const,
  folding: true,
  bracketPairColorization: { enabled: true },
} as const;
