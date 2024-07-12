/*
{
  "title": "Fluid Simulation"
}
*/

import { addElement, addParameter, onFrame } from '@wigsill/example-toolkit';
import { WGSLRuntime, wgsl, u32, ProgramBuilder, makeArena, arrayOf } from 'wigsill';

const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();
const runtime = new WGSLRuntime(device);

const canvas = await addElement('canvas', { width: 500, height: 500 });

const context = canvas.getContext('webgpu');
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
});
canvas.addEventListener('contextmenu', event => {
    if (event.target === canvas) {
        event.preventDefault();
    }
});

const Options = {
    size: 64,
    timestep: 25,
    stepsPerTimestep: 1,
    workgroupSize: 16,
    viscosity: 255,
    brushSize: 0,
    brushType: 'water',
};

const viscosity = wgsl.memory(u32).alias('viscosity');
const maxWaterLevelUnpressurized = wgsl.constant(wgsl`255u`);
const maxWaterLevel = wgsl.constant(wgsl`(1u << 24) - 1u`);
const maxCompress = wgsl.constant(wgsl`12u`);

const computeWGSL = wgsl`
@binding(0) @group(0) var<storage, read> size: vec2u;
@binding(1) @group(0) var<storage, read> current: array<u32>;
@binding(2) @group(0) var<storage, read_write> next: array<atomic<u32>>;
@binding(3) @group(0) var<storage, read_write> debugInfo: atomic<u32>;

override blockSize = 8;

fn getIndex(x: u32, y: u32) -> u32 {
    let h = size.y;
    let w = size.x;
    return (y % h) * w + (x % w);
}

fn getCell(x: u32, y: u32) -> u32 {
    return current[getIndex(x, y)];
}

fn getCellNext(x: u32, y: u32) -> u32 {
    let val = atomicLoad(&next[getIndex(x, y)]);
    return val;
}

fn updateCell(x: u32, y: u32, value: u32) {
    atomicStore(&next[getIndex(x, y)], value);
}

fn addToCell(x: u32, y: u32, value: u32) {
    let cell = getCellNext(x, y);
    let waterLevel = cell & ${maxWaterLevel};
    let newWaterLevel = min(waterLevel + value, ${maxWaterLevel});
    atomicAdd(&next[getIndex(x, y)], newWaterLevel - waterLevel);
}

fn subtractFromCell(x: u32, y: u32, value: u32) {
    let cell = getCellNext(x, y);
    let waterLevel = cell & ${maxWaterLevel};
    let newWaterLevel = max(waterLevel - min(value, waterLevel), 0u);
    atomicSub(&next[getIndex(x, y)], waterLevel - newWaterLevel);
}

fn persistFlags(x: u32, y: u32) {
    let cell = getCell(x, y);
    let waterLevel = cell & ${maxWaterLevel};
    let flags = cell >> 24;
    updateCell(x, y, (flags << 24) | waterLevel);
}

fn getStableStateBelow(upper: u32, lower: u32) -> u32 {
    let totalMass = upper + lower;
    if (totalMass <= ${maxWaterLevelUnpressurized}) {
        return totalMass;
    } else if (totalMass >= ${maxWaterLevelUnpressurized}*2 && upper > lower) {
        return totalMass/2 + ${maxCompress};
    }
    return ${maxWaterLevelUnpressurized};
}

fn isWall(x: u32, y: u32) -> bool {
    return (getCell(x, y) >> 24) == 1u;
}

fn isWaterSource(x: u32, y: u32) -> bool {
    return (getCell(x, y) >> 24) == 2u;
}

fn isWaterDrain(x: u32, y: u32) -> bool {
    return (getCell(x, y) >> 24) == 3u;
}

fn isClearCell(x: u32, y: u32) -> bool {
    return (getCell(x, y) >> 24) == 4u;
}

fn getWaterLevel(x: u32, y: u32) -> u32 {
    return getCell(x, y) & ${maxWaterLevel};
}

fn decideWaterLevel(x: u32, y: u32) {
    if (isClearCell(x, y)) {
        updateCell(x, y, 0u);
        return;
    }
    if (isWall(x, y)) {
        persistFlags(x, y);
        return;
    }
    if (isWaterSource(x, y)) {
        persistFlags(x, y);
        addToCell(x, y, 10u);
    }
    if (isWaterDrain(x, y)) {
        persistFlags(x, y);
        updateCell(x, y, 3u << 24);
        return;
    }
    if (y == 0 || y == size.y - 1u || x == 0 || x == size.x - 1u) {
        updateCell(x, y, 0u);
        return;
    }

    var remainingWater: u32 = getWaterLevel(x, y);

    if (remainingWater == 0u) {return;};

    if (!isWall(x, y - 1u)) {
        let waterLevelBelow = getWaterLevel(x, y - 1u);
        let stable = getStableStateBelow(remainingWater, waterLevelBelow);
        if (waterLevelBelow < stable) {
            let change = stable - waterLevelBelow;
            let flow = min(change, ${viscosity});
            subtractFromCell(x, y, flow);
            addToCell(x, y - 1u, flow);
            remainingWater -= flow;
        }
    }

    if (remainingWater == 0u) {return;};

    let waterLevelBefore = remainingWater;
    if (!isWall(x - 1u, y)) {
        let flowRaw = (i32(waterLevelBefore) - i32(getWaterLevel(x - 1u, y)));
        if (flowRaw > 0) {
            let change = max(min(4u, remainingWater), u32(flowRaw)/4);
            let flow = min(change, ${viscosity});
            subtractFromCell(x, y, flow);
            addToCell(x - 1u, y, flow);
            remainingWater -= flow;
        }
    }

    if (remainingWater == 0u) {return;};

    if (!isWall(x + 1u, y)) {
        let flowRaw = (i32(waterLevelBefore) - i32(getWaterLevel(x + 1, y)));
        if (flowRaw > 0) {
            let change = max(min(4u, remainingWater), u32(flowRaw)/4);
            let flow = min(change, ${viscosity});
            subtractFromCell(x, y, flow);
            addToCell(x + 1u, y, flow);
            remainingWater -= flow;
        } 
    }

    if (remainingWater == 0u) {return;};

    if (!isWall(x, y + 1u)) {
        let stable = getStableStateBelow(getWaterLevel(x, y + 1u), remainingWater);
        if (stable < remainingWater) {
            let flow = min(remainingWater - stable, ${viscosity});
            subtractFromCell(x, y, flow);
            addToCell(x, y + 1u, flow);
            remainingWater -= flow;
        }
    }
}

@compute @workgroup_size(blockSize, blockSize)
fn main(@builtin(global_invocation_id) grid: vec3u) {
    let x = grid.x;
    let y = grid.y;
    atomicAdd(&debugInfo, getWaterLevel(x, y));
    decideWaterLevel(x, y);
} 
`;

const vertWGSL = `
struct Out {
    @builtin(position) pos: vec4f,
    @location(0) cell: f32,
}

@binding(0) @group(0) var<uniform> size: vec2u;

@vertex
fn main(@builtin(instance_index) i: u32, @location(0) cell: u32, @location(1) pos: vec2u) -> Out {
    let w = size.x;
    let h = size.y;
    let x = (f32(i % w + pos.x) / f32(w) - 0.5) * 2. * f32(w) / f32(max(w, h));
    let y = (f32((i - (i % w)) / w + pos.y) / f32(h) - 0.5) * 2. * f32(h) / f32(max(w, h));
    let cellFlags = cell >> 24;
    let cellVal = f32(cell & 0xFFFFFF);
    if (cellFlags == 1u) {
        return Out(vec4f(x, y, 0., 1.), -1.);
    }
    if (cellFlags == 2u) {
        return Out(vec4f(x, y, 0., 1.), -2.);
    }
    if (cellFlags == 3u) {
        return Out(vec4f(x, y, 0., 1.), -3.);
    }

    return Out(vec4f(x, y, 0., 1.), cellVal);
}
`;

const fragWGSL = `
@fragment
fn main(@location(0) cell: f32) -> @location(0) vec4f {
    if (cell == -1.) {
        return vec4f(0.5, 0.5, 0.5, 1.);
    }
    if (cell == -2.) {
        return vec4f(0., 1., 0., 1.);
    }
    if (cell == -3.) {
        return vec4f(1., 0., 0., 1.);
    }
    var r = f32((u32(cell) >> 16) & 0xFF)/255.;
    var g = f32((u32(cell) >> 8) & 0xFF)/255.;
    var b = f32(u32(cell) & 0xFF)/255.;
    if (r > 0.) { g = 1.;}
    if (g > 0.) { b = 1.;}
    if (b > 0. && b < 0.2) { b = 0.2;}
    return vec4f(r, g, b, 1.);
}
`;

let drawCanvasData = new Uint32Array(Options.size * Options.size);

const viscosityArena = makeArena({
    bufferBindingType: 'uniform',
    memoryEntries: [viscosity],
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
});

const computeProgram = new ProgramBuilder(runtime, computeWGSL).build({
    bindingGroup: 1,
    shaderStage: GPUShaderStage.COMPUTE,
    arenas: [viscosityArena],
});

const computeShader = device.createShaderModule({ code: computeProgram.code });
const bindGroupLayoutCompute = device.createBindGroupLayout({
    entries: [
        {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
                type: "read-only-storage",
            },
        },
        {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
                type: "read-only-storage",
            },
        },
        {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
                type: "storage",
            },
        },
        {
            binding: 3,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
                type: "storage",
            },
        },
    ],
});

const squareVertices = new Uint32Array([0, 0, 0, 1, 1, 0, 1, 1]);
const squareBuffer = device.createBuffer({
    size: squareVertices.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
});
new Uint32Array(squareBuffer.getMappedRange()).set(squareVertices);
squareBuffer.unmap();

const squareStride = {
    arrayStride: 2 * squareVertices.BYTES_PER_ELEMENT,
    stepMode: "vertex",
    attributes: [
        {
            shaderLocation: 1,
            offset: 0,
            format: "uint32x2",
        },
    ],
};

const vertexShader = device.createShaderModule({ code: vertWGSL });
const fragmentShader = device.createShaderModule({ code: fragWGSL });
let commandEncoder;

const bindGroupLayoutRender = device.createBindGroupLayout({
    entries: [
        {
            binding: 0,
            visibility: GPUShaderStage.VERTEX,
            buffer: {
                type: "uniform",
            },
        },
    ],
});

const cellsStride = {
    arrayStride: Uint32Array.BYTES_PER_ELEMENT,
    stepMode: "instance",
    attributes: [
        {
            shaderLocation: 0,
            offset: 0,
            format: "uint32",
        },
    ],
};

let wholeTime = 0,
    buffer0,
    buffer1;
let render;
let readDebugInfo;
let applyDrawCanvas;
let changeViscosity;
let renderChanges;

function resetGameData() {
    drawCanvasData = new Uint32Array(Options.size * Options.size);

    const computePipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayoutCompute, computeProgram.bindGroupLayout],
        }),
        compute: {
            module: computeShader,
            constants: {
                blockSize: Options.workgroupSize,
            },
        },
    });

    const debugInfoBuffer = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    const debugReadBuffer = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const sizeBuffer = device.createBuffer({
        size: 2 * Uint32Array.BYTES_PER_ELEMENT,
        usage:
            GPUBufferUsage.STORAGE |
            GPUBufferUsage.UNIFORM |
            GPUBufferUsage.COPY_DST |
            GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    new Uint32Array(sizeBuffer.getMappedRange()).set([
        Options.size,
        Options.size,
    ]);
    sizeBuffer.unmap();

    const length = Options.size * Options.size;
    const cells = new Uint32Array(length);

    buffer0 = device.createBuffer({
        size: cells.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Uint32Array(buffer0.getMappedRange()).set(cells);
    buffer0.unmap();

    buffer1 = device.createBuffer({
        size: cells.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC,
    });

    const bindGroup0 = device.createBindGroup({
        layout: bindGroupLayoutCompute,
        entries: [
            { binding: 0, resource: { buffer: sizeBuffer } },
            { binding: 1, resource: { buffer: buffer0 } },
            { binding: 2, resource: { buffer: buffer1 } },
            { binding: 3, resource: { buffer: debugInfoBuffer } },
        ],
    });

    const renderPipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayoutRender],
        }),
        primitive: {
            topology: "triangle-strip",
        },
        vertex: {
            module: vertexShader,
            buffers: [cellsStride, squareStride],
        },
        fragment: {
            module: fragmentShader,
            targets: [
                {
                    format: presentationFormat,
                },
            ],
        },
    });

    const uniformBindGroup = device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: sizeBuffer,
                    offset: 0,
                    size: 2 * Uint32Array.BYTES_PER_ELEMENT,
                },
            },
        ],
    });

    render = () => {
        device.queue.writeBuffer(
            debugInfoBuffer,
            0,
            new Uint32Array([0]),
            0,
            1,
        );
        const view = context.getCurrentTexture().createView();
        const renderPass = {
            colorAttachments: [
                {
                    view,
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        };
        commandEncoder = device.createCommandEncoder();

        // compute
        const passEncoderCompute = commandEncoder.beginComputePass();
        passEncoderCompute.setPipeline(computePipeline);
        passEncoderCompute.setBindGroup(
            0,
            bindGroup0
        );
        passEncoderCompute.setBindGroup(
            1,
            computeProgram.bindGroup,
        );
        passEncoderCompute.dispatchWorkgroups(
            Options.size / Options.workgroupSize,
            Options.size / Options.workgroupSize
        );
        passEncoderCompute.end();

        commandEncoder.copyBufferToBuffer(buffer1, 0, buffer0, 0, cells.byteLength);
        commandEncoder.copyBufferToBuffer(debugInfoBuffer, 0, debugReadBuffer, 0, 4);

        // render
        const passEncoderRender =
            commandEncoder.beginRenderPass(renderPass);
        passEncoderRender.setPipeline(renderPipeline);
        passEncoderRender.setVertexBuffer(0, buffer0);
        passEncoderRender.setVertexBuffer(1, squareBuffer);
        passEncoderRender.setBindGroup(0, uniformBindGroup);
        passEncoderRender.draw(4, length);
        passEncoderRender.end();

        device.queue.submit([commandEncoder.finish()]);
    };

    readDebugInfo = async () => {
        await debugReadBuffer.mapAsync(GPUMapMode.READ);
        const arrayBuffer = debugReadBuffer.getMappedRange();
        const view = new DataView(arrayBuffer);
        const value = view.getUint32(0, true);
        debugReadBuffer.unmap();

        return value;
    };

    applyDrawCanvas = () => {
        const commandEncoder = device.createCommandEncoder();
        for (let i = 0; i < Options.size; i++) {
            for (let j = 0; j < Options.size; j++) {
                if (drawCanvasData[(j * Options.size + i)]) {
                    const index = j * Options.size + i;
                    device.queue.writeBuffer(
                        buffer0,
                        index * Uint32Array.BYTES_PER_ELEMENT,
                        drawCanvasData,
                        index,
                        1,
                    );
                }
            }
        }

        device.queue.submit([commandEncoder.finish()]);
        drawCanvasData.fill(0);
    }

    renderChanges = () => {
        const view = context.getCurrentTexture().createView();
        const renderPass = {
            colorAttachments: [
                {
                    view,
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        };
        commandEncoder = device.createCommandEncoder();
        const passEncoderRender =
            commandEncoder.beginRenderPass(renderPass);
        passEncoderRender.setPipeline(renderPipeline);
        passEncoderRender.setVertexBuffer(0, buffer0);
        passEncoderRender.setVertexBuffer(1, squareBuffer);
        passEncoderRender.setBindGroup(0, uniformBindGroup);
        passEncoderRender.draw(4, length);
        passEncoderRender.end();

        device.queue.submit([commandEncoder.finish()]);
    }

    render();
}

let isDrawing = false;
let isErasing = false;

canvas.onmousedown = (event) => {
    isDrawing = true;
    isErasing = event.button === 2;
}

canvas.onmouseup = () => {
    isDrawing = false;
    renderChanges();
}

canvas.onmousemove = (event) => {
    if (isDrawing) {
        const cellSize = canvas.width / Options.size;
        const x = Math.floor(event.offsetX / cellSize);
        const y = Options.size - Math.floor(event.offsetY / cellSize) - 1;
        const allAffectedCells = [];
        for (let i = - Options.brushSize; i <= Options.brushSize; i++) {
            for (let j = - Options.brushSize; j <= Options.brushSize; j++) {
                if (i * i + j * j <= Options.brushSize * Options.brushSize &&
                    x + i >= 0 && x + i < Options.size &&
                    y + j >= 0 && y + j < Options.size) {
                        allAffectedCells.push({ x: x + i, y: y + j });
                    }
            }
        }

        if (isErasing) {
            for (const cell of allAffectedCells) {
                drawCanvasData[cell.y * Options.size + cell.x] = 4 << 24;
            }
        } else {
            for (const cell of allAffectedCells) {
                drawCanvasData[cell.y * Options.size + cell.x] = drawType;
            }
        }

        applyDrawCanvas();
        renderChanges();
    }
}

let paused = false;

async function loop() {
    wholeTime++;
    if (wholeTime >= Options.timestep) {
        if (!paused){
            for (let i = 0; i < Options.stepsPerTimestep; i++) {
                render();
            }
        }
        wholeTime -= Options.timestep;
    }
}

resetGameData();
onFrame(() => {
    loop();
});

addParameter('size', {initial: 64, options: [16, 32, 64, 128, 256, 512, 1024]}, (value) => {
    Options.size = value;
    resetGameData();
});
addParameter('timestep', {initial: 10, min: 1, max: 50, step: 1}, (value) => {
    Options.timestep = value;
});
addParameter('stepsPerTimestep', {initial: 1, min: 1, max: 50, step: 1}, (value) => {
    Options.stepsPerTimestep = value;
});
addParameter('workgroupSize', {initial: 16, options: [1, 2, 4, 8, 16, 32]}, (value) => {
    Options.workgroupSize = value;
    resetGameData();
});
addParameter('viscosity', {initial: 255, min: 10, max: 1000, step: 1}, (value) => {
    Options.viscosity = value;
    viscosity.write(runtime, value);
});
addParameter('brushSize', {initial: 0, min: 0, max: 10, step: 1}, (value) => {
    Options.brushSize = value;
});
let drawType = 100;
addParameter('brushType', {initial: 'water', options: ['wall', 'source', 'drain', 'water']}, (value) => {
    switch (value) {
        case 'wall':
            drawType = 1 << 24;
            break;
        case 'source':
            drawType = 2 << 24;
            break;
        case 'drain':
            drawType = 3 << 24;
            break;
        default:
            drawType = 100;
            break;
    }
});