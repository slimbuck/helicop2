import { Entity } from './entity';
import { VoxelShapes, VoxelColor } from '../gpu/voxelPipeline';
import { Vec3 } from '../math';
import { Input } from '../input';
import type { World } from './world';

export interface Building {
  min: Vec3;
  max: Vec3;
}

export interface StageDef {
  name: string;
  buildings: Building[];
  groundMin: Vec3;
  groundMax: Vec3;
}

export class Stage extends Entity {
  private buildings: Building[] = [];
  private groundMin: Vec3;
  private groundMax: Vec3;

  constructor(world: World, def: StageDef) {
    super(world, def.name);
    
    this.buildings = def.buildings;
    this.groundMin = def.groundMin;
    this.groundMax = def.groundMax;
    
    // Add building collisions to rigid body physics
    for (const building of this.buildings) {
      world.physics.addStaticBox(building.min, building.max);
    }
    
    // Keep verlet physics ground for trees
    world.verletPhysics.addGroundPlane(0);
  }

  update(_dt: number, _input: Input): void {
    // Stage is static
  }

  render(shapes: VoxelShapes): void {
    // Render a small landing pad
    shapes.box(
      new Vec3(-15, 0, -8),
      new Vec3(15, 0.5, 8),
      VoxelColor.DarkGray
    );
    
    // Render buildings
    for (const building of this.buildings) {
      shapes.box(building.min, building.max, VoxelColor.LightGray);
    }
  }

  static createDefaultStage(): StageDef {
    return {
      name: 'default',
      groundMin: new Vec3(-50, -1, -20),
      groundMax: new Vec3(50, 0, 20),
      buildings: [
        { min: new Vec3(25, 0, -10), max: new Vec3(35, 12, 0) },
        { min: new Vec3(45, 0, 5), max: new Vec3(55, 16, 12) },
        { min: new Vec3(70, 0, -8), max: new Vec3(82, 20, 4) },
        { min: new Vec3(95, 0, 6), max: new Vec3(105, 10, 14) },
      ]
    };
  }
}
