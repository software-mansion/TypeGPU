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
fn main( @location( 1 ) vNormal : vec3<f32>,
	@location( 4 ) v_normalViewGeometry : vec3<f32>,
	@location( 5 ) v_positionViewDirection : vec3<f32> ) -> OutputStruct {

	// vars

	var DiffuseColor : vec4<f32>;
	var Metalness : f32;
	var Roughness : f32;
	var normalViewGeometry : vec3<f32>;
	var nodeVar2 : vec3<f32>;
	var SpecularColor : vec3<f32>;
	var SpecularF90 : f32;
	var EmissiveColor : vec3<f32>;
	var Output : vec4<f32>;
	var directDiffuse : vec3<f32>;
	var normalView : vec3<f32>;
	var nodeVar3 : vec3<f32>;
	var nodeVar4 : vec4<f32>;
	var nodeVar5 : vec4<f32>;
	var nodeVar6 : vec3<f32>;
	var nodeVar7 : vec3<f32>;
	var nodeVar8 : f32;
	var nodeVar9 : vec3<f32>;
	var nodeVar10 : vec3<f32>;
	var nodeVar11 : vec3<f32>;
	var nodeVar12 : vec3<f32>;
	var directSpecular : vec3<f32>;
	var positionViewDirection : vec3<f32>;
	var nodeVar13 : vec3<f32>;
	var nodeVar14 : f32;
	var nodeVar15 : f32;
	var nodeVar16 : f32;
	var nodeVar17 : vec4<f32>;
	var nodeVar18 : vec4<f32>;
	var nodeVar19 : vec3<f32>;
	var nodeVar20 : f32;
	var nodeVar21 : f32;
	var nodeVar22 : vec3<f32>;
	var nodeVar23 : vec3<f32>;
	var nodeVar24 : vec3<f32>;
	var irradiance : vec3<f32>;
	var nodeVar25 : vec3<f32>;
	var indirectDiffuse : vec3<f32>;
	var nodeVar26 : vec4<f32>;
	var nodeVar27 : vec4<f32>;
	var nodeVar28 : vec4<f32>;
	var singleScattering : vec3<f32>;
	var multiScattering : vec3<f32>;
	var nodeVar29 : f32;
	var nodeVar30 : vec4<f32>;
	var nodeVar31 : vec3<f32>;
	var nodeVar32 : f32;
	var nodeVar33 : vec3<f32>;
	var nodeVar34 : vec3<f32>;
	var nodeVar35 : vec3<f32>;
	var nodeVar36 : vec3<f32>;
	var nodeVar37 : vec3<f32>;
	var nodeVar38 : vec3<f32>;
	var nodeVar39 : vec3<f32>;
	var nodeVar40 : f32;
	var nodeVar41 : f32;
	var nodeVar42 : f32;
	var nodeVar43 : vec3<f32>;
	var nodeVar44 : vec3<f32>;
	var nodeVar45 : vec3<f32>;
	var nodeVar46 : vec3<f32>;
	var nodeVar47 : vec3<f32>;
	var nodeVar48 : vec3<f32>;
	var indirectSpecular : vec3<f32>;
	var radiance : vec3<f32>;
	var nodeVar49 : vec3<f32>;
	var nodeVar50 : vec3<f32>;
	var iblIrradiance : vec3<f32>;
	var nodeVar51 : vec3<f32>;
	var nodeVar52 : vec3<f32>;
	var nodeVar53 : vec3<f32>;
	var nodeVar54 : vec3<f32>;
	var nodeVar55 : f32;
	var nodeVar56 : f32;
	var nodeVar57 : f32;
	var nodeVar58 : f32;
	var nodeVar59 : vec4<f32>;
	var nodeVar60 : vec4<f32>;
	var nodeVar61 : vec4<f32>;
	var ambientOcclusion : f32;
	var nodeVar62 : vec3<f32>;
	var nodeVar63 : f32;
	var nodeVar64 : f32;
	var nodeVar65 : f32;
	var nodeVar66 : f32;
	var nodeVar67 : f32;
	var nodeVar68 : f32;
	var nodeVar69 : f32;
	var nodeVar70 : f32;
	var nodeVar71 : f32;
	var nodeVar72 : f32;
	var nodeVar73 : f32;
	var nodeVar74 : vec3<f32>;
	var totalDiffuse : vec3<f32>;
	var nodeVar75 : vec3<f32>;
	var totalSpecular : vec3<f32>;
	var nodeVar76 : vec3<f32>;
	var outgoingLight : vec3<f32>;
	var nodeVar77 : vec3<f32>;
	var nodeVar78 : vec4<f32>;


	// flow
	// code

	DiffuseColor = vec4<f32>( object.nodeUniform1, 1.0 );
	DiffuseColor.w = ( DiffuseColor.w * object.nodeUniform2 );
	DiffuseColor.w = 1.0;
	Metalness = object.nodeUniform3;
	normalViewGeometry = normalize( v_normalViewGeometry );
	nodeVar2 = max( abs( dpdx( normalViewGeometry ) ), abs( - dpdy( normalViewGeometry ) ) );
	Roughness = min( ( max( object.nodeUniform4, 0.0525 ) + max( max( nodeVar2.x, nodeVar2.y ), nodeVar2.z ) ), 1.0 );
	SpecularColor = mix( vec3<f32>( 0.04, 0.04, 0.04 ), DiffuseColor.xyz, Metalness );
	SpecularF90 = 1.0;
	DiffuseColor = vec4<f32>( ( DiffuseColor.xyz * vec3<f32>( ( 1.0 - object.nodeUniform3 ) ) ), DiffuseColor.w );
	EmissiveColor = ( object.nodeUniform7 * vec3<f32>( object.nodeUniform8 ) );
	directDiffuse = vec3<f32>( 0.0, 0.0, 0.0 );
	normalView = normalize( normalize( ( render.cameraViewMatrix * vec4<f32>( ( object.nodeUniform10 * vNormal ), 0.0 ) ).xyz ) );
	nodeVar3 = ( render.nodeUniform11 - render.nodeUniform12 );
	nodeVar4 = vec4<f32>( nodeVar3, 0.0 );
	nodeVar5 = ( render.cameraViewMatrix * nodeVar4 );
	nodeVar6 = normalize( nodeVar5.xyz );
	nodeVar7 = nodeVar6;
	nodeVar8 = dot( normalView, nodeVar7 );
	nodeVar9 = ( vec3<f32>( clamp( nodeVar8, 0.0, 1.0 ) ) * render.nodeUniform13 );
	nodeVar10 = ( DiffuseColor.xyz * vec3<f32>( 0.3183098861837907 ) );
	nodeVar11 = ( nodeVar9 * nodeVar10 );
	nodeVar12 = ( directDiffuse + nodeVar11 );
	directDiffuse = nodeVar12;
	directSpecular = vec3<f32>( 0.0, 0.0, 0.0 );
	positionViewDirection = normalize( v_positionViewDirection );
	nodeVar13 = normalize( ( nodeVar7 + positionViewDirection ) );
	nodeVar14 = clamp( dot( positionViewDirection, nodeVar13 ), 0.0, 1.0 );
	nodeVar15 = exp2( ( ( ( nodeVar14 * -5.55473 ) - 6.98316 ) * nodeVar14 ) );
	nodeVar16 = ( Roughness * Roughness );
	nodeVar17 = textureSample( nodeUniform15, nodeUniform15_sampler, vec2<f32>( Roughness, clamp( dot( normalView, positionViewDirection ), 0.0, 1.0 ) ) );
	nodeVar18 = textureSample( nodeUniform15, nodeUniform15_sampler, vec2<f32>( Roughness, clamp( dot( normalView, nodeVar7 ), 0.0, 1.0 ) ) );
	nodeVar19 = ( SpecularColor + ( ( vec3<f32>( 1.0 ) - SpecularColor ) * vec3<f32>( 0.047619 ) ) );
	nodeVar20 = ( 1.0 - ( nodeVar17.xy.x + nodeVar17.xy.y ) );
	nodeVar21 = ( 1.0 - ( nodeVar18.xy.x + nodeVar18.xy.y ) );
	nodeVar22 = ( ( ( ( ( SpecularColor * vec3<f32>( ( 1.0 - nodeVar15 ) ) ) + vec3<f32>( ( 1.0 * nodeVar15 ) ) ) * vec3<f32>( V_GGX_SmithCorrelated( nodeVar16, clamp( dot( normalView, nodeVar7 ), 0.0, 1.0 ), clamp( dot( normalView, positionViewDirection ), 0.0, 1.0 ) ) ) ) * vec3<f32>( D_GGX( nodeVar16, clamp( dot( normalView, nodeVar13 ), 0.0, 1.0 ) ) ) ) + ( ( ( ( ( ( SpecularColor * vec3<f32>( nodeVar17.xy.x ) ) + vec3<f32>( ( 1.0 * nodeVar17.xy.y ) ) ) * ( ( SpecularColor * vec3<f32>( nodeVar18.xy.x ) ) + vec3<f32>( ( 1.0 * nodeVar18.xy.y ) ) ) ) * nodeVar19 ) / ( ( vec3<f32>( 1.0 ) - ( ( vec3<f32>( ( nodeVar20 * nodeVar21 ) ) * nodeVar19 ) * nodeVar19 ) ) + vec3<f32>( 0.000001 ) ) ) * vec3<f32>( ( nodeVar20 * nodeVar21 ) ) ) );
	nodeVar23 = ( nodeVar9 * nodeVar22 );
	nodeVar24 = ( directSpecular + nodeVar23 );
	directSpecular = nodeVar24;
	irradiance = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar25 = ( irradiance + render.nodeUniform16 );
	irradiance = nodeVar25;
	indirectDiffuse = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar26 = ( DiffuseColor * vec4<f32>( 0.3183098861837907 ) );
	nodeVar27 = ( vec4<f32>( irradiance, 1.0 ) * nodeVar26 );
	nodeVar28 = ( vec4<f32>( indirectDiffuse, 1.0 ) + nodeVar27 );
	indirectDiffuse = nodeVar28.xyz;
	singleScattering = vec3<f32>( 0.0, 0.0, 0.0 );
	multiScattering = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar29 = dot( normalView, positionViewDirection );
	nodeVar30 = textureSample( nodeUniform15, nodeUniform15_sampler, vec2<f32>( Roughness, clamp( nodeVar29, 0.0, 1.0 ) ) );
	nodeVar31 = ( SpecularColor * vec3<f32>( nodeVar30.xy.x ) );
	nodeVar32 = ( SpecularF90 * nodeVar30.xy.y );
	nodeVar33 = ( nodeVar31 + vec3<f32>( nodeVar32 ) );
	nodeVar34 = ( singleScattering + nodeVar33 );
	singleScattering = nodeVar34;
	nodeVar35 = ( vec3<f32>( 1.0 ) - SpecularColor );
	nodeVar36 = nodeVar35;
	nodeVar37 = ( nodeVar36 * vec3<f32>( 0.047619 ) );
	nodeVar38 = ( SpecularColor + nodeVar37 );
	nodeVar39 = ( nodeVar33 * nodeVar38 );
	nodeVar40 = ( nodeVar30.xy.x + nodeVar30.xy.y );
	nodeVar41 = ( 1.0 - nodeVar40 );
	nodeVar42 = nodeVar41;
	nodeVar43 = ( vec3<f32>( nodeVar42 ) * nodeVar38 );
	nodeVar44 = ( vec3<f32>( 1.0 ) - nodeVar43 );
	nodeVar45 = nodeVar44;
	nodeVar46 = ( nodeVar39 / nodeVar45 );
	nodeVar47 = ( nodeVar46 * vec3<f32>( nodeVar42 ) );
	nodeVar48 = ( multiScattering + nodeVar47 );
	multiScattering = nodeVar48;
	indirectSpecular = vec3<f32>( 0.0, 0.0, 0.0 );
	radiance = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar49 = ( radiance * singleScattering );
	nodeVar50 = ( indirectSpecular + nodeVar49 );
	indirectSpecular = nodeVar50;
	iblIrradiance = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar51 = ( iblIrradiance * vec3<f32>( 0.3183098861837907 ) );
	nodeVar52 = ( multiScattering * nodeVar51 );
	nodeVar53 = ( indirectSpecular + nodeVar52 );
	indirectSpecular = nodeVar53;
	nodeVar54 = ( singleScattering + multiScattering );
	nodeVar55 = max( nodeVar54.x, nodeVar54.y );
	nodeVar56 = max( nodeVar55, nodeVar54.z );
	nodeVar57 = ( 1.0 - nodeVar56 );
	nodeVar58 = nodeVar57;
	nodeVar59 = ( DiffuseColor * vec4<f32>( nodeVar58 ) );
	nodeVar60 = ( nodeVar59 * vec4<f32>( nodeVar51, 1.0 ) );
	nodeVar61 = ( vec4<f32>( indirectDiffuse, 1.0 ) + nodeVar60 );
	indirectDiffuse = nodeVar61.xyz;
	ambientOcclusion = 1.0;
	nodeVar62 = ( indirectDiffuse * vec3<f32>( ambientOcclusion ) );
	indirectDiffuse = nodeVar62;
	nodeVar63 = dot( normalView, positionViewDirection );
	nodeVar64 = ( clamp( nodeVar63, 0.0, 1.0 ) + ambientOcclusion );
	nodeVar65 = ( Roughness * -16.0 );
	nodeVar66 = ( 1.0 - nodeVar65 );
	nodeVar67 = nodeVar66;
	nodeVar68 = ( - nodeVar67 );
	nodeVar69 = exp2( nodeVar68 );
	nodeVar70 = pow( nodeVar64, nodeVar69 );
	nodeVar71 = ( 1.0 - nodeVar70 );
	nodeVar72 = nodeVar71;
	nodeVar73 = ( ambientOcclusion - nodeVar72 );
	nodeVar74 = ( indirectSpecular * vec3<f32>( clamp( nodeVar73, 0.0, 1.0 ) ) );
	indirectSpecular = nodeVar74;
	nodeVar75 = ( directDiffuse + indirectDiffuse );
	totalDiffuse = nodeVar75;
	nodeVar76 = ( directSpecular + indirectSpecular );
	totalSpecular = nodeVar76;
	nodeVar77 = ( totalDiffuse + totalSpecular );
	outgoingLight = nodeVar77;
	nodeVar78 = max( vec4<f32>( ( outgoingLight + EmissiveColor ), DiffuseColor.w ), vec4<f32>( 0.0 ) );
	Output = nodeVar78;

	// result

	output.color = nodeVar78;

	return output;

}
