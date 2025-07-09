use clap::{Parser, ValueEnum};
use std::fs;
use std::path::Path;
use std::process;

use wgsl_tool::{compile_shader, OutputFormat, OutputData};

#[derive(Debug, Clone, ValueEnum)]
enum CliOutputFormat {
    Wgsl,
    Spirv,
    SpirvAsm,
    Glsl,
    Hlsl,
    Metal,
}

impl From<CliOutputFormat> for OutputFormat {
    fn from(format: CliOutputFormat) -> Self {
        match format {
            CliOutputFormat::Wgsl => OutputFormat::Wgsl,
            CliOutputFormat::Spirv => OutputFormat::Spirv,
            CliOutputFormat::SpirvAsm => OutputFormat::SpirvAsm,
            CliOutputFormat::Glsl => OutputFormat::Glsl,
            CliOutputFormat::Hlsl => OutputFormat::Hlsl,
            CliOutputFormat::Metal => OutputFormat::Metal,
        }
    }
}

#[derive(Parser)]
#[command(
    name = "wgsl-tool",
    version = "1.0.0",
    about = "A tool to compile WGSL shaders to various output formats"
)]
struct Args {
    /// Input WGSL file
    input: String,

    /// Output format
    #[arg(short, long, value_enum, default_value_t = CliOutputFormat::Wgsl)]
    format: CliOutputFormat,

    /// Output file (optional, defaults to input with appropriate extension)
    #[arg(short, long)]
    output: Option<String>,

    /// Verbose output
    #[arg(short, long)]
    verbose: bool,
}

fn main() {
    let args = Args::parse();

    if args.verbose {
        println!("Input: {}", args.input);
        println!("Format: {:?}", args.format);
    }

    let input_path = Path::new(&args.input);
    if !input_path.exists() {
        eprintln!("Error: Input file '{}' not found", args.input);
        process::exit(1);
    }

    let output_format = OutputFormat::from(args.format);
    let output_path = get_output_path(&args.input, &args.output, &output_format);

    match compile_shader_file(&args.input, &output_path, &output_format, args.verbose) {
        Ok(()) => {
            println!("✓ Compiled '{}' -> '{}'", args.input, output_path);
        }
        Err(e) => {
            eprintln!("✗ Error: {}", e);
            process::exit(1);
        }
    }
}

fn get_output_path(input: &str, output: &Option<String>, format: &OutputFormat) -> String {
    if let Some(output) = output {
        return output.clone();
    }

    let input_path = Path::new(input);
    let stem = input_path.file_stem().unwrap().to_str().unwrap();
    let extension = format.extension();

    format!("{}.{}", stem, extension)
}

fn compile_shader_file(
    input_path: &str,
    output_path: &str,
    format: &OutputFormat,
    verbose: bool,
) -> Result<(), String> {
    // Read input
    if verbose {
        println!("Reading WGSL file...");
    }
    let wgsl_source = fs::read_to_string(input_path)
        .map_err(|e| format!("Failed to read input file: {}", e))?;

    // Compile using shared logic
    if verbose {
        println!("Compiling shader...");
    }
    let output_data = compile_shader(&wgsl_source, format)?;

    // Write output
    if verbose {
        println!("Writing output...");
    }
    match output_data {
        OutputData::Text(text) => {
            fs::write(output_path, text).map_err(|e| format!("Failed to write output: {}", e))?;
        }
        OutputData::Binary(bytes) => {
            fs::write(output_path, bytes).map_err(|e| format!("Failed to write output: {}", e))?;
        }
    }

    Ok(())
}
