// Three.js r180 - Node System

// directives
enable subgroups;

// system
var<private> instanceIndex : u32;

// locals


// structs


// uniforms

struct NodeBuffer_781Struct {
	value : array< vec3<u32> >
};
@binding( 0 ) @group( 0 )
var<storage, read_write> NodeBuffer_781 : NodeBuffer_781Struct;

struct NodeBuffer_779Struct {
	value : array< vec3<f32> >
};
@binding( 1 ) @group( 0 )
var<storage, read_write> NodeBuffer_779 : NodeBuffer_779Struct;

struct NodeBuffer_780Struct {
	value : array< vec3<f32> >
};
@binding( 2 ) @group( 0 )
var<storage, read_write> NodeBuffer_780 : NodeBuffer_780Struct;

struct NodeBuffer_782Struct {
	value : array< u32 >
};
@binding( 4 ) @group( 0 )
var<storage, read_write> NodeBuffer_782 : NodeBuffer_782Struct;

struct NodeBuffer_785Struct {
	value : array< vec3<f32> >
};
@binding( 5 ) @group( 0 )
var<storage, read_write> NodeBuffer_785 : NodeBuffer_785Struct;

struct NodeBuffer_783Struct {
	value : array< vec2<u32> >
};
@binding( 6 ) @group( 0 )
var<storage, read_write> NodeBuffer_783 : NodeBuffer_783Struct;
struct objectStruct {
	nodeUniform3 : f32,
	nodeUniform7 : f32,
	nodeUniform8 : vec3<f32>,
	nodeUniform9 : f32
};
@binding( 3 ) @group( 0 )
var<uniform> object : objectStruct;

// codes
var<private> item_1: u32;

fn fnName_0() {
  var idx = item_1;
  if ((idx >= 961u)) {
    return;
  }
  var params = NodeBuffer_781.value[idx];
  var isFixed = params.x;
  var springCount2 = params.y;
  var springPointer = params.z;
  if (bool(isFixed)) {
    return;
  }
  var position = NodeBuffer_779.value[idx];
  var force = vec3f(NodeBuffer_780.value[idx]);
  force = (force * object.nodeUniform3);
  for (var i = springPointer; (i < (springPointer + springCount2)); i++) {
    var springId = NodeBuffer_782.value[i];
    var springForce = NodeBuffer_785.value[springId];
    var springVertexIds = NodeBuffer_783.value[springId];
    var factor = select(1f, f32(-1), (springVertexIds.x == idx));
    force = (force + (springForce * factor));
  }
  force.y -= 5e-5f;
  var noise = 0;
  var windForce = (f32(noise) * object.nodeUniform7);
  force.z -= windForce;
  var deltaSphere = ((position + force) - object.nodeUniform8);
  var dist = length(deltaSphere);
  var sphereForce = (deltaSphere * ((max(0f, (0.15f - dist)) / dist) * object.nodeUniform9));
  force = (force + sphereForce);
  NodeBuffer_780.value[idx] = vec3f(force);
  NodeBuffer_779.value[idx] = (NodeBuffer_779.value[idx] + force);
}


@compute @workgroup_size( 64, 1, 1 )
fn main( @builtin( global_invocation_id ) globalId : vec3<u32>,
	@builtin( workgroup_id ) workgroupId : vec3<u32>,
	@builtin( local_invocation_id ) localId : vec3<u32>,
	@builtin( num_workgroups ) numWorkgroups : vec3<u32>,
	@builtin( subgroup_size ) subgroupSize : u32 ) {

	// system
	instanceIndex = globalId.x
		+ globalId.y * ( 64 * numWorkgroups.x )
		+ globalId.z * ( 64 * numWorkgroups.x ) * ( 1 * numWorkgroups.y );

	// vars




	// flow
	// code

	item_1 = instanceIndex;
	fnName_0();



}
