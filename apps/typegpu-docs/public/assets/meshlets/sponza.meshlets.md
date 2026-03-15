# sponza.meshlets

Binary meshlet file generated from `sponza.obj` using [meshoptimizer](https://github.com/zeux/meshoptimizer).

## Stats

| | |
|---|---|
| Vertices | 184,406 |
| Triangles | 262,267 |
| Meshlets | 3,391 |
| Max vertices / meshlet | 64 |
| Max triangles / meshlet | 124 |
| Cone weight | 0.5 |

## Binary layout (little-endian)

### Header — 32 bytes (8 × u32)

| Offset | Field | Value |
|---|---|---|
| 0 | `magic` | `0x4C54534D` ("MSTL") |
| 4 | `version` | `1` |
| 8 | `vertex_count` | number of vertices |
| 12 | `meshlet_count` | number of meshlets |
| 16 | `meshlet_vertex_count` | length of the meshlet-vertices array |
| 20 | `meshlet_triangle_bytes` | byte length of the meshlet-triangles array |
| 24 | `flags` | bit 0 = normals present |
| 28 | `reserved` | `0` |

### Sections (consecutive, each 4-byte aligned)

| Section | Type | Size |
|---|---|---|
| **positions** | `Float32[vertex_count × 3]` | `[x, y, z]` per vertex |
| **normals** | `Float32[vertex_count × 3]` | `[nx, ny, nz]` per vertex *(flags bit 0)* |
| **meshlets** | `Uint32[meshlet_count × 4]` | `[vertex_offset, triangle_offset, vertex_count, triangle_count]` per meshlet |
| **meshlet_vertices** | `Uint32[meshlet_vertex_count]` | local-index → global vertex-index remapping |
| **meshlet_triangles** | `Uint8[meshlet_triangle_bytes]` | 3 local vertex indices per triangle, padded to multiple of 4 |
| **bounds** | `Float32[meshlet_count × 11]` | `[cx, cy, cz, radius, apexX, apexY, apexZ, axisX, axisY, axisZ, coneCutoff]` per meshlet |

The bounds data is suitable for sphere-based frustum culling and normal-cone backface culling.
