/*
{
  "title": "Matrix Multiplication"
}
*/

import { addElement, onFrame } from '@wigsill/example-toolkit';
import {
  createRuntime,
  dynamicArrayOf,
  f32,
  makeArena,
  struct,
  vec2f,
  wgsl,
} from 'wigsill';

const runtime = await createRuntime();
const device = runtime.device;

const workgroupSize = [8, 8] as [number, number];

const firstMatrix = {
  size: [3, 4] as [number, number],
  numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};

const secondMatrix = {
  size: [4, 2] as [number, number],
  numbers: [1, 2, 3, 4, 5, 6, 7, 8],
};

const matrixStruct = struct({
  size: vec2f,
  numbers: dynamicArrayOf(f32, 64),
});

const firstMatrixData = wgsl.buffer(matrixStruct).$name('first_matrix');
const secondMatrixData = wgsl.buffer(matrixStruct).$name('second_matrix');
const resultMatrixData = wgsl.buffer(matrixStruct).$name('result_matrix');

const arena = makeArena({
  bufferBindingType: 'storage',
  memoryEntries: [firstMatrixData, secondMatrixData],
  usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
});

const resultArena = makeArena({
  bufferBindingType: 'storage',
  memoryEntries: [resultMatrixData],
  usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE,
});

const program = runtime.makeComputePipeline({
  workgroupSize: workgroupSize,
  args: ['@builtin(global_invocation_id)  global_id: vec3<u32>'],
  code: wgsl`
    // Guard against out-of-bounds work group sizes
    if (global_id.x >= u32(${firstMatrixData}.size.x) || global_id.y >= u32(${secondMatrixData}.size.y)) {
      return;
    }

    ${resultMatrixData}.size = vec2(${firstMatrixData}.size.x, ${secondMatrixData}.size.y);

    let resultCell = vec2(global_id.x, global_id.y);
    var result = 0.0;
    for (var i = 0u; i < u32(${firstMatrixData}.size.y); i = i + 1u) {
      let a = i + resultCell.x * u32(${firstMatrixData}.size.y);
      let b = resultCell.y + i * u32(${secondMatrixData}.size.y);
      result = result + ${firstMatrixData}.numbers.values[a] * ${secondMatrixData}.numbers.values[b];
    }

    let index = resultCell.y + resultCell.x * u32(${secondMatrixData}.size.y);
    ${resultMatrixData}.numbers.values[index] = result;
`,
  arenas: [arena, resultArena],
});

firstMatrixData.write(runtime, firstMatrix);
secondMatrixData.write(runtime, secondMatrix);

const resultMatrixSize = firstMatrix.size[0] * secondMatrix.size[1];

const gpuReadBuffer = device.createBuffer({
  size: resultMatrixSize * 4,
  usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
});

const workgroupCountX = Math.ceil(firstMatrix.size[0] / workgroupSize[0]);
const workgroupCountY = Math.ceil(secondMatrix.size[1] / workgroupSize[1]);
program.execute([workgroupCountX, workgroupCountY]);
runtime.flush();

const encoder = device.createCommandEncoder();
encoder.copyBufferToBuffer(
  runtime.bufferFor(resultArena),
  12,
  gpuReadBuffer,
  0,
  resultMatrixSize * 4,
);

device.queue.submit([encoder.finish()]);

await gpuReadBuffer.mapAsync(GPUMapMode.READ);
const arrayBuffer = gpuReadBuffer.getMappedRange();
const multiplicationResult = new Float32Array(arrayBuffer);
console.log(multiplicationResult);

const canvas = await addElement('canvas', { width: 400, height: 400 });
const context = canvas.getContext('2d') as CanvasRenderingContext2D;

onFrame(() => {
  context.font = '30px Arial';
  context.fillStyle = 'white';
  context.fillRect(0, 0, 400, 400);
  context.fillStyle = 'darkblue';

  for (let i = 0; i < secondMatrix.size[1]; i++) {
    for (let j = 0; j < firstMatrix.size[0]; j++) {
      context.fillText(
        multiplicationResult[j * secondMatrix.size[1] + i]?.toString() ?? '_',
        i * 80 + 120,
        j * 80 + 120,
      );
    }
  }
});
