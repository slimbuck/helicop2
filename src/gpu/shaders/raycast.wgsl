struct Camera {
    viewProj: mat4x4<f32>,
    invViewProj: mat4x4<f32>,
    position: vec3<f32>,
    fov: f32,
    screenSize: vec2<f32>,
    near: f32,
    far: f32,
    lookAt: vec3<f32>,
    _pad: f32,
}

struct VoxelUniforms {
    gridSize: vec3<u32>,
    pad0: u32,
    gridOffset: vec3<f32>,
    voxelScale: f32,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> voxelUniforms: VoxelUniforms;
@group(0) @binding(2) var voxelGrid: texture_3d<f32>;
@group(0) @binding(3) var voxelSampler: sampler;
@group(0) @binding(4) var outputTex: texture_storage_2d<rgba8unorm, write>;

const MAX_STEPS: i32 = 256;
const SKY_COLOR: vec3<f32> = vec3<f32>(0.4, 0.6, 0.9);
const LIGHT_DIR: vec3<f32> = vec3<f32>(0.4, 0.3, 0.86);
const AMBIENT: f32 = 0.4;

fn getRay(pixelCoord: vec2<f32>) -> vec3<f32> {
    // UV from 0 to 1
    let uv = pixelCoord / camera.screenSize;
    
    // Convert to normalized device coordinates (-1 to 1)
    let ndc = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
    
    // Calculate camera basis vectors
    let forward = normalize(camera.lookAt - camera.position);
    let worldUp = vec3<f32>(0.0, 1.0, 0.0);
    let right = normalize(cross(forward, worldUp));
    let up = cross(right, forward);
    
    // Calculate ray direction using FOV and aspect ratio
    // FOV applies to largest axis (horizontal in landscape, vertical in portrait)
    let aspect = camera.screenSize.x / camera.screenSize.y;
    let tanHalfFov = tan(camera.fov * 0.5);
    let scale = max(aspect, 1.0);
    
    // Offset from center based on pixel position
    let horizontal = right * (ndc.x * tanHalfFov * aspect / scale);
    let vertical = up * (ndc.y * tanHalfFov / scale);
    
    return normalize(forward + horizontal + vertical);
}

fn worldToGrid(worldPos: vec3<f32>) -> vec3<f32> {
    return (worldPos - voxelUniforms.gridOffset) * voxelUniforms.voxelScale;
}

fn gridToWorld(gridPos: vec3<f32>) -> vec3<f32> {
    return gridPos / voxelUniforms.voxelScale + voxelUniforms.gridOffset;
}

fn sampleVoxel(gridPos: vec3<i32>) -> vec4<f32> {
    if gridPos.x < 0 || gridPos.x >= i32(voxelUniforms.gridSize.x) ||
       gridPos.y < 0 || gridPos.y >= i32(voxelUniforms.gridSize.y) ||
       gridPos.z < 0 || gridPos.z >= i32(voxelUniforms.gridSize.z) {
        return vec4<f32>(0.0);
    }
    return textureLoad(voxelGrid, gridPos, 0);
}

fn intersectBox(rayOrigin: vec3<f32>, rayDir: vec3<f32>, boxMin: vec3<f32>, boxMax: vec3<f32>) -> vec2<f32> {
    let invDir = 1.0 / rayDir;
    let t1 = (boxMin - rayOrigin) * invDir;
    let t2 = (boxMax - rayOrigin) * invDir;
    let tMin = min(t1, t2);
    let tMax = max(t1, t2);
    let tNear = max(max(tMin.x, tMin.y), tMin.z);
    let tFar = min(min(tMax.x, tMax.y), tMax.z);
    return vec2<f32>(tNear, tFar);
}

fn calculateNormal(gridPos: vec3<i32>) -> vec3<f32> {
    // Simple gradient-based normal calculation
    let dx = sampleVoxel(gridPos + vec3<i32>(1, 0, 0)).a - sampleVoxel(gridPos - vec3<i32>(1, 0, 0)).a;
    let dy = sampleVoxel(gridPos + vec3<i32>(0, 1, 0)).a - sampleVoxel(gridPos - vec3<i32>(0, 1, 0)).a;
    let dz = sampleVoxel(gridPos + vec3<i32>(0, 0, 1)).a - sampleVoxel(gridPos - vec3<i32>(0, 0, 1)).a;
    
    let normal = normalize(vec3<f32>(-dx, -dy, -dz));
    if length(normal) < 0.001 {
        return vec3<f32>(0.0, 1.0, 0.0);
    }
    return normal;
}

fn calculateAO(gridPos: vec3<i32>) -> f32 {
    var occlusion = 0.0;
    let samples = array<vec3<i32>, 6>(
        vec3<i32>(1, 0, 0), vec3<i32>(-1, 0, 0),
        vec3<i32>(0, 1, 0), vec3<i32>(0, -1, 0),
        vec3<i32>(0, 0, 1), vec3<i32>(0, 0, -1)
    );
    
    for (var i = 0; i < 6; i++) {
        if sampleVoxel(gridPos + samples[i]).a > 0.0 {
            occlusion += 1.0;
        }
    }
    
    return 1.0 - occlusion * 0.1;
}

fn raycastVoxels(rayOrigin: vec3<f32>, rayDir: vec3<f32>) -> vec4<f32> {
    let gridMin = vec3<f32>(0.0);
    let gridMax = vec3<f32>(voxelUniforms.gridSize);
    
    // Transform ray to grid space
    let gridOrigin = worldToGrid(rayOrigin);
    // Scale ray direction to grid space (direction stays same, just different coordinate system)
    let gridRayDir = rayDir * voxelUniforms.voxelScale;
    let gridRayDirNorm = normalize(gridRayDir);
    
    // Intersect with grid bounds
    let tBounds = intersectBox(gridOrigin, gridRayDirNorm, gridMin, gridMax);
    
    if tBounds.x > tBounds.y || tBounds.y < 0.0 {
        // No grid intersection - render ground plane
        return renderGround(rayOrigin, rayDir);
    }
    
    let tStart = max(tBounds.x, 0.0) + 0.01;
    let tEnd = tBounds.y;
    
    // DDA ray marching in grid space
    var pos = gridOrigin + gridRayDirNorm * tStart;
    var voxelPos = vec3<i32>(floor(pos));
    
    let step = vec3<i32>(sign(gridRayDirNorm));
    let tDelta = abs(1.0 / gridRayDirNorm);
    
    // Calculate initial tMax for each axis (distance to next voxel boundary)
    // When moving in positive direction, next boundary is ceil; in negative, it's floor
    var tMaxVec = vec3<f32>(
        select(f32(voxelPos.x) + 1.0 - pos.x, pos.x - f32(voxelPos.x), gridRayDirNorm.x < 0.0),
        select(f32(voxelPos.y) + 1.0 - pos.y, pos.y - f32(voxelPos.y), gridRayDirNorm.y < 0.0),
        select(f32(voxelPos.z) + 1.0 - pos.z, pos.z - f32(voxelPos.z), gridRayDirNorm.z < 0.0)
    );
    tMaxVec = tMaxVec * tDelta;
    
    var t = tStart;
    var hitNormal = vec3<f32>(0.0, 1.0, 0.0);
    
    for (var i = 0; i < MAX_STEPS; i++) {
        if t > tEnd {
            break;
        }
        
        // Bounds check
        if voxelPos.x < 0 || voxelPos.x >= i32(voxelUniforms.gridSize.x) ||
           voxelPos.y < 0 || voxelPos.y >= i32(voxelUniforms.gridSize.y) ||
           voxelPos.z < 0 || voxelPos.z >= i32(voxelUniforms.gridSize.z) {
            break;
        }
        
        let voxel = textureLoad(voxelGrid, voxelPos, 0);
        if voxel.a > 0.01 {
            // Hit! Calculate lighting using face normal
            let nDotL = max(dot(hitNormal, LIGHT_DIR), 0.0);
            let lighting = AMBIENT + (1.0 - AMBIENT) * nDotL;
            
            // Apply depth fog based on Z distance from camera (far side = more fog)
            let hitWorldPos = gridToWorld(vec3<f32>(voxelPos));
            let fogDepth = max(0.0, -hitWorldPos.z);  // fog increases as Z goes negative (away from camera)
            let fogFactor = 1.0 - exp(-fogDepth * 0.08);  // exponential fog
            let fog = 1.0 - clamp(fogFactor, 0.0, 0.5);
            
            let color = voxel.rgb * lighting;
            let finalColor = mix(SKY_COLOR, color, fog);
            
            return vec4<f32>(finalColor, 1.0);
        }
        
        // Advance to next voxel (DDA)
        if tMaxVec.x < tMaxVec.y {
            if tMaxVec.x < tMaxVec.z {
                voxelPos.x += step.x;
                t = tMaxVec.x;
                tMaxVec.x += tDelta.x;
                hitNormal = vec3<f32>(-f32(step.x), 0.0, 0.0);
            } else {
                voxelPos.z += step.z;
                t = tMaxVec.z;
                tMaxVec.z += tDelta.z;
                hitNormal = vec3<f32>(0.0, 0.0, -f32(step.z));
            }
        } else {
            if tMaxVec.y < tMaxVec.z {
                voxelPos.y += step.y;
                t = tMaxVec.y;
                tMaxVec.y += tDelta.y;
                hitNormal = vec3<f32>(0.0, -f32(step.y), 0.0);
            } else {
                voxelPos.z += step.z;
                t = tMaxVec.z;
                tMaxVec.z += tDelta.z;
                hitNormal = vec3<f32>(0.0, 0.0, -f32(step.z));
            }
        }
    }
    
    // No voxel hit - render ground plane
    return renderGround(rayOrigin, rayDir);
}

fn renderGround(rayOrigin: vec3<f32>, rayDir: vec3<f32>) -> vec4<f32> {
    // Ground plane at y=0
    if rayDir.y < -0.001 {
        let groundY = 0.0;
        let tGround = (groundY - rayOrigin.y) / rayDir.y;
        if tGround > 0.0 && tGround < 300.0 {
            let hitPos = rayOrigin + rayDir * tGround;
            
            // Checkered grass pattern
            let cx = i32(floor(hitPos.x * 0.2));
            let cz = i32(floor(hitPos.z * 0.2));
            let checker = (cx + cz) & 1;
            let groundColor = select(
                vec3<f32>(0.25, 0.55, 0.2),   // Grass green
                vec3<f32>(0.2, 0.45, 0.15),    // Darker grass
                checker == 1
            );
            
            // Depth fog based on Z distance from camera (far side = more fog)
            let fogDepth = max(0.0, -hitPos.z);  // fog increases as Z goes negative (away from camera)
            let fogFactor = 1.0 - exp(-fogDepth * 0.08);  // exponential fog
            let fog = 1.0 - clamp(fogFactor, 0.0, 0.6);
            return vec4<f32>(mix(SKY_COLOR, groundColor, fog), 1.0);
        }
    }
    
    // Sky gradient
    let skyT = clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0);
    let skyGradient = mix(
        vec3<f32>(0.7, 0.8, 0.95),   // Horizon
        vec3<f32>(0.3, 0.5, 0.9),     // Zenith
        skyT
    );
    return vec4<f32>(skyGradient, 1.0);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let pixelCoord = vec2<f32>(f32(globalId.x), f32(globalId.y));
    
    if pixelCoord.x >= camera.screenSize.x || pixelCoord.y >= camera.screenSize.y {
        return;
    }
    
    let rayDir = getRay(pixelCoord + vec2<f32>(0.5));
    let color = raycastVoxels(camera.position, rayDir);
    
    // Gamma correction
    let gammaCorrected = pow(color.rgb, vec3<f32>(1.0 / 2.2));
    
    textureStore(outputTex, vec2<i32>(globalId.xy), vec4<f32>(gammaCorrected, color.a));
}
