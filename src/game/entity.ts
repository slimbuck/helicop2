import { VoxelShapes } from '../gpu/voxelPipeline';
import { Input } from '../input';
import type { World } from './world';

export abstract class Entity {
  protected world: World;
  name: string;

  constructor(world: World, name: string) {
    this.world = world;
    this.name = name;
  }

  abstract update(dt: number, input: Input): void;
  abstract render(shapes: VoxelShapes): void;
}
