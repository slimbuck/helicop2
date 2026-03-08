import { GPUContext } from './gpu/context';
import { VoxelPipeline } from './gpu/voxelPipeline';
import { Input } from './input';
import { World } from './game/world';

class Game {
  private canvas: HTMLCanvasElement;
  private gpuContext: GPUContext | null = null;
  private pipeline: VoxelPipeline | null = null;
  private input: Input;
  private world: World | null = null;
  
  private lastTime = 0;
  private frameCount = 0;
  private fpsTime = 0;
  private fpsElement: HTMLElement | null;
  private statusElement: HTMLElement | null;
  private btnPhysics: HTMLButtonElement | null;

  constructor() {
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.fpsElement = document.getElementById('toolbar-fps');
    this.statusElement = document.getElementById('status');
    this.btnPhysics = document.getElementById('btn-physics') as HTMLButtonElement;
    this.input = new Input(this.canvas);
    
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setupToolbar();
  }

  private setupToolbar(): void {
    if (this.btnPhysics) {
      this.btnPhysics.addEventListener('click', () => {
        if (this.world) {
          this.world.debugPhysics = !this.world.debugPhysics;
          this.btnPhysics!.classList.toggle('active', this.world.debugPhysics);
        }
      });
    }
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(window.innerWidth * dpr);
    const height = Math.floor(window.innerHeight * dpr);
    
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;

    if (this.pipeline) {
      this.pipeline.resize(width, height);
    }
  }

  async init(): Promise<boolean> {
    if (!navigator.gpu) {
      this.showError();
      return false;
    }

    try {
      this.gpuContext = new GPUContext();
      await this.gpuContext.init(this.canvas);
      
      this.pipeline = new VoxelPipeline(this.gpuContext);
      await this.pipeline.init();
      this.pipeline.resize(this.canvas.width, this.canvas.height);
      
      this.world = new World(this.pipeline);
      this.world.init();
      
      // Sync toolbar state
      if (this.btnPhysics) {
        this.btnPhysics.classList.toggle('active', this.world.debugPhysics);
      }
      
      return true;
    } catch (e) {
      console.error('Failed to initialize WebGPU:', e);
      this.showError();
      return false;
    }
  }

  private showError(): void {
    this.canvas.style.display = 'none';
    const error = document.getElementById('error');
    if (error) error.style.display = 'block';
  }

  start(): void {
    this.lastTime = performance.now();
    this.fpsTime = this.lastTime;
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(time: number): void {
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    this.frameCount++;
    if (time - this.fpsTime >= 1000) {
      if (this.fpsElement) {
        this.fpsElement.textContent = `FPS: ${this.frameCount}`;
      }
      this.frameCount = 0;
      this.fpsTime = time;
    }

    this.input.update(dt);
    
    if (this.world && this.pipeline) {
      this.world.update(dt, this.input);
      this.pipeline.render(this.world);
      
      // Render debug lines on top
      if (this.world.debugPhysics) {
        this.pipeline.renderLines(
          this.world.debugLines,
          this.world.cameraPos,
          this.world.cameraTarget
        );
      }
    }

    requestAnimationFrame((t) => this.loop(t));
  }
}

async function main(): Promise<void> {
  const game = new Game();
  if (await game.init()) {
    game.start();
  }
}

main();
