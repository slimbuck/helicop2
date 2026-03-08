import { VoxelPipeline, VoxelShapes, VoxelColor, DebugLines } from '../gpu/voxelPipeline';
import { Vec3, damp } from '../math';
import { SimplePhysicsWorld } from '../physics/rigid';
import { PhysicsWorld } from '../physics/verlet';
import { Input } from '../input';
import { Entity } from './entity';
import { Helicopter } from './heli';
import { Stage } from './stage';
import { Tree } from './tree';

export class World {
    shapes: VoxelShapes;
    cameraPos: Vec3;
    cameraTarget: Vec3;
    
    physics: SimplePhysicsWorld;
    verletPhysics: PhysicsWorld;
    
    private pipeline: VoxelPipeline;
    private entities: Entity[] = [];
    private helicopter: Helicopter | null = null;
    
    // Camera smoothing
    private targetCameraPos = new Vec3();
    private targetCameraTarget = new Vec3();
    
    // Game timer
    private timer = 0;
    
    // Debug
    debugPhysics = false;
    debugLines = new DebugLines();

    constructor(pipeline: VoxelPipeline) {
        this.pipeline = pipeline;
        this.shapes = new VoxelShapes();
        this.cameraPos = new Vec3(-25, 20, 35);
        this.cameraTarget = new Vec3(0, 5, 0);
        this.physics = new SimplePhysicsWorld();
        this.verletPhysics = new PhysicsWorld();
    }

    init(): void {
        // Set up ground heightfield (flat for now)
        this.physics.setHeightfield((_x: number) => 0);
        
        // Create stage
        const stageDef = Stage.createDefaultStage();
        const stage = new Stage(this, stageDef);
        this.entities.push(stage);
        
        // Create helicopter
        this.helicopter = new Helicopter(this, new Vec3(0, 10, 0));
        this.entities.push(this.helicopter);
        
        // Register helicopter with physics (useSkidPoints=true for ground collision)
        this.physics.addBody(
            this.helicopter.body,
            Helicopter.HALF_EXTENTS,
            0.2,
            true  // Use skid points for ground collision
        );
        
        // Create some nearby trees
        const treePositions = [
            new Vec3(15, 0, 8),
            new Vec3(20, 0, -6),
        ];
        
        for (const pos of treePositions) {
            const tree = new Tree(this, pos);
            this.entities.push(tree);
        }
        
        // Initialize camera to follow helicopter
        if (this.helicopter) {
            const heliPos = this.helicopter.getPosition();
            this.targetCameraTarget.set(heliPos.x + 10, heliPos.y, 0);
            this.targetCameraPos.set(heliPos.x - 25, Math.max(heliPos.y + 15, 20), 35);
            this.cameraTarget.copy(this.targetCameraTarget);
            this.cameraPos.copy(this.targetCameraPos);
        }
    }

    update(dt: number, input: Input): void {
        this.timer += dt;
        
        // Update rigid body physics (helicopter)
        this.physics.step(dt);
        
        // Apply skid point collision for helicopter ground contact
        if (this.helicopter) {
            this.physics.collideSkidPoints(
                this.helicopter.body,
                this.helicopter.getSkidPoints(),
                0.2
            );
        }
        
        // Update verlet physics (trees)
        this.verletPhysics.step(dt);
        
        // Update all entities
        for (const entity of this.entities) {
            entity.update(dt, input);
        }
        
        // Update camera to follow helicopter
        this.updateCamera(dt);
        
        // Clear and render shapes
        this.shapes.clear();
        
        for (const entity of this.entities) {
            entity.render(this.shapes);
        }
        
        // Debug physics visualization
        this.debugLines.clear();
        if (this.debugPhysics) {
            this.physics.renderDebug(this.debugLines);
            
            // Draw skid contact points (green)
            if (this.helicopter) {
                const skidPoints = this.helicopter.getSkidPoints();
                for (const p of skidPoints) {
                    // Draw small cross at each skid point
                    const size = 0.5;
                    this.debugLines.line(
                        new Vec3(p.x - size, p.y, p.z),
                        new Vec3(p.x + size, p.y, p.z),
                        0, 1, 0
                    );
                    this.debugLines.line(
                        new Vec3(p.x, p.y - size, p.z),
                        new Vec3(p.x, p.y + size, p.z),
                        0, 1, 0
                    );
                    this.debugLines.line(
                        new Vec3(p.x, p.y, p.z - size),
                        new Vec3(p.x, p.y, p.z + size),
                        0, 1, 0
                    );
                }
            }
        }
    }

    private updateCamera(dt: number): void {
        if (!this.helicopter) return;
        
        const heliPos = this.helicopter.getPosition();
        
        // Side-on camera view (like classic Choplifter)
        this.targetCameraTarget.set(
            heliPos.x,
            heliPos.y + 5,
            0
        );
        
        this.targetCameraPos.set(
            heliPos.x,
            heliPos.y + 10,
            60
        );
        
        // Smooth camera movement
        const smoothing = 0.03;
        this.cameraPos.x = damp(this.cameraPos.x, this.targetCameraPos.x, smoothing, dt);
        this.cameraPos.y = damp(this.cameraPos.y, this.targetCameraPos.y, smoothing, dt);
        this.cameraPos.z = damp(this.cameraPos.z, this.targetCameraPos.z, smoothing, dt);
        
        this.cameraTarget.x = damp(this.cameraTarget.x, this.targetCameraTarget.x, smoothing, dt);
        this.cameraTarget.y = damp(this.cameraTarget.y, this.targetCameraTarget.y, smoothing, dt);
        this.cameraTarget.z = damp(this.cameraTarget.z, this.targetCameraTarget.z, smoothing, dt);
    }

    addEntity(entity: Entity): void {
        this.entities.push(entity);
    }

    removeEntity(entity: Entity): void {
        const index = this.entities.indexOf(entity);
        if (index !== -1) {
            this.entities.splice(index, 1);
        }
    }

    findEntity(name: string): Entity | undefined {
        return this.entities.find(e => e.name === name);
    }
}
