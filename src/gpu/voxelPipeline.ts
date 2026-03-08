import { GPUContext } from './context';
import { Vec3, Mat4 } from '../math';

import clearShaderCode from './shaders/clear.wgsl?raw';
import rasterizeShaderCode from './shaders/rasterize.wgsl?raw';
import raycastShaderCode from './shaders/raycast.wgsl?raw';
import blitShaderCode from './shaders/blit.wgsl?raw';
import linesShaderCode from './shaders/lines.wgsl?raw';

export const enum ShapeType {
    Point = 0,
    Line = 1,
    Box = 2,
    Sphere = 3,
    OBB = 4,
}

export const enum VoxelColor {
    Black = 1,
    DarkGray = 2,
    LightGray = 3,
    OffWhite = 4,
    White = 5,
    Red = 6,
    Green = 7,
    Blue = 8,
    Purple = 9,
    Brown = 10,
    LightBlue = 11,
    Skin = 12,
    Yellow = 13,
    Gray = 14,
}

const SHAPE_STRIDE = 112; // 4 + 4 + 4 + 4 + 24*4 = 112 bytes per shape
const MAX_SHAPES = 4096;

export interface ShapeCommand {
    type: ShapeType;
    color: number;
    data: number[];
}

export class DebugLines {
    private vertices: number[] = [];

    clear(): void {
        this.vertices = [];
    }

    line(p0: Vec3, p1: Vec3, r: number, g: number, b: number): void {
        this.vertices.push(p0.x, p0.y, p0.z, r, g, b);
        this.vertices.push(p1.x, p1.y, p1.z, r, g, b);
    }

    wireBox(min: Vec3, max: Vec3, r: number, g: number, b: number): void {
        // Bottom face
        this.line(new Vec3(min.x, min.y, min.z), new Vec3(max.x, min.y, min.z), r, g, b);
        this.line(new Vec3(max.x, min.y, min.z), new Vec3(max.x, min.y, max.z), r, g, b);
        this.line(new Vec3(max.x, min.y, max.z), new Vec3(min.x, min.y, max.z), r, g, b);
        this.line(new Vec3(min.x, min.y, max.z), new Vec3(min.x, min.y, min.z), r, g, b);
        // Top face
        this.line(new Vec3(min.x, max.y, min.z), new Vec3(max.x, max.y, min.z), r, g, b);
        this.line(new Vec3(max.x, max.y, min.z), new Vec3(max.x, max.y, max.z), r, g, b);
        this.line(new Vec3(max.x, max.y, max.z), new Vec3(min.x, max.y, max.z), r, g, b);
        this.line(new Vec3(min.x, max.y, max.z), new Vec3(min.x, max.y, min.z), r, g, b);
        // Vertical edges
        this.line(new Vec3(min.x, min.y, min.z), new Vec3(min.x, max.y, min.z), r, g, b);
        this.line(new Vec3(max.x, min.y, min.z), new Vec3(max.x, max.y, min.z), r, g, b);
        this.line(new Vec3(max.x, min.y, max.z), new Vec3(max.x, max.y, max.z), r, g, b);
        this.line(new Vec3(min.x, min.y, max.z), new Vec3(min.x, max.y, max.z), r, g, b);
    }

    wireSphere(center: Vec3, radius: number, r: number, g: number, b: number, segments = 12): void {
        const step = (Math.PI * 2) / segments;
        
        // XY circle (front view)
        for (let i = 0; i < segments; i++) {
            const a0 = i * step;
            const a1 = (i + 1) * step;
            this.line(
                new Vec3(center.x + Math.cos(a0) * radius, center.y + Math.sin(a0) * radius, center.z),
                new Vec3(center.x + Math.cos(a1) * radius, center.y + Math.sin(a1) * radius, center.z),
                r, g, b
            );
        }
        
        // XZ circle (top view)
        for (let i = 0; i < segments; i++) {
            const a0 = i * step;
            const a1 = (i + 1) * step;
            this.line(
                new Vec3(center.x + Math.cos(a0) * radius, center.y, center.z + Math.sin(a0) * radius),
                new Vec3(center.x + Math.cos(a1) * radius, center.y, center.z + Math.sin(a1) * radius),
                r, g, b
            );
        }
        
        // YZ circle (side view)
        for (let i = 0; i < segments; i++) {
            const a0 = i * step;
            const a1 = (i + 1) * step;
            this.line(
                new Vec3(center.x, center.y + Math.cos(a0) * radius, center.z + Math.sin(a0) * radius),
                new Vec3(center.x, center.y + Math.cos(a1) * radius, center.z + Math.sin(a1) * radius),
                r, g, b
            );
        }
    }

    getVertices(): Float32Array {
        return new Float32Array(this.vertices);
    }

    getVertexCount(): number {
        return this.vertices.length / 6;
    }
}

export class VoxelShapes {
    private commands: ShapeCommand[] = [];

    clear(): void {
        this.commands = [];
    }

    point(pos: Vec3, color: number): void {
        this.commands.push({
            type: ShapeType.Point,
            color,
            data: [pos.x, pos.y, pos.z]
        });
    }

    line(p0: Vec3, p1: Vec3, color: number): void {
        this.commands.push({
            type: ShapeType.Line,
            color,
            data: [p0.x, p0.y, p0.z, p1.x, p1.y, p1.z]
        });
    }

    box(min: Vec3, max: Vec3, color: number): void {
        this.commands.push({
            type: ShapeType.Box,
            color,
            data: [min.x, min.y, min.z, max.x, max.y, max.z]
        });
    }

    sphere(center: Vec3, radius: number, color: number): void {
        this.commands.push({
            type: ShapeType.Sphere,
            color,
            data: [center.x, center.y, center.z, radius]
        });
    }

    obb(pos: Vec3, extents: Vec3, rotationMatrix: number[], color: number): void {
        this.commands.push({
            type: ShapeType.OBB,
            color,
            data: [
                pos.x, pos.y, pos.z,
                extents.x, extents.y, extents.z,
                ...rotationMatrix.slice(0, 9)
            ]
        });
    }

    getCommands(): ShapeCommand[] {
        return this.commands;
    }
}

export interface World {
    shapes: VoxelShapes;
    cameraPos: Vec3;
    cameraTarget: Vec3;
}

export class VoxelPipeline {
    private gpu: GPUContext;
    
    // Grid settings
    private gridSize = { x: 256, y: 128, z: 128 };
    private voxelScale = 1.5;
    
    // Textures
    private voxelTexture!: GPUTexture;
    private outputTexture!: GPUTexture;
    private outputTextureView!: GPUTextureView;
    
    // Buffers
    private shapeBuffer!: GPUBuffer;
    private clearUniformBuffer!: GPUBuffer;
    private rasterUniformBuffer!: GPUBuffer;
    private cameraUniformBuffer!: GPUBuffer;
    private voxelUniformBuffer!: GPUBuffer;
    
    // Pipelines
    private clearPipeline!: GPUComputePipeline;
    private rasterPipeline!: GPUComputePipeline;
    private raycastPipeline!: GPUComputePipeline;
    private blitPipeline!: GPURenderPipeline;
    
    // Bind groups
    private clearBindGroup!: GPUBindGroup;
    private rasterBindGroup!: GPUBindGroup;
    private raycastBindGroup!: GPUBindGroup;
    private blitBindGroup!: GPUBindGroup;
    
    // Sampler
    private sampler!: GPUSampler;
    private outputSampler!: GPUSampler;
    
    // Screen dimensions
    private screenWidth = 1;
    private screenHeight = 1;
    
    // Line rendering
    private linePipeline!: GPURenderPipeline;
    private lineUniformBuffer!: GPUBuffer;
    private lineBindGroup!: GPUBindGroup;
    private lineVertexBuffer!: GPUBuffer;
    private maxLineVertices = 8192;

    constructor(gpu: GPUContext) {
        this.gpu = gpu;
    }

    async init(): Promise<void> {
        const device = this.gpu.device;
        
        // Create voxel 3D texture
        this.voxelTexture = device.createTexture({
            size: [this.gridSize.x, this.gridSize.y, this.gridSize.z],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
            dimension: '3d'
        });
        
        // Create samplers
        this.sampler = device.createSampler({
            magFilter: 'nearest',
            minFilter: 'nearest'
        });
        
        this.outputSampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear'
        });
        
        // Create shape buffer
        this.shapeBuffer = device.createBuffer({
            size: MAX_SHAPES * SHAPE_STRIDE,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        
        // Create uniform buffers
        this.clearUniformBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        this.rasterUniformBuffer = device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        this.cameraUniformBuffer = device.createBuffer({
            size: 192, // Added target vec3 + padding
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        this.voxelUniformBuffer = device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        // Create pipelines
        await this.createClearPipeline();
        await this.createRasterPipeline();
        await this.createRaycastPipeline();
        await this.createBlitPipeline();
        await this.createLinePipeline();
        
        // Initialize clear uniform buffer
        device.queue.writeBuffer(
            this.clearUniformBuffer, 0,
            new Uint32Array([this.gridSize.x, this.gridSize.y, this.gridSize.z, 0])
        );
    }

    private async createClearPipeline(): Promise<void> {
        const device = this.gpu.device;
        
        const shaderModule = device.createShaderModule({
            code: clearShaderCode
        });
        
        const bindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm', viewDimension: '3d' } }
            ]
        });
        
        this.clearPipeline = device.createComputePipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
            compute: { module: shaderModule, entryPoint: 'main' }
        });
        
        this.clearBindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.clearUniformBuffer } },
                { binding: 1, resource: this.voxelTexture.createView() }
            ]
        });
    }

    private async createRasterPipeline(): Promise<void> {
        const device = this.gpu.device;
        
        const shaderModule = device.createShaderModule({
            code: rasterizeShaderCode
        });
        
        const bindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm', viewDimension: '3d' } }
            ]
        });
        
        this.rasterPipeline = device.createComputePipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
            compute: { module: shaderModule, entryPoint: 'main' }
        });
        
        this.rasterBindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.rasterUniformBuffer } },
                { binding: 1, resource: { buffer: this.shapeBuffer } },
                { binding: 2, resource: this.voxelTexture.createView() }
            ]
        });
    }

    private async createRaycastPipeline(): Promise<void> {
        const device = this.gpu.device;
        
        const shaderModule = device.createShaderModule({
            code: raycastShaderCode
        });
        
        this.raycastBindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float', viewDimension: '3d' } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, sampler: { type: 'filtering' } },
                { binding: 4, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm', viewDimension: '2d' } }
            ]
        });
        
        this.raycastPipeline = device.createComputePipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [this.raycastBindGroupLayout] }),
            compute: { module: shaderModule, entryPoint: 'main' }
        });
    }

    private raycastBindGroupLayout!: GPUBindGroupLayout;
    private blitBindGroupLayout!: GPUBindGroupLayout;

    private async createBlitPipeline(): Promise<void> {
        const device = this.gpu.device;
        
        const shaderModule = device.createShaderModule({
            code: blitShaderCode
        });
        
        this.blitBindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
            ]
        });
        
        this.blitPipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [this.blitBindGroupLayout] }),
            vertex: {
                module: shaderModule,
                entryPoint: 'vertexMain'
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fragmentMain',
                targets: [{ format: this.gpu.format }]
            },
            primitive: {
                topology: 'triangle-list'
            }
        });
    }

    private async createLinePipeline(): Promise<void> {
        const device = this.gpu.device;
        
        const shaderModule = device.createShaderModule({
            code: linesShaderCode
        });
        
        // Create uniform buffer for viewProj matrix
        this.lineUniformBuffer = device.createBuffer({
            size: 64, // mat4x4
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        // Create vertex buffer
        this.lineVertexBuffer = device.createBuffer({
            size: this.maxLineVertices * 6 * 4, // 6 floats per vertex
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        
        const bindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }
            ]
        });
        
        this.lineBindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.lineUniformBuffer } }
            ]
        });
        
        this.linePipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 24, // 6 floats * 4 bytes
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position
                        { shaderLocation: 1, offset: 12, format: 'float32x3' }  // color
                    ]
                }]
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format: this.gpu.format }]
            },
            primitive: {
                topology: 'line-list'
            },
            depthStencil: undefined
        });
    }

    resize(width: number, height: number): void {
        this.screenWidth = width;
        this.screenHeight = height;
        
        if (this.outputTexture) {
            this.outputTexture.destroy();
        }
        
        this.outputTexture = this.gpu.device.createTexture({
            size: [width, height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });
        
        this.outputTextureView = this.outputTexture.createView();
        
        this.updateBindGroups();
    }

    private updateBindGroups(): void {
        const device = this.gpu.device;
        
        this.raycastBindGroup = device.createBindGroup({
            layout: this.raycastBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
                { binding: 1, resource: { buffer: this.voxelUniformBuffer } },
                { binding: 2, resource: this.voxelTexture.createView() },
                { binding: 3, resource: this.sampler },
                { binding: 4, resource: this.outputTextureView }
            ]
        });
        
        this.blitBindGroup = device.createBindGroup({
            layout: this.blitBindGroupLayout,
            entries: [
                { binding: 0, resource: this.outputTextureView },
                { binding: 1, resource: this.outputSampler }
            ]
        });
    }

    private frameCount = 0;
    
    render(world: World): void {
        const device = this.gpu.device;
        const commands = world.shapes.getCommands();
        
        // Center grid around camera target, snapped to voxel boundaries to prevent aliasing
        const voxelWorldSize = 1 / this.voxelScale;
        const snap = (v: number) => Math.floor(v / voxelWorldSize) * voxelWorldSize;
        const gridOffset = new Vec3(
            snap(world.cameraTarget.x - this.gridSize.x / (2 * this.voxelScale)),
            snap(-this.gridSize.y / (2 * this.voxelScale)),
            snap(-this.gridSize.z / (2 * this.voxelScale))
        );
        
        this.frameCount++;
        
        // Upload shapes
        if (commands.length > 0) {
            const shapeData = new ArrayBuffer(commands.length * SHAPE_STRIDE);
            const view = new DataView(shapeData);
            
            for (let i = 0; i < commands.length; i++) {
                const cmd = commands[i];
                const offset = i * SHAPE_STRIDE;
                
                view.setUint32(offset + 0, cmd.type, true);
                view.setUint32(offset + 4, cmd.color, true);
                view.setUint32(offset + 8, 0, true); // pad
                view.setUint32(offset + 12, 0, true); // pad
                
                for (let j = 0; j < cmd.data.length && j < 24; j++) {
                    view.setFloat32(offset + 16 + j * 4, cmd.data[j], true);
                }
            }
            
            device.queue.writeBuffer(this.shapeBuffer, 0, shapeData);
        }
        
        // Update raster uniforms
        const rasterUniforms = new ArrayBuffer(32);
        const rasterView = new DataView(rasterUniforms);
        rasterView.setUint32(0, this.gridSize.x, true);
        rasterView.setUint32(4, this.gridSize.y, true);
        rasterView.setUint32(8, this.gridSize.z, true);
        rasterView.setUint32(12, commands.length, true);
        rasterView.setFloat32(16, gridOffset.x, true);
        rasterView.setFloat32(20, gridOffset.y, true);
        rasterView.setFloat32(24, gridOffset.z, true);
        rasterView.setFloat32(28, this.voxelScale, true);
        device.queue.writeBuffer(this.rasterUniformBuffer, 0, rasterUniforms);
        
        // Update voxel uniforms
        const voxelUniforms = new ArrayBuffer(32);
        const voxelView = new DataView(voxelUniforms);
        voxelView.setUint32(0, this.gridSize.x, true);
        voxelView.setUint32(4, this.gridSize.y, true);
        voxelView.setUint32(8, this.gridSize.z, true);
        voxelView.setUint32(12, 0, true);
        voxelView.setFloat32(16, gridOffset.x, true);
        voxelView.setFloat32(20, gridOffset.y, true);
        voxelView.setFloat32(24, gridOffset.z, true);
        voxelView.setFloat32(28, this.voxelScale, true);
        device.queue.writeBuffer(this.voxelUniformBuffer, 0, voxelUniforms);
        
        // Update camera uniforms
        this.updateCameraUniforms(world.cameraPos, world.cameraTarget);
        
        // Create command encoder
        const encoder = device.createCommandEncoder();
        
        // Clear pass
        const clearPass = encoder.beginComputePass();
        clearPass.setPipeline(this.clearPipeline);
        clearPass.setBindGroup(0, this.clearBindGroup);
        clearPass.dispatchWorkgroups(
            Math.ceil(this.gridSize.x / 4),
            Math.ceil(this.gridSize.y / 4),
            Math.ceil(this.gridSize.z / 4)
        );
        clearPass.end();
        
        // Rasterize pass
        if (commands.length > 0) {
            const rasterPass = encoder.beginComputePass();
            rasterPass.setPipeline(this.rasterPipeline);
            rasterPass.setBindGroup(0, this.rasterBindGroup);
            rasterPass.dispatchWorkgroups(Math.ceil(commands.length / 64));
            rasterPass.end();
        }
        
        // Raycast pass
        const raycastPass = encoder.beginComputePass();
        raycastPass.setPipeline(this.raycastPipeline);
        raycastPass.setBindGroup(0, this.raycastBindGroup);
        raycastPass.dispatchWorkgroups(
            Math.ceil(this.screenWidth / 8),
            Math.ceil(this.screenHeight / 8)
        );
        raycastPass.end();
        
        // Blit pass
        const textureView = this.gpu.context.getCurrentTexture().createView();
        const blitPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });
        blitPass.setPipeline(this.blitPipeline);
        blitPass.setBindGroup(0, this.blitBindGroup);
        blitPass.draw(3);
        blitPass.end();
        
        device.queue.submit([encoder.finish()]);
    }

    renderLines(debugLines: DebugLines, cameraPos: Vec3, cameraTarget: Vec3): void {
        const vertexCount = debugLines.getVertexCount();
        if (vertexCount === 0) {
            console.log('renderLines: no vertices');
            return;
        }
        
        const device = this.gpu.device;
        const vertices = debugLines.getVertices();
        
        // Update vertex buffer
        device.queue.writeBuffer(this.lineVertexBuffer, 0, vertices);
        
        // Update line uniform buffer with viewProj matrix
        const aspect = this.screenWidth / this.screenHeight;
        const fov = 60 * Math.PI / 180;
        const near = 0.1;
        const far = 500;
        
        const viewMatrix = new Mat4().lookAt(cameraPos, cameraTarget, new Vec3(0, 1, 0));
        const projMatrix = new Mat4().perspective(fov, aspect, near, far);
        const viewProjMatrix = this.multiplyMatrices(projMatrix, viewMatrix);
        
        // Transpose for column-major (WGSL)
        const transposed = this.transposeMatrix(viewProjMatrix.m);
        device.queue.writeBuffer(this.lineUniformBuffer, 0, new Float32Array(transposed));
        
        // Render lines
        const encoder = device.createCommandEncoder();
        const textureView = this.gpu.context.getCurrentTexture().createView();
        
        const linePass = encoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                loadOp: 'load',
                storeOp: 'store'
            }]
        });
        linePass.setPipeline(this.linePipeline);
        linePass.setBindGroup(0, this.lineBindGroup);
        linePass.setVertexBuffer(0, this.lineVertexBuffer);
        linePass.draw(vertexCount);
        linePass.end();
        
        device.queue.submit([encoder.finish()]);
    }

    private transposeMatrix(m: number[]): number[] {
        return [
            m[0], m[4], m[8], m[12],
            m[1], m[5], m[9], m[13],
            m[2], m[6], m[10], m[14],
            m[3], m[7], m[11], m[15]
        ];
    }

    private updateCameraUniforms(cameraPos: Vec3, cameraTarget: Vec3): void {
        const aspect = this.screenWidth / this.screenHeight;
        const fov = 60 * Math.PI / 180;
        const near = 0.1;
        const far = 500;
        
        const viewMatrix = new Mat4().lookAt(cameraPos, cameraTarget, new Vec3(0, 1, 0));
        const projMatrix = new Mat4().perspective(fov, aspect, near, far);
        
        // Combine view and projection
        const viewProjMatrix = this.multiplyMatrices(projMatrix, viewMatrix);
        const invViewProjMatrix = this.invertMatrix(viewProjMatrix);
        
        const uniforms = new ArrayBuffer(192);
        const view = new DataView(uniforms);
        
        // WGSL expects column-major matrices, so transpose from row-major
        // viewProj (64 bytes) - write in column-major order
        for (let col = 0; col < 4; col++) {
            for (let row = 0; row < 4; row++) {
                view.setFloat32((col * 4 + row) * 4, viewProjMatrix.m[row * 4 + col], true);
            }
        }
        
        // invViewProj (64 bytes) - write in column-major order
        for (let col = 0; col < 4; col++) {
            for (let row = 0; row < 4; row++) {
                view.setFloat32(64 + (col * 4 + row) * 4, invViewProjMatrix.m[row * 4 + col], true);
            }
        }
        
        // position (12 bytes) + fov (4 bytes)
        view.setFloat32(128, cameraPos.x, true);
        view.setFloat32(132, cameraPos.y, true);
        view.setFloat32(136, cameraPos.z, true);
        view.setFloat32(140, fov, true);
        
        // screenSize (8 bytes) + near (4 bytes) + far (4 bytes)
        view.setFloat32(144, this.screenWidth, true);
        view.setFloat32(148, this.screenHeight, true);
        view.setFloat32(152, near, true);
        view.setFloat32(156, far, true);
        
        // target (12 bytes) + padding (4 bytes)
        view.setFloat32(160, cameraTarget.x, true);
        view.setFloat32(164, cameraTarget.y, true);
        view.setFloat32(168, cameraTarget.z, true);
        view.setFloat32(172, 0, true); // padding
        
        this.gpu.device.queue.writeBuffer(this.cameraUniformBuffer, 0, uniforms);
    }

    private multiplyMatrices(a: Mat4, b: Mat4): Mat4 {
        const result = new Mat4();
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                result.m[i * 4 + j] = 
                    a.m[i * 4 + 0] * b.m[0 * 4 + j] +
                    a.m[i * 4 + 1] * b.m[1 * 4 + j] +
                    a.m[i * 4 + 2] * b.m[2 * 4 + j] +
                    a.m[i * 4 + 3] * b.m[3 * 4 + j];
            }
        }
        return result;
    }

    private invertMatrix(m: Mat4): Mat4 {
        const result = new Mat4();
        const inv = result.m;
        const src = m.m;
        
        inv[0] = src[5] * src[10] * src[15] - src[5] * src[11] * src[14] - src[9] * src[6] * src[15] + src[9] * src[7] * src[14] + src[13] * src[6] * src[11] - src[13] * src[7] * src[10];
        inv[4] = -src[4] * src[10] * src[15] + src[4] * src[11] * src[14] + src[8] * src[6] * src[15] - src[8] * src[7] * src[14] - src[12] * src[6] * src[11] + src[12] * src[7] * src[10];
        inv[8] = src[4] * src[9] * src[15] - src[4] * src[11] * src[13] - src[8] * src[5] * src[15] + src[8] * src[7] * src[13] + src[12] * src[5] * src[11] - src[12] * src[7] * src[9];
        inv[12] = -src[4] * src[9] * src[14] + src[4] * src[10] * src[13] + src[8] * src[5] * src[14] - src[8] * src[6] * src[13] - src[12] * src[5] * src[10] + src[12] * src[6] * src[9];
        inv[1] = -src[1] * src[10] * src[15] + src[1] * src[11] * src[14] + src[9] * src[2] * src[15] - src[9] * src[3] * src[14] - src[13] * src[2] * src[11] + src[13] * src[3] * src[10];
        inv[5] = src[0] * src[10] * src[15] - src[0] * src[11] * src[14] - src[8] * src[2] * src[15] + src[8] * src[3] * src[14] + src[12] * src[2] * src[11] - src[12] * src[3] * src[10];
        inv[9] = -src[0] * src[9] * src[15] + src[0] * src[11] * src[13] + src[8] * src[1] * src[15] - src[8] * src[3] * src[13] - src[12] * src[1] * src[11] + src[12] * src[3] * src[9];
        inv[13] = src[0] * src[9] * src[14] - src[0] * src[10] * src[13] - src[8] * src[1] * src[14] + src[8] * src[2] * src[13] + src[12] * src[1] * src[10] - src[12] * src[2] * src[9];
        inv[2] = src[1] * src[6] * src[15] - src[1] * src[7] * src[14] - src[5] * src[2] * src[15] + src[5] * src[3] * src[14] + src[13] * src[2] * src[7] - src[13] * src[3] * src[6];
        inv[6] = -src[0] * src[6] * src[15] + src[0] * src[7] * src[14] + src[4] * src[2] * src[15] - src[4] * src[3] * src[14] - src[12] * src[2] * src[7] + src[12] * src[3] * src[6];
        inv[10] = src[0] * src[5] * src[15] - src[0] * src[7] * src[13] - src[4] * src[1] * src[15] + src[4] * src[3] * src[13] + src[12] * src[1] * src[7] - src[12] * src[3] * src[5];
        inv[14] = -src[0] * src[5] * src[14] + src[0] * src[6] * src[13] + src[4] * src[1] * src[14] - src[4] * src[2] * src[13] - src[12] * src[1] * src[6] + src[12] * src[2] * src[5];
        inv[3] = -src[1] * src[6] * src[11] + src[1] * src[7] * src[10] + src[5] * src[2] * src[11] - src[5] * src[3] * src[10] - src[9] * src[2] * src[7] + src[9] * src[3] * src[6];
        inv[7] = src[0] * src[6] * src[11] - src[0] * src[7] * src[10] - src[4] * src[2] * src[11] + src[4] * src[3] * src[10] + src[8] * src[2] * src[7] - src[8] * src[3] * src[6];
        inv[11] = -src[0] * src[5] * src[11] + src[0] * src[7] * src[9] + src[4] * src[1] * src[11] - src[4] * src[3] * src[9] - src[8] * src[1] * src[7] + src[8] * src[3] * src[5];
        inv[15] = src[0] * src[5] * src[10] - src[0] * src[6] * src[9] - src[4] * src[1] * src[10] + src[4] * src[2] * src[9] + src[8] * src[1] * src[6] - src[8] * src[2] * src[5];
        
        let det = src[0] * inv[0] + src[1] * inv[4] + src[2] * inv[8] + src[3] * inv[12];
        if (det === 0) {
            return result.identity();
        }
        
        det = 1.0 / det;
        for (let i = 0; i < 16; i++) {
            inv[i] *= det;
        }
        
        return result;
    }
}
