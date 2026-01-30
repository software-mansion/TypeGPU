// Three.js r181 - Node System

// global
diagnostic( off, derivative_uniformity );


// structs

struct OutputStruct {
	@location(0) color: vec4<f32>
};
var<private> output : OutputStruct;

// uniforms
@binding( 1 ) @group( 1 ) var nodeUniform15_sampler : sampler;
@binding( 2 ) @group( 1 ) var nodeUniform15 : texture_2d<f32>;
struct objectStruct {
	nodeUniform1 : vec3<f32>,
	nodeUniform2 : f32,
	nodeUniform3 : f32,
	nodeUniform4 : f32,
	nodeUniform7 : vec3<f32>,
	nodeUniform8 : f32,
	nodeUniform10 : mat3x3<f32>
};
@binding( 0 ) @group( 1 )
var<uniform> object : objectStruct;

struct renderStruct {
	cameraViewMatrix : mat4x4<f32>,
	nodeUniform11 : vec3<f32>,
	nodeUniform12 : vec3<f32>,
	nodeUniform13 : vec3<f32>,
	nodeUniform16 : vec3<f32>
};
@binding( 0 ) @group( 0 )
var<uniform> render : renderStruct;

// codes
var<private> var_1: vec3f;

fn fnName() -> vec3f {
  return normalize(var_1);
}
fn V_GGX_SmithCorrelated ( alpha : f32, dotNL : f32, dotNV : f32 ) -> f32 {

	var nodeVar0 : f32;

	nodeVar0 = ( alpha * alpha );

	return ( 0.5 / max( ( ( dotNL * sqrt( ( nodeVar0 + ( ( 1.0 - nodeVar0 ) * ( dotNV * dotNV ) ) ) ) ) + ( dotNV * sqrt( ( nodeVar0 + ( ( 1.0 - nodeVar0 ) * ( dotNL * dotNL ) ) ) ) ) ), 0.000001 ) );

}

fn D_GGX ( alpha : f32, dotNH : f32 ) -> f32 {

	var nodeVar0 : f32;
	var nodeVar1 : f32;

	nodeVar0 = ( alpha * alpha );
	nodeVar1 = ( 1.0 - ( ( dotNH * dotNH ) * ( 1.0 - nodeVar0 ) ) );

	return ( ( nodeVar0 / ( nodeVar1 * nodeVar1 ) ) * 0.3183098861837907 );

}



@fragment
fn main( @location( 3 ) v_normalViewGeometry : vec3<f32>,
	@location( 4 ) v_positionViewDirection : vec3<f32>,
	@location( 5 ) vNormal : vec3<f32> ) -> OutputStruct {

	// vars

	var DiffuseColor : vec4<f32>;
	var Metalness : f32;
	var Roughness : f32;
	var normalViewGeometry : vec3<f32>;
	var nodeVar0 : vec3<f32>;
	var SpecularColor : vec3<f32>;
	var SpecularF90 : f32;
	var EmissiveColor : vec3<f32>;
	var Output : vec4<f32>;
	var directDiffuse : vec3<f32>;
	var normalView : vec3<f32>;
	var nodeVar1 : vec3<f32>;
	var nodeVar2 : vec4<f32>;
	var nodeVar3 : vec4<f32>;
	var nodeVar4 : vec3<f32>;
	var nodeVar5 : vec3<f32>;
	var nodeVar6 : f32;
	var nodeVar7 : vec3<f32>;
	var nodeVar8 : vec3<f32>;
	var nodeVar9 : vec3<f32>;
	var nodeVar10 : vec3<f32>;
	var directSpecular : vec3<f32>;
	var positionViewDirection : vec3<f32>;
	var nodeVar11 : vec3<f32>;
	var nodeVar12 : f32;
	var nodeVar13 : f32;
	var nodeVar14 : f32;
	var nodeVar15 : vec4<f32>;
	var nodeVar16 : vec4<f32>;
	var nodeVar17 : vec3<f32>;
	var nodeVar18 : f32;
	var nodeVar19 : f32;
	var nodeVar20 : vec3<f32>;
	var nodeVar21 : vec3<f32>;
	var nodeVar22 : vec3<f32>;
	var irradiance : vec3<f32>;
	var nodeVar23 : vec3<f32>;
	var indirectDiffuse : vec3<f32>;
	var nodeVar24 : vec4<f32>;
	var nodeVar25 : vec4<f32>;
	var nodeVar26 : vec4<f32>;
	var singleScattering : vec3<f32>;
	var multiScattering : vec3<f32>;
	var nodeVar27 : f32;
	var nodeVar28 : vec4<f32>;
	var nodeVar29 : vec3<f32>;
	var nodeVar30 : f32;
	var nodeVar31 : vec3<f32>;
	var nodeVar32 : vec3<f32>;
	var nodeVar33 : vec3<f32>;
	var nodeVar34 : vec3<f32>;
	var nodeVar35 : vec3<f32>;
	var nodeVar36 : vec3<f32>;
	var nodeVar37 : vec3<f32>;
	var nodeVar38 : f32;
	var nodeVar39 : f32;
	var nodeVar40 : f32;
	var nodeVar41 : vec3<f32>;
	var nodeVar42 : vec3<f32>;
	var nodeVar43 : vec3<f32>;
	var nodeVar44 : vec3<f32>;
	var nodeVar45 : vec3<f32>;
	var nodeVar46 : vec3<f32>;
	var indirectSpecular : vec3<f32>;
	var radiance : vec3<f32>;
	var nodeVar47 : vec3<f32>;
	var nodeVar48 : vec3<f32>;
	var iblIrradiance : vec3<f32>;
	var nodeVar49 : vec3<f32>;
	var nodeVar50 : vec3<f32>;
	var nodeVar51 : vec3<f32>;
	var nodeVar52 : vec3<f32>;
	var nodeVar53 : f32;
	var nodeVar54 : f32;
	var nodeVar55 : f32;
	var nodeVar56 : f32;
	var nodeVar57 : vec4<f32>;
	var nodeVar58 : vec4<f32>;
	var nodeVar59 : vec4<f32>;
	var ambientOcclusion : f32;
	var nodeVar60 : vec3<f32>;
	var nodeVar61 : f32;
	var nodeVar62 : f32;
	var nodeVar63 : f32;
	var nodeVar64 : f32;
	var nodeVar65 : f32;
	var nodeVar66 : f32;
	var nodeVar67 : f32;
	var nodeVar68 : f32;
	var nodeVar69 : f32;
	var nodeVar70 : f32;
	var nodeVar71 : f32;
	var nodeVar72 : vec3<f32>;
	var totalDiffuse : vec3<f32>;
	var nodeVar73 : vec3<f32>;
	var totalSpecular : vec3<f32>;
	var nodeVar74 : vec3<f32>;
	var outgoingLight : vec3<f32>;
	var nodeVar75 : vec3<f32>;
	var nodeVar76 : vec4<f32>;


	// flow
	// code

	DiffuseColor = vec4<f32>( object.nodeUniform1, 1.0 );
	DiffuseColor.w = ( DiffuseColor.w * object.nodeUniform2 );
	DiffuseColor.w = 1.0;
	Metalness = object.nodeUniform3;
	normalViewGeometry = normalize( v_normalViewGeometry );
	nodeVar0 = max( abs( dpdx( normalViewGeometry ) ), abs( - dpdy( normalViewGeometry ) ) );
	Roughness = min( ( max( object.nodeUniform4, 0.0525 ) + max( max( nodeVar0.x, nodeVar0.y ), nodeVar0.z ) ), 1.0 );
	SpecularColor = mix( vec3<f32>( 0.04, 0.04, 0.04 ), DiffuseColor.xyz, Metalness );
	SpecularF90 = 1.0;
	DiffuseColor = vec4<f32>( ( DiffuseColor.xyz * vec3<f32>( ( 1.0 - object.nodeUniform3 ) ) ), DiffuseColor.w );
	EmissiveColor = ( object.nodeUniform7 * vec3<f32>( object.nodeUniform8 ) );
	directDiffuse = vec3<f32>( 0.0, 0.0, 0.0 );
	var_1 = normalize( ( render.cameraViewMatrix * vec4<f32>( ( object.nodeUniform10 * vNormal ), 0.0 ) ).xyz );
	normalView = fnName();
	nodeVar1 = ( render.nodeUniform11 - render.nodeUniform12 );
	nodeVar2 = vec4<f32>( nodeVar1, 0.0 );
	nodeVar3 = ( render.cameraViewMatrix * nodeVar2 );
	nodeVar4 = normalize( nodeVar3.xyz );
	nodeVar5 = nodeVar4;
	nodeVar6 = dot( normalView, nodeVar5 );
	nodeVar7 = ( vec3<f32>( clamp( nodeVar6, 0.0, 1.0 ) ) * render.nodeUniform13 );
	nodeVar8 = ( DiffuseColor.xyz * vec3<f32>( 0.3183098861837907 ) );
	nodeVar9 = ( nodeVar7 * nodeVar8 );
	nodeVar10 = ( directDiffuse + nodeVar9 );
	directDiffuse = nodeVar10;
	directSpecular = vec3<f32>( 0.0, 0.0, 0.0 );
	positionViewDirection = normalize( v_positionViewDirection );
	nodeVar11 = normalize( ( nodeVar5 + positionViewDirection ) );
	nodeVar12 = clamp( dot( positionViewDirection, nodeVar11 ), 0.0, 1.0 );
	nodeVar13 = exp2( ( ( ( nodeVar12 * -5.55473 ) - 6.98316 ) * nodeVar12 ) );
	nodeVar14 = ( Roughness * Roughness );
	nodeVar15 = textureSample( nodeUniform15, nodeUniform15_sampler, vec2<f32>( Roughness, clamp( dot( normalView, positionViewDirection ), 0.0, 1.0 ) ) );
	nodeVar16 = textureSample( nodeUniform15, nodeUniform15_sampler, vec2<f32>( Roughness, clamp( dot( normalView, nodeVar5 ), 0.0, 1.0 ) ) );
	nodeVar17 = ( SpecularColor + ( ( vec3<f32>( 1.0 ) - SpecularColor ) * vec3<f32>( 0.047619 ) ) );
	nodeVar18 = ( 1.0 - ( nodeVar15.xy.x + nodeVar15.xy.y ) );
	nodeVar19 = ( 1.0 - ( nodeVar16.xy.x + nodeVar16.xy.y ) );
	nodeVar20 = ( ( ( ( ( SpecularColor * vec3<f32>( ( 1.0 - nodeVar13 ) ) ) + vec3<f32>( ( 1.0 * nodeVar13 ) ) ) * vec3<f32>( V_GGX_SmithCorrelated( nodeVar14, clamp( dot( normalView, nodeVar5 ), 0.0, 1.0 ), clamp( dot( normalView, positionViewDirection ), 0.0, 1.0 ) ) ) ) * vec3<f32>( D_GGX( nodeVar14, clamp( dot( normalView, nodeVar11 ), 0.0, 1.0 ) ) ) ) + ( ( ( ( ( ( SpecularColor * vec3<f32>( nodeVar15.xy.x ) ) + vec3<f32>( ( 1.0 * nodeVar15.xy.y ) ) ) * ( ( SpecularColor * vec3<f32>( nodeVar16.xy.x ) ) + vec3<f32>( ( 1.0 * nodeVar16.xy.y ) ) ) ) * nodeVar17 ) / ( ( vec3<f32>( 1.0 ) - ( ( vec3<f32>( ( nodeVar18 * nodeVar19 ) ) * nodeVar17 ) * nodeVar17 ) ) + vec3<f32>( 0.000001 ) ) ) * vec3<f32>( ( nodeVar18 * nodeVar19 ) ) ) );
	nodeVar21 = ( nodeVar7 * nodeVar20 );
	nodeVar22 = ( directSpecular + nodeVar21 );
	directSpecular = nodeVar22;
	irradiance = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar23 = ( irradiance + render.nodeUniform16 );
	irradiance = nodeVar23;
	indirectDiffuse = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar24 = ( DiffuseColor * vec4<f32>( 0.3183098861837907 ) );
	nodeVar25 = ( vec4<f32>( irradiance, 1.0 ) * nodeVar24 );
	nodeVar26 = ( vec4<f32>( indirectDiffuse, 1.0 ) + nodeVar25 );
	indirectDiffuse = nodeVar26.xyz;
	singleScattering = vec3<f32>( 0.0, 0.0, 0.0 );
	multiScattering = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar27 = dot( normalView, positionViewDirection );
	nodeVar28 = textureSample( nodeUniform15, nodeUniform15_sampler, vec2<f32>( Roughness, clamp( nodeVar27, 0.0, 1.0 ) ) );
	nodeVar29 = ( SpecularColor * vec3<f32>( nodeVar28.xy.x ) );
	nodeVar30 = ( SpecularF90 * nodeVar28.xy.y );
	nodeVar31 = ( nodeVar29 + vec3<f32>( nodeVar30 ) );
	nodeVar32 = ( singleScattering + nodeVar31 );
	singleScattering = nodeVar32;
	nodeVar33 = ( vec3<f32>( 1.0 ) - SpecularColor );
	nodeVar34 = nodeVar33;
	nodeVar35 = ( nodeVar34 * vec3<f32>( 0.047619 ) );
	nodeVar36 = ( SpecularColor + nodeVar35 );
	nodeVar37 = ( nodeVar31 * nodeVar36 );
	nodeVar38 = ( nodeVar28.xy.x + nodeVar28.xy.y );
	nodeVar39 = ( 1.0 - nodeVar38 );
	nodeVar40 = nodeVar39;
	nodeVar41 = ( vec3<f32>( nodeVar40 ) * nodeVar36 );
	nodeVar42 = ( vec3<f32>( 1.0 ) - nodeVar41 );
	nodeVar43 = nodeVar42;
	nodeVar44 = ( nodeVar37 / nodeVar43 );
	nodeVar45 = ( nodeVar44 * vec3<f32>( nodeVar40 ) );
	nodeVar46 = ( multiScattering + nodeVar45 );
	multiScattering = nodeVar46;
	indirectSpecular = vec3<f32>( 0.0, 0.0, 0.0 );
	radiance = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar47 = ( radiance * singleScattering );
	nodeVar48 = ( indirectSpecular + nodeVar47 );
	indirectSpecular = nodeVar48;
	iblIrradiance = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar49 = ( iblIrradiance * vec3<f32>( 0.3183098861837907 ) );
	nodeVar50 = ( multiScattering * nodeVar49 );
	nodeVar51 = ( indirectSpecular + nodeVar50 );
	indirectSpecular = nodeVar51;
	nodeVar52 = ( singleScattering + multiScattering );
	nodeVar53 = max( nodeVar52.x, nodeVar52.y );
	nodeVar54 = max( nodeVar53, nodeVar52.z );
	nodeVar55 = ( 1.0 - nodeVar54 );
	nodeVar56 = nodeVar55;
	nodeVar57 = ( DiffuseColor * vec4<f32>( nodeVar56 ) );
	nodeVar58 = ( nodeVar57 * vec4<f32>( nodeVar49, 1.0 ) );
	nodeVar59 = ( vec4<f32>( indirectDiffuse, 1.0 ) + nodeVar58 );
	indirectDiffuse = nodeVar59.xyz;
	ambientOcclusion = 1.0;
	nodeVar60 = ( indirectDiffuse * vec3<f32>( ambientOcclusion ) );
	indirectDiffuse = nodeVar60;
	nodeVar61 = dot( normalView, positionViewDirection );
	nodeVar62 = ( clamp( nodeVar61, 0.0, 1.0 ) + ambientOcclusion );
	nodeVar63 = ( Roughness * -16.0 );
	nodeVar64 = ( 1.0 - nodeVar63 );
	nodeVar65 = nodeVar64;
	nodeVar66 = ( - nodeVar65 );
	nodeVar67 = exp2( nodeVar66 );
	nodeVar68 = pow( nodeVar62, nodeVar67 );
	nodeVar69 = ( 1.0 - nodeVar68 );
	nodeVar70 = nodeVar69;
	nodeVar71 = ( ambientOcclusion - nodeVar70 );
	nodeVar72 = ( indirectSpecular * vec3<f32>( clamp( nodeVar71, 0.0, 1.0 ) ) );
	indirectSpecular = nodeVar72;
	nodeVar73 = ( directDiffuse + indirectDiffuse );
	totalDiffuse = nodeVar73;
	nodeVar74 = ( directSpecular + indirectSpecular );
	totalSpecular = nodeVar74;
	nodeVar75 = ( totalDiffuse + totalSpecular );
	outgoingLight = nodeVar75;
	nodeVar76 = max( vec4<f32>( ( outgoingLight + EmissiveColor ), DiffuseColor.w ), vec4<f32>( 0.0 ) );
	Output = nodeVar76;

	// result

	output.color = nodeVar76;

	return output;

}
