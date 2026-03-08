import { Entity } from './entity';
import { VoxelShapes, VoxelColor } from '../gpu/voxelPipeline';
import { Vec3, damp, clamp } from '../math';
import { RigidBody } from '../physics/rigid';
import { Input } from '../input';
import type { World } from './world';

export class Helicopter extends Entity {
  body: RigidBody;
  
  // Control state
  private rotorPos = 0;
  private rotorSpeed = 0;
  
  // State
  destroyed = false;
  damage = 0;
  
  // Collision half-extents
  static readonly HALF_EXTENTS = new Vec3(4, 3, 3);
  
  // Skid contact points in local space (for ground collision)
  static readonly SKID_POINTS = [
    new Vec3(-4, -3.5, -3),  // back-left
    new Vec3(-4, -3.5, 3),   // back-right
    new Vec3(4, -3.5, -3),   // front-left
    new Vec3(4, -3.5, 3),    // front-right
  ];

  constructor(world: World, position: Vec3) {
    super(world, 'helicopter');
    
    this.body = new RigidBody();
    this.body.reset(position);
    this.body.drag = 0.03;
    this.body.angularDrag = 0.08;
  }

  update(dt: number, input: Input): void {
    if (this.destroyed) {
      this.rotorSpeed = damp(this.rotorSpeed, 0, 0.1, dt);
      this.rotorPos += this.rotorSpeed * dt;
      return;
    }
    
    const thrust = input.thrust;
    const tilt = input.roll;
    
    // Target angle based on tilt input (max ~40 degrees)
    const maxTilt = 0.7;
    const targetAngle = -tilt * maxTilt;
    
    // PD controller for angle stabilization
    const kP = 25;
    const kD = 10;
    const angleError = targetAngle - this.body.angle;
    const torque = kP * angleError - kD * this.body.angularVel;
    this.body.applyTorque(torque);
    
    // Clamp angle to prevent flipping
    this.body.angle = clamp(this.body.angle, -1.0, 1.0);
    
    // Apply thrust in helicopter's "up" direction
    if (thrust) {
      const verticalThrust = 28.5;  // upward lift
      const horizontalThrust = 114; // sideways from tilt
      const cosA = Math.cos(this.body.angle);
      const sinA = Math.sin(this.body.angle);
      
      // Thrust vector rotated by helicopter angle
      const thrustForce = new Vec3(
        -sinA * horizontalThrust,
        cosA * verticalThrust,
        0
      );
      this.body.applyForce(thrustForce);
    }
    
    // Constrain Z position (2.5D)
    this.body.position.z = clamp(this.body.position.z, -2, 2);
    this.body.velocity.z *= 0.9;
    
    // Update rotor animation
    this.rotorSpeed = damp(this.rotorSpeed, thrust ? 1 : 0.3, 0.1, dt);
    this.rotorPos += this.rotorSpeed * dt;
  }

  private transformLocal(local: Vec3, cosA: number, sinA: number): Vec3 {
    const pos = this.body.position;
    return new Vec3(
      pos.x + local.x * cosA - local.y * sinA,
      pos.y + local.x * sinA + local.y * cosA,
      pos.z + local.z
    );
  }

  render(shapes: VoxelShapes): void {
    const angle = this.body.angle;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    
    // Rotation matrix for OBBs (rotates around Z axis)
    const rotMatrix = [
      cosA, -sinA, 0,
      sinA, cosA, 0,
      0, 0, 1
    ];
    
    // Main body - white sphere (cockpit) at center
    shapes.sphere(this.transformLocal(new Vec3(0, 0, 0), cosA, sinA), 3, VoxelColor.White);
    
    // Skids (landing gear) - red bars under the helicopter
    shapes.obb(
      this.transformLocal(new Vec3(0, -3, -3), cosA, sinA),
      new Vec3(4, 0.5, 0.5),
      rotMatrix,
      VoxelColor.Red
    );
    shapes.obb(
      this.transformLocal(new Vec3(0, -3, 3), cosA, sinA),
      new Vec3(4, 0.5, 0.5),
      rotMatrix,
      VoxelColor.Red
    );
    
    // Tail boom - red bar behind
    shapes.obb(
      this.transformLocal(new Vec3(-6, 0.5, 0), cosA, sinA),
      new Vec3(4, 0.5, 0.5),
      rotMatrix,
      VoxelColor.Red
    );
    
    // Rotor hub position (above cockpit)
    const rotorLocal = new Vec3(0, 3.5, 0);
    const rotorWorld = this.transformLocal(rotorLocal, cosA, sinA);
    const rotorSpinning = this.rotorSpeed > 0.5;
    
    if (rotorSpinning) {
      shapes.obb(
        rotorWorld,
        new Vec3(6, 0.3, 6),
        rotMatrix,
        VoxelColor.LightBlue
      );
    } else {
      const bladeAngle = this.rotorPos * Math.PI * 2;
      const bladeLen = 6;
      
      for (let i = 0; i < 2; i++) {
        const a = bladeAngle + i * Math.PI;
        const dx = Math.cos(a) * bladeLen;
        const dz = Math.sin(a) * bladeLen;
        
        shapes.line(
          new Vec3(rotorWorld.x - dx, rotorWorld.y, rotorWorld.z - dz),
          new Vec3(rotorWorld.x + dx, rotorWorld.y, rotorWorld.z + dz),
          VoxelColor.LightBlue
        );
      }
    }
    
    // Tail rotor (at end of tail boom) - spins in XY plane (flat in Z)
    const tailRotorPos = this.transformLocal(new Vec3(-10, 1, 2), cosA, sinA);
    const tailRotorAngle = this.rotorPos * Math.PI * 8; // Spin faster than main rotor
    const tCos = Math.cos(tailRotorAngle);
    const tSin = Math.sin(tailRotorAngle);
    
    // Combined rotation: helicopter tilt (around Z) then tail rotor spin (around Z)
    const tailRotMatrix = [
      cosA * tCos - sinA * tSin, -(cosA * tSin + sinA * tCos), 0,
      sinA * tCos + cosA * tSin, -sinA * tSin + cosA * tCos, 0,
      0, 0, 1
    ];
    
    // Draw two blades
    shapes.obb(
      tailRotorPos,
      new Vec3(2.5, 0.3, 0.2),
      tailRotMatrix,
      VoxelColor.LightBlue
    );
    shapes.obb(
      tailRotorPos,
      new Vec3(0.3, 2.5, 0.2),
      tailRotMatrix,
      VoxelColor.LightBlue
    );
  }

  getPosition(): Vec3 {
    return this.body.position.clone();
  }

  getSkidPoints(): Vec3[] {
    const cosA = Math.cos(this.body.angle);
    const sinA = Math.sin(this.body.angle);
    return Helicopter.SKID_POINTS.map(p => this.transformLocal(p, cosA, sinA));
  }
}
