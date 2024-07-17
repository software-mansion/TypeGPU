import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import { describe, expect, it } from 'vitest';
import { dynamicArrayOf, struct, u32, vec4f } from 'wigsill';

describe('dynamicArray', () => {
  it('encodes SceneSpheres properly', () => {
    const SphereStruct = struct({
      xyzr: vec4f,
      material_idx: u32,
    });

    const MAX_SPHERES = 16;
    const SceneSpheres = dynamicArrayOf(SphereStruct, MAX_SPHERES);

    const value: Parsed<typeof SceneSpheres> = [
      {
        xyzr: [0, 0.1, 0.2, 1],
        material_idx: 12,
      },
      {
        xyzr: [0.75, 0.012, 0.54, 6.1],
        material_idx: 2,
      },
    ];

    // IO

    const buffer = new ArrayBuffer(SceneSpheres.size);

    const output = new BufferWriter(buffer);
    SceneSpheres.write(output, value);
    const input = new BufferReader(buffer);
    const parsed = SceneSpheres.read(input);

    expect(parsed.length).toEqual(value.length);
  });
});
