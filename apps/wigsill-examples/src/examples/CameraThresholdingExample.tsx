import * as dat from 'dat.gui';
import { useExampleWithCanvas } from '../common/useExampleWithCanvas';
import { createRef, RefObject, useMemo } from 'react';

function init(videoRef: RefObject<HTMLVideoElement>) {
  return async function (gui: dat.GUI, canvas: HTMLCanvasElement) {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();

    const shaderCode = `
@group(0) @binding(0) var mySampler : sampler;
@group(0) @binding(1) var myTexture : texture_2d<f32>;
@group(0) @binding(2) var<uniform> threshold : f32;

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
  var color = textureSample(myTexture, mySampler, fragUV);
  let grey = 0.299*color.r + 0.587*color.g + 0.114*color.b;

  if grey < threshold {
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
    const video = videoRef.current!;
    await Promise.race([
      new Promise<void>((resolve) => {
        video.onloadeddata = () => {
          resolve();
        };
      }),
      // or timeout after 100 ms
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);

    canvas.height = video.clientHeight;

    const context = canvas.getContext('webgpu') as GPUCanvasContext;
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
      device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
    });

    const renderPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({
          code: shaderCode,
        }),
      },
      fragment: {
        module: device.createShaderModule({
          code: shaderCode,
        }),
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

    const paramsBuffer = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });

    const defaultThreshold = 0.4;
    device.queue.writeBuffer(
      paramsBuffer,
      0,
      new Float32Array([defaultThreshold]),
    );

    const resultTexture = device.createTexture({
      size: [video.videoWidth, video.videoHeight, 1],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
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
          resource: resultTexture.createView(),
        },
        {
          binding: 2,
          resource: {
            buffer: paramsBuffer,
          },
        },
      ],
    });

    // UI

    const state = {
      threshold: defaultThreshold,
    };

    gui.add(state, 'threshold', 0, 1, 0.1).onChange(() => {
      device.queue.writeBuffer(
        paramsBuffer,
        0,
        new Float32Array([state.threshold]),
      );
    });

    let animationFrameHandle = 0;

    function frame() {
      const commandEncoder = device.createCommandEncoder();

      if (videoRef.current && videoRef.current.currentTime > 0) {
        device.queue.copyExternalImageToTexture(
          { source: videoRef.current },
          { texture: resultTexture },
          [canvas.width, canvas.height],
        );
      }

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
      passEncoder.draw(6);
      passEncoder.end();
      device.queue.submit([commandEncoder.finish()]);

      animationFrameHandle = requestAnimationFrame(frame);
    }

    frame();

    return {
      dispose() {
        cancelAnimationFrame(animationFrameHandle);
      },
    };
  };
}

export function CameraThresholdingExample() {
  const videoRef: RefObject<HTMLVideoElement> = createRef();
  const innerInit = useMemo(() => init(videoRef), [videoRef]);
  const canvasRef = useExampleWithCanvas(innerInit);

  return (
    <div className="flex flex-wrap h-screen p-4 gap-4 justify-center items-center">
      <div className="p-4 border-4 border-slate-400 rounded-lg">
        <video
          ref={videoRef}
          autoPlay={true}
          id="camera-view"
          width={500}></video>
      </div>

      <div className="p-4 border-4 border-slate-400 rounded-lg">
        <canvas width={500} ref={canvasRef}></canvas>
      </div>
    </div>
  );
}
