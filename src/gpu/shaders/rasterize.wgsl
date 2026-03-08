// Shape types matching TypeScript enum
const SHAPE_POINT: u32 = 0u;
const SHAPE_LINE: u32 = 1u;
const SHAPE_BOX: u32 = 2u;
const SHAPE_SPHERE: u32 = 3u;
const SHAPE_OBB: u32 = 4u;

struct ShapeCommand {
        shapeType: u32,
        color: u32,
        pad0: u32,
        pad1: u32,
        data: array<f32, 24>,  // Position, size, rotation data (96 bytes)
}

struct Uniforms {
        gridSize: vec3<u32>,
        numShapes: u32,
        gridOffset: vec3<f32>,
        voxelScale: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> shapes: array<ShapeCommand>;
@group(0) @binding(2) var voxelGrid: texture_storage_3d<rgba8unorm, write>;

fn worldToVoxel(worldPos: vec3<f32>) -> vec3<i32> {
        let localPos = (worldPos - uniforms.gridOffset) * uniforms.voxelScale;
        return vec3<i32>(floor(localPos));
}

fn isInBounds(voxelPos: vec3<i32>) -> bool {
        return voxelPos.x >= 0 && voxelPos.x < i32(uniforms.gridSize.x) &&
                      voxelPos.y >= 0 && voxelPos.y < i32(uniforms.gridSize.y) &&
                      voxelPos.z >= 0 && voxelPos.z < i32(uniforms.gridSize.z);
}

fn colorToVec4(colorIndex: u32) -> vec4<f32> {
        // Palette matching VoxelClr from C++ (indexed colors)
        switch colorIndex {
                case 1u: { return vec4<f32>(0.05, 0.05, 0.05, 1.0); }  // Black
                case 2u: { return vec4<f32>(0.25, 0.25, 0.25, 1.0); }  // DarkGray
                case 3u: { return vec4<f32>(0.65, 0.65, 0.65, 1.0); }  // LightGray
                case 4u: { return vec4<f32>(0.9, 0.9, 0.85, 1.0); }    // OffWhite
                case 5u: { return vec4<f32>(1.0, 1.0, 1.0, 1.0); }     // White
                case 6u: { return vec4<f32>(0.9, 0.2, 0.2, 1.0); }     // Red
                case 7u: { return vec4<f32>(0.2, 0.7, 0.2, 1.0); }     // Green
                case 8u: { return vec4<f32>(0.2, 0.3, 0.9, 1.0); }     // Blue
                case 9u: { return vec4<f32>(0.6, 0.2, 0.7, 1.0); }     // Purple
                case 10u: { return vec4<f32>(0.5, 0.3, 0.15, 1.0); }   // Brown
                case 11u: { return vec4<f32>(0.5, 0.7, 0.95, 1.0); }   // LightBlue
                case 12u: { return vec4<f32>(0.95, 0.75, 0.6, 1.0); }  // Skin
                case 13u: { return vec4<f32>(0.95, 0.9, 0.2, 1.0); }   // Yellow
                case 14u: { return vec4<f32>(0.5, 0.5, 0.5, 1.0); }    // Gray
                default: { return vec4<f32>(0.0, 0.0, 0.0, 0.0); }     // Transparent
        }
}

fn setVoxel(voxelPos: vec3<i32>, color: vec4<f32>) {
        if isInBounds(voxelPos) {
                textureStore(voxelGrid, voxelPos, color);
        }
}

fn rasterizePoint(shape: ShapeCommand) {
        let pos = vec3<f32>(shape.data[0], shape.data[1], shape.data[2]);
        let voxelPos = worldToVoxel(pos);
        let color = colorToVec4(shape.color);
        setVoxel(voxelPos, color);
}

fn rasterizeLine(shape: ShapeCommand) {
        let p0 = vec3<f32>(shape.data[0], shape.data[1], shape.data[2]);
        let p1 = vec3<f32>(shape.data[3], shape.data[4], shape.data[5]);
        let color = colorToVec4(shape.color);
        
        let dir = p1 - p0;
        let len = length(dir);
        let steps = i32(len * uniforms.voxelScale) + 1;
        
        for (var i = 0; i <= steps; i++) {
                let t = f32(i) / f32(max(steps, 1));
                let pos = p0 + dir * t;
                let voxelPos = worldToVoxel(pos);
                setVoxel(voxelPos, color);
        }
}

fn rasterizeBox(shape: ShapeCommand) {
        let minPos = vec3<f32>(shape.data[0], shape.data[1], shape.data[2]);
        let maxPos = vec3<f32>(shape.data[3], shape.data[4], shape.data[5]);
        let color = colorToVec4(shape.color);
        
        var vMin = worldToVoxel(minPos);
        var vMax = worldToVoxel(maxPos);
        
        // Clamp to grid bounds
        vMin = max(vMin, vec3<i32>(0));
        vMax = min(vMax, vec3<i32>(uniforms.gridSize) - vec3<i32>(1));
        
        // Limit iteration count to prevent GPU hangs
        let maxIter = 64;
        let xRange = min(vMax.x - vMin.x + 1, maxIter);
        let yRange = min(vMax.y - vMin.y + 1, maxIter);
        let zRange = min(vMax.z - vMin.z + 1, maxIter);
        
        for (var dz = 0; dz < zRange; dz++) {
                for (var dy = 0; dy < yRange; dy++) {
                        for (var dx = 0; dx < xRange; dx++) {
                                setVoxel(vec3<i32>(vMin.x + dx, vMin.y + dy, vMin.z + dz), color);
                        }
                }
        }
}

fn rasterizeSphere(shape: ShapeCommand) {
        let center = vec3<f32>(shape.data[0], shape.data[1], shape.data[2]);
        let radius = shape.data[3];
        let color = colorToVec4(shape.color);
        
        let vCenter = worldToVoxel(center);
        let vRadius = min(i32(ceil(radius * uniforms.voxelScale)), 32);
        let radiusSq = radius * radius;
        
        for (var z = -vRadius; z <= vRadius; z++) {
                for (var y = -vRadius; y <= vRadius; y++) {
                        for (var x = -vRadius; x <= vRadius; x++) {
                                let localPos = vec3<f32>(f32(x), f32(y), f32(z)) / uniforms.voxelScale;
                                let distSq = localPos.x * localPos.x + localPos.y * localPos.y + localPos.z * localPos.z;
                                if distSq <= radiusSq {
                                        let voxelPos = vCenter + vec3<i32>(x, y, z);
                                        setVoxel(voxelPos, color);
                                }
                        }
                }
        }
}

fn rasterizeOBB(shape: ShapeCommand) {
        // OBB: position (0-2), extents (3-5), rotation matrix (6-14)
        let pos = vec3<f32>(shape.data[0], shape.data[1], shape.data[2]);
        let extents = vec3<f32>(shape.data[3], shape.data[4], shape.data[5]);
        let color = colorToVec4(shape.color);
        
        // Rotation matrix columns
        let rotX = vec3<f32>(shape.data[6], shape.data[7], shape.data[8]);
        let rotY = vec3<f32>(shape.data[9], shape.data[10], shape.data[11]);
        let rotZ = vec3<f32>(shape.data[12], shape.data[13], shape.data[14]);
        
        // Compute world-space bounding box for the OBB
        let absRotX = abs(rotX);
        let absRotY = abs(rotY);
        let absRotZ = abs(rotZ);
        
        let worldExtent = vec3<f32>(
                dot(absRotX, extents),
                dot(absRotY, extents),
                dot(absRotZ, extents)
        );
        
        var vMin = worldToVoxel(pos - worldExtent);
        var vMax = worldToVoxel(pos + worldExtent);
        
        // Clamp to grid bounds
        vMin = max(vMin, vec3<i32>(0));
        vMax = min(vMax, vec3<i32>(uniforms.gridSize) - vec3<i32>(1));
        
        // Limit iteration count
        let maxIter = 48;
        let xRange = min(vMax.x - vMin.x + 1, maxIter);
        let yRange = min(vMax.y - vMin.y + 1, maxIter);
        let zRange = min(vMax.z - vMin.z + 1, maxIter);
        
        // Inverse rotation (transpose since it's orthonormal)
        let invRotX = vec3<f32>(rotX.x, rotY.x, rotZ.x);
        let invRotY = vec3<f32>(rotX.y, rotY.y, rotZ.y);
        let invRotZ = vec3<f32>(rotX.z, rotY.z, rotZ.z);
        
        for (var dz = 0; dz < zRange; dz++) {
                for (var dy = 0; dy < yRange; dy++) {
                        for (var dx = 0; dx < xRange; dx++) {
                                let x = vMin.x + dx;
                                let y = vMin.y + dy;
                                let z = vMin.z + dz;
                                
                                // Convert voxel back to world space
                                let worldPos = uniforms.gridOffset + vec3<f32>(f32(x), f32(y), f32(z)) / uniforms.voxelScale;
                                let localDir = worldPos - pos;
                                
                                // Transform to local OBB space
                                let localPos = vec3<f32>(
                                        dot(invRotX, localDir),
                                        dot(invRotY, localDir),
                                        dot(invRotZ, localDir)
                                );
                                
                                // Check if inside OBB
                                if abs(localPos.x) <= extents.x && 
                                      abs(localPos.y) <= extents.y && 
                                      abs(localPos.z) <= extents.z {
                                        setVoxel(vec3<i32>(x, y, z), color);
                                }
                        }
                }
        }
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
        let shapeIndex = globalId.x;
        if shapeIndex >= uniforms.numShapes {
                return;
        }
        
        let shape = shapes[shapeIndex];
        
        switch shape.shapeType {
                case SHAPE_POINT: { rasterizePoint(shape); }
                case SHAPE_LINE: { rasterizeLine(shape); }
                case SHAPE_BOX: { rasterizeBox(shape); }
                case SHAPE_SPHERE: { rasterizeSphere(shape); }
                case SHAPE_OBB: { rasterizeOBB(shape); }
                default: {}
        }
}
