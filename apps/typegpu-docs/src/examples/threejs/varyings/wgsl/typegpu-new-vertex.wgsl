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
	@location( 3 ) v_normalViewGeometry : vec3<f32>,
	@location( 4 ) vNormal : vec3<f32>,
	@location( 5 ) v_positionViewDirection : vec3<f32>,
	@builtin( position ) Vertex : vec4<f32>
};
var<private> varyings : VaryingsStruct;

// codes
var<private> var_1: vec3f;

fn fnName() -> vec3f {
  const frequency = 3f;
  const amplitude = 0.5;
  let wave = sin(((var_1.x * frequency) + render.nodeUniform0));
  var_1.y += (wave * amplitude);
  let derivative = ((cos(((var_1.x * frequency) + render.nodeUniform0)) * amplitude) * frequency);
  var newNormalLocal = vec3f(-(derivative), 1f, 0f);
  varyings.vNormal.x = newNormalLocal.x;
  varyings.vNormal.y = newNormalLocal.y;
  varyings.vNormal.z = newNormalLocal.z;
  return var_1;
}


@vertex
fn main( @location( 0 ) position : vec3<f32>,
	@location( 1 ) normal : vec3<f32> ) -> VaryingsStruct {

	// vars

	var normalLocal : vec3<f32>;
	var modelViewMatrix : mat4x4<f32>;
	var nodeVar77 : vec4<f32>;
	var positionLocal : vec3<f32>;
	var v_modelViewProjection : vec4<f32>;
	var v_positionView : vec3<f32>;


	// flow
	// code

	positionLocal = position;
	varyings.vNormal = vec3<f32>( 0.0, 0.0, 0.0 );
	var_1 = positionLocal;
	var_1 = positionLocal;
	var_1 = positionLocal;
	var_1 = positionLocal;
	positionLocal = fnName();
	normalLocal = normal;
	varyings.v_normalViewGeometry = normalize( ( render.cameraViewMatrix * vec4<f32>( ( object.nodeUniform6 * normalLocal ), 0.0 ) ).xyz );
	modelViewMatrix = ( render.cameraViewMatrix * object.nodeUniform14 );
	v_positionView = ( modelViewMatrix * vec4<f32>( positionLocal, 1.0 ) ).xyz;
	varyings.v_positionViewDirection = ( - v_positionView );
	nodeVar77 = ( render.cameraProjectionMatrix * vec4<f32>( v_positionView, 1.0 ) );
	v_modelViewProjection = nodeVar77;

	// result

	varyings.Vertex = v_modelViewProjection;

	return varyings;

}
