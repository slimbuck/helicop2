import { Entity } from './entity';
import { VoxelShapes, VoxelColor } from '../gpu/voxelPipeline';
import { Vec3 } from '../math';
import { VerletBody } from '../physics/verlet';
import { Input } from '../input';
import type { World } from './world';

export class Tree extends Entity {
    body: VerletBody;
    private placement: Vec3;

    constructor(world: World, position: Vec3) {
        super(world, 'tree');
        
        this.placement = position.clone();
        this.body = this.createBody();
        this.body.reset(position);
        
        world.verletPhysics.addBody(this.body);
        
        // Register collision shapes with physics world
        // Trunk collision box
        world.physics.addStaticBox(
            new Vec3(position.x - 1, position.y, position.z - 1),
            new Vec3(position.x + 1, position.y + 8, position.z + 1)
        );
        // Foliage collision spheres
        world.physics.addStaticSphere(new Vec3(position.x, position.y + 10, position.z), 3);
        world.physics.addStaticSphere(new Vec3(position.x + 2, position.y + 8, position.z), 2.5);
        world.physics.addStaticSphere(new Vec3(position.x - 2, position.y + 8, position.z), 2.5);
    }

    private createBody(): VerletBody {
        const body = new VerletBody();
        
        // Base points (fixed)
        body.addPoint(0, 0, 0, true);    // 0
        body.addPoint(2, 0, 0, true);    // 1
        body.addPoint(0, 0, 2, true);    // 2
        
        // Trunk top (fixed)
        body.addPoint(0, 5, 0, true);    // 3
        body.addPoint(2, 5, 0, true);    // 4
        body.addPoint(0, 5, 2, true);    // 5
        
        // Foliage points (dynamic)
        body.addPoint(0, 12, 0);         // 6
        body.addPoint(3, 9, 0);          // 7
        body.addPoint(-3, 9, 0);         // 8
        body.addPoint(0, 8, 0);          // 9
        
        // Edges connecting foliage to trunk
        for (let i = 6; i <= 9; i++) {
            for (let j = 0; j <= 2; j++) {
                body.addEdge(i, j, 0.3);
            }
            for (let j = 3; j <= 5; j++) {
                body.addEdge(i, j, 0.5);
            }
        }
        
        body.gravityFactor = 0.3;
        body.dragFactor = 0.05;
        
        return body;
    }

    update(_dt: number, _input: Input): void {
        // Trees are mostly static, but foliage can sway
    }

    render(shapes: VoxelShapes): void {
        const pos = this.placement;
        const identityMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];
        
        // Trunk - brown box
        shapes.obb(
            new Vec3(pos.x, pos.y + 4, pos.z),
            new Vec3(1, 4, 1),
            identityMatrix,
            VoxelColor.Brown
        );
        
        // Foliage - green spheres
        shapes.sphere(new Vec3(pos.x, pos.y + 10, pos.z), 3, VoxelColor.Green);
        shapes.sphere(new Vec3(pos.x + 2, pos.y + 8, pos.z), 2.5, VoxelColor.Green);
        shapes.sphere(new Vec3(pos.x - 2, pos.y + 8, pos.z), 2.5, VoxelColor.Green);
    }
}
