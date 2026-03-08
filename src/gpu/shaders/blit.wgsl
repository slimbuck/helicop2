struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        // Fullscreen triangle
        var positions = array<vec2<f32>, 3>(
                vec2<f32>(-1.0, -1.0),
                vec2<f32>(3.0, -1.0),
                vec2<f32>(-1.0, 3.0)
        );
        
        var uvs = array<vec2<f32>, 3>(
                vec2<f32>(0.0, 1.0),
                vec2<f32>(2.0, 1.0),
                vec2<f32>(0.0, -1.0)
        );
        
        var output: VertexOutput;
        output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
        output.uv = uvs[vertexIndex];
        return output;
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
        return textureSample(inputTex, inputSampler, input.uv);
}
