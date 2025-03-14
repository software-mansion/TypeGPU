import tgpu from 'typegpu';
// import * as d from 'typegpu/data';
// import * as m from 'wgpu-matrix';


export const cubeComputeShader = tgpu['~unstable']
  .computeFn({
    workgroupSize: [1, 1, 1],
  })
  .does((input) => {
    // use accessor to read/write data
    // celestialBodies  

      const G = 9.8; // gravitational constant
      const dt = 0.016; // time step

    // Retrieve current cube state
    // const cubeState = cubeData.value; // cubeData with .position and .velocity
    // const position = cubeState.position; // a vec3f
    // const velocity = cubeState.velocity; // a vec3f

    // // Calculate the distance from origin and normalized direction
    // const dist = std.length(position);
    // let normDir = d.vec3f();
    // if (dist !== 0) {
    //   normDir = std.mul(1 / dist, position);
    // } // else remains {0,0,0} if cube is at the origin

    // for (let i = 0; i < 3; i += 1) {
    //   velocity[i] = velocity[i] + (-G * normDir[i] * dt);
    //   position[i] = position[i] + (velocity[i] * dt);
    //   velocity[i] = velocity[i] * 0.99; // damping factor
    // }

    // m.mat4.identity(cubeModelMatrix);
    // m.mat4.translate(cubeModelMatrix, position, cubeModelMatrix);

    // objectBuffer.write({ modelMatrix: cubeModelMatrix });

    // cubeData.value.position = position;
    // cubeData.value.velocity = velocity;
  })
  .$name('cube physics compute shader');