import { describe, expect, it } from 'vitest';
import { d } from 'typegpu';
import { deepEqual } from 'typegpu/data';
import { deserializeDataSchema, serializeDataSchema } from 'typegpu/~internal';

const schemas = [
  d.f32,
  d.vec3f,
  d.arrayOf(
    d.struct({
      position: d.vec3f,
      life: d.f32,
    }),
    2,
  ),
  d.disarrayOf(d.unstruct({ id: d.u32, packed: d.uint16x2 }), 3),
  d.atomic(d.u32),
  d.align(16, d.size(32, d.struct({ value: d.vec2f }))),
  d.location(2, d.vec4f),
  d.interpolate('linear, sample', d.vec2f),
  d.interpolate('flat, either', d.u32),
  d.builtin.vertexIndex,
  d.builtin.position,
  d.invariant(d.builtin.position),
  d.struct({
    position: d.invariant(d.builtin.position),
    color: d.location(0, d.interpolate('linear, centroid', d.vec4f)),
    index: d.location(1, d.interpolate('flat, either', d.u32)),
  }),
];

describe('data schema serialization', () => {
  it('serializes transferable schemas', () => {
    expect(schemas.map(serializeDataSchema)).toMatchInlineSnapshot(`
      [
        {
          "key": "f32",
          "type": "d",
        },
        {
          "key": "vec3f",
          "type": "d",
        },
        {
          "count": 2,
          "element": {
            "props": [
              [
                "position",
                {
                  "key": "vec3f",
                  "type": "d",
                },
              ],
              [
                "life",
                {
                  "key": "f32",
                  "type": "d",
                },
              ],
            ],
            "type": "struct",
          },
          "type": "array",
        },
        {
          "count": 3,
          "element": {
            "props": [
              [
                "id",
                {
                  "key": "u32",
                  "type": "d",
                },
              ],
              [
                "packed",
                {
                  "key": "uint16x2",
                  "type": "d",
                },
              ],
            ],
            "type": "unstruct",
          },
          "type": "disarray",
        },
        {
          "inner": {
            "key": "u32",
            "type": "d",
          },
          "type": "atomic",
        },
        {
          "attribs": [
            {
              "type": "align",
              "value": 16,
            },
            {
              "type": "size",
              "value": 32,
            },
          ],
          "inner": {
            "props": [
              [
                "value",
                {
                  "key": "vec2f",
                  "type": "d",
                },
              ],
            ],
            "type": "struct",
          },
          "type": "decorated",
        },
        {
          "attribs": [
            {
              "type": "location",
              "value": 2,
            },
          ],
          "inner": {
            "key": "vec4f",
            "type": "d",
          },
          "type": "decorated",
        },
        {
          "attribs": [
            {
              "type": "interpolate",
              "value": "linear, sample",
            },
          ],
          "inner": {
            "key": "vec2f",
            "type": "d",
          },
          "type": "decorated",
        },
        {
          "attribs": [
            {
              "type": "interpolate",
              "value": "flat, either",
            },
          ],
          "inner": {
            "key": "u32",
            "type": "d",
          },
          "type": "decorated",
        },
        {
          "attribs": [
            {
              "type": "builtin",
              "value": "vertex_index",
            },
          ],
          "inner": {
            "key": "u32",
            "type": "d",
          },
          "type": "decorated",
        },
        {
          "attribs": [
            {
              "type": "builtin",
              "value": "position",
            },
          ],
          "inner": {
            "key": "vec4f",
            "type": "d",
          },
          "type": "decorated",
        },
        {
          "attribs": [
            {
              "type": "invariant",
            },
            {
              "type": "builtin",
              "value": "position",
            },
          ],
          "inner": {
            "key": "vec4f",
            "type": "d",
          },
          "type": "decorated",
        },
        {
          "props": [
            [
              "position",
              {
                "attribs": [
                  {
                    "type": "invariant",
                  },
                  {
                    "type": "builtin",
                    "value": "position",
                  },
                ],
                "inner": {
                  "key": "vec4f",
                  "type": "d",
                },
                "type": "decorated",
              },
            ],
            [
              "color",
              {
                "attribs": [
                  {
                    "type": "location",
                    "value": 0,
                  },
                  {
                    "type": "interpolate",
                    "value": "linear, centroid",
                  },
                ],
                "inner": {
                  "key": "vec4f",
                  "type": "d",
                },
                "type": "decorated",
              },
            ],
            [
              "index",
              {
                "attribs": [
                  {
                    "type": "location",
                    "value": 1,
                  },
                  {
                    "type": "interpolate",
                    "value": "flat, either",
                  },
                ],
                "inner": {
                  "key": "u32",
                  "type": "d",
                },
                "type": "decorated",
              },
            ],
          ],
          "type": "struct",
        },
      ]
    `);
  });

  it('round-trips transferable schemas', () => {
    for (const [index, schema] of schemas.entries()) {
      const restored = deserializeDataSchema(serializeDataSchema(schema));
      expect(deepEqual(restored, schema), `schema #${index} (${schema.type})`).toBe(true);
    }
  });

  it('rejects unsupported schemas', () => {
    expect(() => serializeDataSchema(d.ptrFn(d.f32))).toThrowErrorMatchingInlineSnapshot(
      `[Error: TypeGPU schema 'ptr' cannot be serialized yet.]`,
    );
  });
});
