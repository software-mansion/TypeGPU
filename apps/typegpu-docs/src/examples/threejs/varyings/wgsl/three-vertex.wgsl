// Three.js r181 - Node System

// directives


// structs


// uniforms

struct renderStruct {
	nodeUniform0 : f32,
	cameraViewMatrix : mat4x4<f32>,
	cameraProjectionMatrix : mat4x4<f32>
};
@binding( 1 ) @group( 0 )
var<uniform> render : renderStruct;

struct objectStruct {
	nodeUniform6 : mat3x3<f32>,
	nodeUniform14 : mat4x4<f32>
};
@binding( 3 ) @group( 1 )
var<uniform> object : objectStruct;

// varyings

struct VaryingsStruct {
	@location( 1 ) vNormal : vec3<f32>,
	@location( 4 ) v_normalViewGeometry : vec3<f32>,
	@location( 5 ) v_positionViewDirection : vec3<f32>,
	@builtin( position ) Vertex : vec4<f32>
};
var<private> varyings : VaryingsStruct;

// codes


@vertex
fn main( @location( 0 ) position : vec3<f32>,
	@location( 1 ) normal : vec3<f32> ) -> VaryingsStruct {

	// vars

	var nodeVar0 : vec3<f32>;
	var nodeVar1 : f32;
	var normalLocal : vec3<f32>;
	var modelViewMatrix : mat4x4<f32>;
	var nodeVar79 : vec4<f32>;
	var positionLocal : vec3<f32>;
	var v_modelViewProjection : vec4<f32>;
	var v_positionView : vec3<f32>;


	// flow
	// code

	positionLocal = position;
	varyings.vNormal = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar0 = positionLocal;
	nodeVar1 = ( render.nodeUniform0 * 0.5 );
	nodeVar0.y = ( nodeVar0.y + ( sin( ( ( nodeVar0.x * 3.0 ) + nodeVar1 ) ) * 0.5 ) );
	varyings.vNormal = vec3<f32>( ( - ( ( cos( ( ( nodeVar0.x * 3.0 ) + nodeVar1 ) ) * 0.5 ) * 3.0 ) ), 1.0, 0.0 );
	positionLocal = nodeVar0;
	normalLocal = normal;
	varyings.v_normalViewGeometry = normalize( ( render.cameraViewMatrix * vec4<f32>( ( object.nodeUniform6 * normalLocal ), 0.0 ) ).xyz );
	modelViewMatrix = ( render.cameraViewMatrix * object.nodeUniform14 );
	v_positionView = ( modelViewMatrix * vec4<f32>( positionLocal, 1.0 ) ).xyz;
	varyings.v_positionViewDirection = ( - v_positionView );
	nodeVar79 = ( render.cameraProjectionMatrix * vec4<f32>( v_positionView, 1.0 ) );
	v_modelViewProjection = nodeVar79;

	// result

	varyings.Vertex = v_modelViewProjection;

	return varyings;

}
