const vertexCode = `@vertex fn fullscreen(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let positions = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  return vec4f(positions[i], 0, 1);
}`;

export async function createRenderer(
  canvas: HTMLCanvasElement,
  onError: (message: string) => void,
) {
  if (!navigator.gpu) throw new Error('This preview needs a browser with WebGPU support.');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter)
    throw new Error('No WebGPU adapter is available. Check that hardware acceleration is enabled.');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) {
    device.destroy();
    throw new Error('Could not create a WebGPU canvas.');
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  const uniform = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindingLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', minBindingSize: 48 },
      },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindingLayout] });
  const bindings = device.createBindGroup({
    layout: bindingLayout,
    entries: [{ binding: 0, resource: { buffer: uniform } }],
  });
  const vertex = device.createShaderModule({ code: vertexCode });
  let pipeline: GPURenderPipeline | undefined;
  let destroyed = false;
  let generation = 0;
  let animation = 0;
  let time = 0;
  let previous = performance.now();
  let paused = false;
  let yaw = 0.45;
  let pitch = 0.32;
  let radius = 6;
  const values = new Float32Array(12);
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(
      window.devicePixelRatio || 1,
      1.5,
      1000 / Math.max(rect.width, rect.height, 1),
    );
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  void device.lost.then((info) => {
    if (!destroyed)
      onError(`GPU device lost: ${info.message || info.reason}. Reload to reconnect.`);
  });
  device.addEventListener('uncapturederror', (event) => {
    if (!destroyed) onError(event.error.message);
  });

  const frame = (now: number) => {
    if (destroyed) return;
    if (!paused) time += Math.min((now - previous) / 1000, 0.1);
    previous = now;
    if (pipeline) {
      values[0] = canvas.width;
      values[1] = canvas.height;
      values[2] = time;
      values[4] = Math.sin(yaw) * Math.cos(pitch) * radius;
      values[5] = 0.85 + Math.sin(pitch) * radius;
      values[6] = Math.cos(yaw) * Math.cos(pitch) * radius;
      values[8] = 0;
      values[9] = 0.85;
      values[10] = 0;
      device.queue.writeBuffer(uniform, 0, values);
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0.1, g: 0.12, b: 0.18, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindings);
      pass.draw(3);
      pass.end();
      device.queue.submit([encoder.finish()]);
    }
    animation = requestAnimationFrame(frame);
  };
  animation = requestAnimationFrame(frame);

  return {
    async setShader(code: string) {
      const version = ++generation;
      device.pushErrorScope('validation');
      const shader = device.createShaderModule({ code });
      const validation = device.popErrorScope();
      const info = await shader.getCompilationInfo();
      const validationError = await validation;
      if (validationError) throw new Error(validationError.message);
      const errors = info.messages.filter((message) => message.type === 'error');
      if (errors.length)
        throw new Error(
          errors.map((message) => `Line ${message.lineNum}: ${message.message}`).join('\n'),
        );
      if (destroyed || version !== generation) return false;
      const next = await device.createRenderPipelineAsync({
        layout: pipelineLayout,
        vertex: { module: vertex, entryPoint: 'fullscreen' },
        fragment: { module: shader, entryPoint: 'sdfFragment', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      });
      if (destroyed || version !== generation) return false;
      pipeline = next;
      return true;
    },
    invalidate() {
      generation++;
    },
    setPaused(value: boolean) {
      paused = value;
    },
    orbit(dx: number, dy: number) {
      yaw -= dx * 0.007;
      pitch = Math.max(-0.05, Math.min(1.45, pitch + dy * 0.007));
    },
    zoom(delta: number) {
      radius = Math.max(1.6, Math.min(18, radius * Math.exp(delta * 0.001)));
    },
    reset() {
      yaw = 0.45;
      pitch = 0.32;
      radius = 6;
      time = 0;
    },
    destroy() {
      destroyed = true;
      generation++;
      cancelAnimationFrame(animation);
      observer.disconnect();
      uniform.destroy();
      context.unconfigure();
      device.destroy();
    },
  };
}
export type SceneRenderer = Awaited<ReturnType<typeof createRenderer>>;
