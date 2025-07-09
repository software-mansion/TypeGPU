use wgsl_tool::{compile_shader, OutputFormat, OutputData};

const SIMPLE_SHADER: &str = r#"
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
    let pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>( 0.0,  1.0)
    );
    return vec4<f32>(pos[vertex_index], 0.0, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}
"#;

#[test]
fn test_wgsl_output() {
    let result = compile_shader(SIMPLE_SHADER, &OutputFormat::Wgsl);
    assert!(result.is_ok());

    let output = result.unwrap();
    match output {
        OutputData::Text(text) => {
            assert!(text.contains("vs_main"));
            assert!(text.contains("fs_main"));
            assert!(text.contains("@vertex"));
            assert!(text.contains("@fragment"));
        }
        OutputData::Binary(_) => panic!("Expected text output for WGSL"),
    }
}

#[test]
fn test_spirv_binary_output() {
    let result = compile_shader(SIMPLE_SHADER, &OutputFormat::Spirv);
    assert!(result.is_ok());

    let output = result.unwrap();
    match output {
        OutputData::Binary(bytes) => {
            assert!(!bytes.is_empty());
            // Check SPIR-V magic number (0x07230203)
            assert_eq!(bytes[0], 0x03);
            assert_eq!(bytes[1], 0x02);
            assert_eq!(bytes[2], 0x23);
            assert_eq!(bytes[3], 0x07);
        }
        OutputData::Text(_) => panic!("Expected binary output for SPIR-V"),
    }
}

#[test]
fn test_spirv_asm_output() {
    let result = compile_shader(SIMPLE_SHADER, &OutputFormat::SpirvAsm);
    assert!(result.is_ok());

    let output = result.unwrap();
    match output {
        OutputData::Text(text) => {
            assert!(text.contains("; SPIR-V"));
            assert!(text.contains("OpCapability Shader"));
            assert!(text.contains("OpMemoryModel"));
            assert!(text.contains("OpEntryPoint"));
        }
        OutputData::Binary(_) => panic!("Expected text output for SPIR-V assembly"),
    }
}

#[test]
fn test_glsl_output() {
    let result = compile_shader(SIMPLE_SHADER, &OutputFormat::Glsl);
    assert!(result.is_ok());

    let output = result.unwrap();
    match output {
        OutputData::Text(text) => {
            assert!(text.contains("#version"));
            assert!(text.contains("void main()"));
            assert!(text.contains("gl_Position"));
        }
        OutputData::Binary(_) => panic!("Expected text output for GLSL"),
    }
}

#[test]
fn test_hlsl_output() {
    let result = compile_shader(SIMPLE_SHADER, &OutputFormat::Hlsl);
    assert!(result.is_ok());

    let output = result.unwrap();
    match output {
        OutputData::Text(text) => {
            assert!(text.contains("vs_main"));
            assert!(text.contains("fs_main"));
            assert!(text.contains("SV_Position"));
            assert!(text.contains("SV_Target0"));
        }
        OutputData::Binary(_) => panic!("Expected text output for HLSL"),
    }
}

#[test]
fn test_metal_output() {
    let result = compile_shader(SIMPLE_SHADER, &OutputFormat::Metal);
    assert!(result.is_ok());

    let output = result.unwrap();
    match output {
        OutputData::Text(text) => {
            assert!(text.contains("metal_stdlib"));
            assert!(text.contains("vertex"));
            assert!(text.contains("fragment"));
            assert!(text.contains("vs_main"));
            assert!(text.contains("fs_main"));
        }
        OutputData::Binary(_) => panic!("Expected text output for Metal"),
    }
}

#[test]
fn test_output_format_extensions() {
    assert_eq!(OutputFormat::Wgsl.extension(), "wgsl");
    assert_eq!(OutputFormat::Spirv.extension(), "spv");
    assert_eq!(OutputFormat::SpirvAsm.extension(), "spvasm");
    assert_eq!(OutputFormat::Glsl.extension(), "glsl");
    assert_eq!(OutputFormat::Hlsl.extension(), "hlsl");
    assert_eq!(OutputFormat::Metal.extension(), "metal");
}

#[test]
fn test_output_format_from_str() {
    assert!(matches!(OutputFormat::from("wgsl"), OutputFormat::Wgsl));
    assert!(matches!(OutputFormat::from("spirv"), OutputFormat::Spirv));
    assert!(matches!(OutputFormat::from("spirv-asm"), OutputFormat::SpirvAsm));
    assert!(matches!(OutputFormat::from("spv-asm"), OutputFormat::SpirvAsm));
    assert!(matches!(OutputFormat::from("glsl"), OutputFormat::Glsl));
    assert!(matches!(OutputFormat::from("hlsl"), OutputFormat::Hlsl));
    assert!(matches!(OutputFormat::from("metal"), OutputFormat::Metal));

    // Test case insensitive
    assert!(matches!(OutputFormat::from("WGSL"), OutputFormat::Wgsl));
    assert!(matches!(OutputFormat::from("SPIRV"), OutputFormat::Spirv));

    // Test default fallback
    assert!(matches!(OutputFormat::from("unknown"), OutputFormat::Wgsl));
}

#[test]
fn test_output_data_methods() {
    let text_data = OutputData::Text("hello".to_string());
    assert_eq!(text_data.as_bytes(), b"hello");
    assert_eq!(text_data.as_string().unwrap(), "hello");

    let binary_data = OutputData::Binary(vec![72, 101, 108, 108, 111]); // "Hello" in bytes
    assert_eq!(binary_data.as_bytes(), vec![72, 101, 108, 108, 111]);
    assert_eq!(binary_data.as_string().unwrap(), "Hello");
}

#[test]
fn test_invalid_shader() {
    let invalid_shader = "this is not valid wgsl";
    let result = compile_shader(invalid_shader, &OutputFormat::Wgsl);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("Failed to parse WGSL"));
}
