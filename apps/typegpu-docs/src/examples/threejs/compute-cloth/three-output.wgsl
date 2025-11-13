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
@binding( 0 ) @group( 1 )
var<storage, read_write> NodeBuffer_781 : NodeBuffer_781Struct;

struct NodeBuffer_779Struct {
	value : array< vec3<f32> >
};
@binding( 1 ) @group( 1 )
var<storage, read_write> NodeBuffer_779 : NodeBuffer_779Struct;

struct NodeBuffer_780Struct {
	value : array< vec3<f32> >
};
@binding( 2 ) @group( 1 )
var<storage, read_write> NodeBuffer_780 : NodeBuffer_780Struct;

struct NodeBuffer_782Struct {
	value : array< u32 >
};
@binding( 4 ) @group( 1 )
var<storage, read_write> NodeBuffer_782 : NodeBuffer_782Struct;

struct NodeBuffer_785Struct {
	value : array< vec3<f32> >
};
@binding( 5 ) @group( 1 )
var<storage, read_write> NodeBuffer_785 : NodeBuffer_785Struct;

struct NodeBuffer_783Struct {
	value : array< vec2<u32> >
};
@binding( 6 ) @group( 1 )
var<storage, read_write> NodeBuffer_783 : NodeBuffer_783Struct;
struct objectStruct {
	nodeUniform3 : f32,
	nodeUniform8 : f32,
	nodeUniform9 : vec3<f32>,
	nodeUniform10 : f32
};
@binding( 3 ) @group( 1 )
var<uniform> object : objectStruct;

struct renderStruct {
	nodeUniform7 : f32
};
@binding( 0 ) @group( 0 )
var<uniform> render : renderStruct;

// codes
fn tri ( x : f32 ) -> f32 {




	return abs( ( fract( x ) - 0.5 ) );

}

fn tri3 ( p : vec3<f32> ) -> vec3<f32> {




	return vec3<f32>( tri( ( p.z + tri( ( p.y * 1.0 ) ) ) ), tri( ( p.z + tri( ( p.x * 1.0 ) ) ) ), tri( ( p.y + tri( ( p.x * 1.0 ) ) ) ) );

}

fn triNoise3D ( position : vec3<f32>, speed : f32, time : f32 ) -> f32 {

	var nodeVar0 : vec3<f32>;
	var nodeVar1 : f32;
	var nodeVar2 : f32;
	var nodeVar3 : vec3<f32>;
	var nodeVar4 : vec3<f32>;
	var nodeVar5 : f32;

	nodeVar0 = position;
	nodeVar1 = 1.4;
	nodeVar2 = 0.0;
	nodeVar3 = nodeVar0;

	for ( var i : f32 = 0.0; i <= 3.0; i += 1. ) {

		nodeVar4 = tri3( ( nodeVar3 * vec3<f32>( 2.0 ) ) );
		nodeVar0 = ( nodeVar0 + ( nodeVar4 + vec3<f32>( ( time * ( 0.1 * speed ) ) ) ) );
		nodeVar3 = ( nodeVar3 * vec3<f32>( 1.8 ) );
		nodeVar1 = ( nodeVar1 * 1.5 );
		nodeVar0 = ( nodeVar0 * vec3<f32>( 1.2 ) );
		nodeVar5 = tri( ( nodeVar0.z + tri( ( nodeVar0.x + tri( nodeVar0.y ) ) ) ) );
		nodeVar2 = ( nodeVar2 + ( nodeVar5 / nodeVar1 ) );
		nodeVar3 = ( nodeVar3 + vec3<f32>( 0.14 ) );

	}


	return nodeVar2;

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

	var nodeVar0 : vec3<u32>;
	var vertexPosition : vec3<f32>;
	var vertexForce : vec3<f32>;
	var ptrStart : u32;
	var ptrEnd : u32;
	var springId : u32;
	var nodeVar1 : f32;
	var nodeVar2 : vec3<f32>;
	var nodeVar3 : f32;


	// flow
	// code


	if ( ( instanceIndex >= 961u ) ) {
		return;
	}

	nodeVar0 = NodeBuffer_781.value[ instanceIndex ];

	if ( bool( nodeVar0.x ) ) {
		return;
	}

	vertexPosition = NodeBuffer_779.value[ instanceIndex ];
	vertexForce = NodeBuffer_780.value[ instanceIndex ];
	vertexForce = ( vertexForce * vec3<f32>( object.nodeUniform3 ) );
	ptrStart = nodeVar0.z;
	ptrEnd = ( ptrStart + nodeVar0.y );

	for ( var i : u32 = ptrStart; i < ptrEnd; i ++ ) {

		springId = NodeBuffer_782.value[ i ];

		if ( ( NodeBuffer_783.value[ springId ].x == instanceIndex ) ) {

			nodeVar1 = 1.0;

		} else {

			nodeVar1 = -1.0;

		}

		vertexForce = ( vertexForce + ( NodeBuffer_785.value[ springId ] * vec3<f32>( nodeVar1 ) ) );

	}

	vertexForce.y = ( vertexForce.y - 0.00005 );
	vertexForce.z = ( vertexForce.z - ( ( ( triNoise3D( vertexPosition, 1.0, render.nodeUniform7 ) - 0.2 ) * 0.0001 ) * object.nodeUniform8 ) );
	nodeVar2 = ( ( vertexPosition + vertexForce ) - object.nodeUniform9 );
	nodeVar3 = length( nodeVar2 );
	vertexForce = ( vertexForce + ( ( ( vec3<f32>( max( ( 0.15 - nodeVar3 ), 0.0 ) ) * nodeVar2 ) / vec3<f32>( nodeVar3 ) ) * vec3<f32>( object.nodeUniform10 ) ) );
	NodeBuffer_780.value[ instanceIndex ] = vertexForce;
	NodeBuffer_779.value[ instanceIndex ] = ( NodeBuffer_779.value[ instanceIndex ] + vertexForce );
}
