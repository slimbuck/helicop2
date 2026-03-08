export class GPUContext {
    device!: GPUDevice;
    context!: GPUCanvasContext;
    format!: GPUTextureFormat;
    adapter!: GPUAdapter;

    async init(canvas: HTMLCanvasElement): Promise<void> {
        const adapter = await navigator.gpu.requestAdapter({
            powerPreference: 'high-performance'
        });
        
        if (!adapter) {
            throw new Error('No WebGPU adapter found');
        }
        
        this.adapter = adapter;
        
        this.device = await adapter.requestDevice({
            requiredFeatures: [],
            requiredLimits: {
                maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
                maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
            }
        });

        this.device.lost.then((info) => {
            console.error('WebGPU device lost:', info.message);
        });

        const context = canvas.getContext('webgpu');
        if (!context) {
            throw new Error('Failed to get WebGPU context');
        }
        
        this.context = context;
        this.format = navigator.gpu.getPreferredCanvasFormat();
        
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied'
        });
    }

    createBuffer(
        data: ArrayBuffer | ArrayBufferView,
        usage: GPUBufferUsageFlags
    ): GPUBuffer {
        const buffer = this.device.createBuffer({
            size: data.byteLength,
            usage,
            mappedAtCreation: true
        });
        
        const arrayBuffer = buffer.getMappedRange();
        if (data instanceof ArrayBuffer) {
            new Uint8Array(arrayBuffer).set(new Uint8Array(data));
        } else {
            new Uint8Array(arrayBuffer).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        }
        buffer.unmap();
        
        return buffer;
    }

    createEmptyBuffer(size: number, usage: GPUBufferUsageFlags): GPUBuffer {
        return this.device.createBuffer({ size, usage });
    }
}
