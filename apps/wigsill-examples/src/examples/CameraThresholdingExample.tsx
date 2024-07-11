import * as dat from 'dat.gui';
import { useExampleWithCanvas } from '../common/useExampleWithCanvas';
import { createRef, RefObject } from 'react';
import { f32, makeArena, ProgramBuilder, wgsl, WGSLRuntime } from 'wigsill';

function init(videoRef: RefObject<HTMLVideoElement>) {
  return async function (gui: dat.GUI, canvas: HTMLCanvasElement) {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();

    const thresholdData = wgsl.memory(f32).alias('threshold');

    const shaderCode = wgsl`
@group(0) @binding(0) var sampler_ : sampler;
@group(0) @binding(1) var videoTexture : texture_external;

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) fragUV : vec2f,
}

@vertex
fn vert_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
  const pos = array(
    vec2( 1.0,  1.0),
    vec2( 1.0, -1.0),
    vec2(-1.0, -1.0),
    vec2( 1.0,  1.0),
    vec2(-1.0, -1.0),
    vec2(-1.0,  1.0),
  );

  const uv = array(
    vec2(1.0, 0.0),
    vec2(1.0, 1.0),
    vec2(0.0, 1.0),
    vec2(1.0, 0.0),
    vec2(0.0, 1.0),
    vec2(0.0, 0.0),
  );

  var output : VertexOutput;
  output.Position = vec4(pos[VertexIndex], 0.0, 1.0);
  output.fragUV = uv[VertexIndex];
  return output;
}

@fragment
fn frag_main(@location(0) fragUV : vec2f) -> @location(0) vec4f {
  var color = textureSampleBaseClampToEdge(videoTexture, sampler_, fragUV);
  let grey = 0.299*color.r + 0.587*color.g + 0.114*color.b;

  if grey < ${thresholdData} {
    return vec4f(0, 0, 0, 1);
  }
  return vec4f(1);
}
`;

    if (navigator.mediaDevices.getUserMedia && videoRef.current) {
      videoRef.current.srcObject = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
    }

    const context = canvas.getContext('webgpu') as GPUCanvasContext;
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
      device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
    });

    const runtime = new WGSLRuntime(device);

    const arena = makeArena({
      bufferBindingType: 'uniform',
      memoryEntries: [thresholdData],
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });

    const program = new ProgramBuilder(runtime, shaderCode).build({
      bindingGroup: 1,
      shaderStage: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      arenas: [arena],
    });

    const shaderModule = device.createShaderModule({
      code: program.code,
    });

    const layout = device.createPipelineLayout({
      bindGroupLayouts: [
        device.createBindGroupLayout({
          entries: [
            {
              binding: 0,
              visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
              sampler: {},
            },
            {
              binding: 1,
              visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
              externalTexture: {},
            },
          ],
        }),
        program.bindGroupLayout,
      ],
    });

    const renderPipeline = device.createRenderPipeline({
      layout: layout,
      vertex: {
        module: shaderModule,
      },
      fragment: {
        module: shaderModule,
        targets: [
          {
            format: presentationFormat,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    const defaultThreshold = 0.4;

    thresholdData.write(runtime, defaultThreshold);

    // UI

    const state = {
      threshold: defaultThreshold,
    };

    gui.add(state, 'threshold', 0, 1, 0.1).onChange(() => {
      thresholdData.write(runtime, state.threshold);
    });

    let running = true;

    function frame() {
      if (!(videoRef.current && videoRef.current.currentTime > 0)) {
        if (running) {
          requestAnimationFrame(frame);
        }
        return;
      }

      const resultTexture = device.importExternalTexture({
        source: videoRef.current,
      });

      const bindGroup = device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: sampler,
          },
          {
            binding: 1,
            resource: resultTexture,
          },
        ],
      });

      const commandEncoder = device.createCommandEncoder();

      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: [0, 0, 0, 1],
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });

      passEncoder.setPipeline(renderPipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.setBindGroup(1, program.bindGroup);
      passEncoder.draw(6);
      passEncoder.end();
      device.queue.submit([commandEncoder.finish()]);

      if (running) {
        requestAnimationFrame(frame);
      }
    }

    requestAnimationFrame(frame);

    return {
      dispose() {
        running = false;
      },
    };
  };
}

export function CameraThresholdingExample() {
  const videoRef: RefObject<HTMLVideoElement> = createRef();
  const canvasRef = useExampleWithCanvas(init(videoRef));
  const [width, height] = [500, 375];

  return (
    <div className="flex flex-wrap h-screen p-4 gap-4 justify-center items-center">
      <div className="p-4 border-4 border-slate-400 rounded-lg">
        <video
          ref={videoRef}
          autoPlay={true}
          id="camera-view"
          width={width}
          height={height}></video>
      </div>

      <div className="p-4 border-4 border-slate-400 rounded-lg">
        <canvas width={width} height={height} ref={canvasRef}></canvas>
      </div>
    </div>
  );
}
