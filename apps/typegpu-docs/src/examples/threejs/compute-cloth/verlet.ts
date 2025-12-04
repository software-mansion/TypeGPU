import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { fromTSL, toTSL, type TSLAccessor } from '@typegpu/three';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { triNoise3D } from './triNoise.ts';

export type Vertex = {
  id: number;
  position: THREE.Vector3;
  isFixed: boolean;
  springIds: number[];
};

export type Spring = {
  id: number;
  vertex0: Vertex;
  vertex1: Vertex;
};

export const clothWidth = 1;
export const clothHeight = 1;
export const clothNumSegmentsX = 30;
export const clothNumSegmentsY = 30;

interface VerletSimulationOptions {
  sphereRadius: number;
  sphereUniform: TSLAccessor<d.F32, THREE.UniformNode<number>>;
  spherePositionUniform: TSLAccessor<d.Vec3f, THREE.UniformNode<THREE.Vector3>>;
}

export class VerletSimulation {
  readonly vertices: Vertex[];
  readonly springs: Spring[];
  readonly vertexColumns: Vertex[][];

  readonly stiffnessUniform: TSLAccessor<d.F32, THREE.UniformNode<number>>;
  readonly windUniform: TSLAccessor<d.F32, THREE.UniformNode<number>>;
  readonly dampeningUniform: TSLAccessor<d.F32, THREE.UniformNode<number>>;

  readonly vertexPositionBuffer: TSLAccessor<
    d.WgslArray<d.Vec3f>,
    THREE.StorageBufferNode
  >;
  readonly vertexForceBuffer: TSLAccessor<
    d.WgslArray<d.Vec3f>,
    THREE.StorageBufferNode
  >;
  readonly vertexParamsBuffer: TSLAccessor<
    d.WgslArray<d.Vec3u>,
    THREE.StorageBufferNode
  >;
  readonly springListBuffer: TSLAccessor<
    d.WgslArray<d.U32>,
    THREE.StorageBufferNode
  >;
  readonly springVertexIdBuffer: TSLAccessor<
    d.WgslArray<d.Vec2u>,
    THREE.StorageBufferNode
  >;
  readonly springRestLengthBuffer: TSLAccessor<
    d.WgslArray<d.F32>,
    THREE.StorageBufferNode
  >;
  readonly springForceBuffer: TSLAccessor<
    d.WgslArray<d.Vec3f>,
    THREE.StorageBufferNode
  >;

  readonly computeSpringForces: THREE.TSL.NodeObject<THREE.ComputeNode>;
  readonly computeVertexForces: THREE.TSL.NodeObject<THREE.ComputeNode>;

  constructor(
    { sphereRadius, sphereUniform, spherePositionUniform }:
      VerletSimulationOptions,
  ) {
    this.vertices = [];
    this.springs = [];
    this.vertexColumns = [];

    this.stiffnessUniform = fromTSL(TSL.uniform(0.2), { type: d.f32 });
    this.windUniform = fromTSL(TSL.uniform(1.0), { type: d.f32 });
    this.dampeningUniform = fromTSL(TSL.uniform(0.99), { type: d.f32 });

    // this function sets up the geometry of the verlet system, a grid of vertices connected by springs

    const addVerletVertex = (
      x: number,
      y: number,
      z: number,
      isFixed: boolean,
    ): Vertex => {
      const id = this.vertices.length;
      const vertex = {
        id,
        position: new THREE.Vector3(x, y, z),
        isFixed,
        springIds: [],
      };
      this.vertices.push(vertex);
      return vertex;
    };

    const addVerletSpring = (vertex0: Vertex, vertex1: Vertex) => {
      const id = this.springs.length;
      const spring = {
        id,
        vertex0,
        vertex1,
      };
      vertex0.springIds.push(id);
      vertex1.springIds.push(id);
      this.springs.push(spring);
      return spring;
    };

    // create the cloth's verlet vertices
    for (let x = 0; x <= clothNumSegmentsX; x++) {
      const column = [];
      for (let y = 0; y <= clothNumSegmentsY; y++) {
        const posX = x * (clothWidth / clothNumSegmentsX) - clothWidth * 0.5;
        const posZ = y * (clothHeight / clothNumSegmentsY);
        const isFixed = (y === 0) && ((x % 5) === 0); // make some of the top vertices' positions fixed
        const vertex = addVerletVertex(posX, clothHeight * 0.5, posZ, isFixed);
        column.push(vertex);
      }

      this.vertexColumns.push(column);
    }

    // create the cloth's verlet springs
    for (let x = 0; x <= clothNumSegmentsX; x++) {
      for (let y = 0; y <= clothNumSegmentsY; y++) {
        const vertex0 = this.vertexColumns[x][y];
        if (x > 0) addVerletSpring(vertex0, this.vertexColumns[x - 1][y]);
        if (y > 0) addVerletSpring(vertex0, this.vertexColumns[x][y - 1]);
        if (x > 0 && y > 0) {
          addVerletSpring(vertex0, this.vertexColumns[x - 1][y - 1]);
        }
        if (x > 0 && y < clothNumSegmentsY) {
          addVerletSpring(vertex0, this.vertexColumns[x - 1][y + 1]);
        }

        // You can make the cloth more rigid by adding more springs between further apart vertices
        //if (x > 1) addVerletSpring(vertex0, verletVertexColumns[x - 2][y]);
        //if (y > 1) addVerletSpring(vertex0, verletVertexColumns[x][y - 2]);
      }
    }

    // setup the buffers holding the vertex data for the compute shaders

    const vertexCount = this.vertices.length;

    const springListArray = [];
    // this springListArray will hold a list of spring ids, ordered by the id of the vertex affected by that spring.
    // this is so the compute shader that accumulates the spring forces for each vertex can efficiently iterate over all springs affecting that vertex

    const vertexPositionArray = new Float32Array(vertexCount * 3);
    const vertexParamsArray = new Uint32Array(vertexCount * 3);
    // the params Array holds three values for each verlet vertex:
    // x: isFixed, y: springCount, z: springPointer
    // isFixed is 1 if the verlet is marked as immovable, 0 if not
    // springCount is the number of springs connected to that vertex
    // springPointer is the index of the first spring in the springListArray that is connected to that vertex

    for (let i = 0; i < vertexCount; i++) {
      const vertex = this.vertices[i];
      vertexPositionArray[i * 3] = vertex.position.x;
      vertexPositionArray[i * 3 + 1] = vertex.position.y;
      vertexPositionArray[i * 3 + 2] = vertex.position.z;
      vertexParamsArray[i * 3] = vertex.isFixed ? 1 : 0;
      if (!vertex.isFixed) {
        vertexParamsArray[i * 3 + 1] = vertex.springIds.length;
        vertexParamsArray[i * 3 + 2] = springListArray.length;
        springListArray.push(...vertex.springIds);
      }
    }

    this.vertexPositionBuffer = fromTSL(
      TSL.instancedArray(vertexPositionArray, 'vec3'),
      { type: d.arrayOf(d.vec3f) },
    );

    this.vertexForceBuffer = fromTSL(TSL.instancedArray(vertexCount, 'vec3'), {
      type: d.arrayOf(d.vec3f),
    });

    this.vertexParamsBuffer = fromTSL(
      TSL.instancedArray(vertexParamsArray, 'uvec3'),
      { type: d.arrayOf(d.vec3u) },
    );

    this.springListBuffer = fromTSL(
      TSL.instancedArray(new Uint32Array(springListArray), 'uint').setPBO(true),
      { type: d.arrayOf(d.u32) },
    );

    // setup the buffers holding the spring data for the compute shaders

    const springCount = this.springs.length;

    const springVertexIdArray = new Uint32Array(springCount * 2);
    const springRestLengthArray = new Float32Array(springCount);

    for (let i = 0; i < springCount; i++) {
      const spring = this.springs[i];
      springVertexIdArray[i * 2] = spring.vertex0.id;
      springVertexIdArray[i * 2 + 1] = spring.vertex1.id;
      springRestLengthArray[i] = spring.vertex0.position.distanceTo(
        spring.vertex1.position,
      );
    }

    this.springVertexIdBuffer = fromTSL(
      TSL.instancedArray(springVertexIdArray, 'uvec2').setPBO(true),
      { type: d.arrayOf(d.vec2u) },
    );

    this.springRestLengthBuffer = fromTSL(
      TSL.instancedArray(springRestLengthArray, 'float'),
      { type: d.arrayOf(d.f32) },
    );

    this.springForceBuffer = fromTSL(
      TSL.instancedArray(springCount * 3, 'vec3').setPBO(true),
      { type: d.arrayOf(d.vec3f) },
    );

    // This sets up the compute shaders for the verlet simulation
    // There are two shaders that are executed for each simulation step

    const instanceIndex = fromTSL(TSL.instanceIndex, { type: d.u32 });

    // 1. computeSpringForces:
    // This shader computes a force for each spring, depending on the distance between the two vertices connected by that spring and the targeted rest length

    this.computeSpringForces = toTSL(() => {
      'use gpu';

      if (instanceIndex.$ >= springCount) {
        // compute Shaders are executed in groups of 64, so instanceIndex might be bigger than the amount of springs.
        // in that case, return.
        return;
      }

      const vertexId = this.springVertexIdBuffer.$[instanceIndex.$];
      const restLength = this.springRestLengthBuffer.$[instanceIndex.$];

      const vertex0Position = this.vertexPositionBuffer.$[vertexId.x];
      const vertex1Position = this.vertexPositionBuffer.$[vertexId.y];

      const delta = vertex1Position.sub(vertex0Position);
      const dist = std.max(std.length(delta), 0.000001);
      const force = delta.mul(
        (dist - restLength) * this.stiffnessUniform.$ * 0.5 / dist,
      );
      this.springForceBuffer.$[instanceIndex.$] = d.vec3f(force);
    }).compute(springCount);

    // 2. computeVertexForces:
    // This shader accumulates the force for each vertex.
    // First it iterates over all springs connected to this vertex and accumulates their forces.
    // Then it adds a gravital force, wind force, and the collision with the sphere.
    // In the end it adds the force to the vertex' position.

    const time = fromTSL(TSL.time, { type: d.f32 });

    this.computeVertexForces = toTSL(() => {
      'use gpu';
      const idx = instanceIndex.$;

      if (idx >= vertexCount) {
        // compute shaders are executed in groups of 64, so instanceIndex might be bigger than the amount of vertices.
        // in that case, return.
        return;
      }

      const params = this.vertexParamsBuffer.$[idx];
      const isFixed = params.x;
      const springCount = params.y;
      const springPointer = params.z;

      if (isFixed) {
        // don't need to calculate vertex forces if the vertex is set as immovable
        return;
      }

      const position = this.vertexPositionBuffer.$[idx];
      let force = d.vec3f(this.vertexForceBuffer.$[idx]);
      force = force.mul(this.dampeningUniform.$);

      const ptrStart = springPointer;
      const ptrEnd = ptrStart + springCount;
      for (let i = ptrStart; i < ptrEnd; i++) {
        const springId = this.springListBuffer.$[i];
        const springForce = this.springForceBuffer.$[springId];
        const springVertexIds = this.springVertexIdBuffer.$[springId];
        const factor = std.select(
          d.f32(-1),
          d.f32(1),
          springVertexIds.x === idx,
        );
        force = force.add(springForce.mul(factor));
      }

      // gravity
      force.y -= 0.00005;

      // wind
      const noise = (triNoise3D(position, 1, time.$) - 0.2) * 0.0001;
      const windForce = noise * this.windUniform.$;
      force.z -= windForce;

      // collision with sphere
      const deltaSphere = position.add(force).sub(spherePositionUniform.$);
      const dist = std.length(deltaSphere);
      const sphereForce = deltaSphere.mul(
        std.max(0, sphereRadius - dist) / dist * sphereUniform.$,
      );
      force = force.add(sphereForce);

      this.vertexForceBuffer.$[idx] = d.vec3f(force);
      this.vertexPositionBuffer.$[idx] = this.vertexPositionBuffer.$[idx].add(
        force,
      );
    }).compute(vertexCount);
  }

  async update(renderer: THREE.WebGPURenderer) {
    await renderer.computeAsync(this.computeSpringForces);
    await renderer.computeAsync(this.computeVertexForces);
  }
}
