struct Uniforms {
    gridSize: vec3<u32>,
    pad: u32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var voxelGrid: texture_storage_3d<rgba8unorm, write>;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    if globalId.x >= uniforms.gridSize.x || 
       globalId.y >= uniforms.gridSize.y || 
       globalId.z >= uniforms.gridSize.z {
        return;
    }
    
    textureStore(voxelGrid, vec3<i32>(globalId), vec4<f32>(0.0, 0.0, 0.0, 0.0));
}
