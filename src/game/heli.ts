import { Entity } from './entity';
import { VoxelShapes, VoxelColor } from '../gpu/voxelPipeline';
import { Vec3, damp, clamp } from '../math';
import { RigidBody } from '../physics/rigid';
import { Input } from '../input';
import type { World } from './world';

// Rotor tuning parameters
const ROTOR_CONFIG = {
    spinUpTime: 2.0,      // seconds from 0 to full speed
    spinDownTime: 4.0,    // seconds from full to 0
    blurRPS: 8,           // rotations per second at full speed
    
    // Easing curve for rotor acceleration (t: 0-1 -> output: 0-1)
    // Starts slow, accelerates in middle, slows near max (like real turbine)
    spinCurve: (t: number) => t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2,  // ease-in-out quad
    
    // Curve mapping rotor speed (0-1) to thrust multiplier (0-1)
    // Can be tuned for game feel
    thrustCurve: (rotorSpeed: number) => rotorSpeed * rotorSpeed,  // quadratic
};

export class Helicopter extends Entity {
    body: RigidBody;
    
    // Rotor state
    private rotorPos = 0;      // blade rotation position
    private rotorT = 0;        // normalized rotor progress (0 = stopped, 1 = full)
    private rotorSpeed = 0;    // actual rotor speed after curve applied
    
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
        // Update rotor first (needed for thrust calculation)
        this.updateRotor(dt, input.thrust);
        
        if (this.destroyed) {
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
        
        // Apply thrust in helicopter's "up" direction, scaled by thrust curve
        if (thrust) {
            const thrustScale = ROTOR_CONFIG.thrustCurve(this.rotorSpeed);
            if (thrustScale > 0.01) {
                const verticalThrust = 30 * thrustScale;
                const horizontalThrust = 60 * thrustScale;
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
        }
        
        // Constrain Z position (2.5D)
        this.body.position.z = clamp(this.body.position.z, -2, 2);
        this.body.velocity.z *= 0.9;
    }
    
    private updateRotor(dt: number, thrust: boolean): void {
        const wantsRotor = thrust || !this.body.grounded;
        
        if (this.destroyed) {
            // Spin down when destroyed
            this.rotorT = Math.max(0, this.rotorT - dt / ROTOR_CONFIG.spinDownTime);
        } else if (wantsRotor && this.rotorT < 1) {
            // Spinning up
            this.rotorT = Math.min(1, this.rotorT + dt / ROTOR_CONFIG.spinUpTime);
        } else if (!wantsRotor && this.rotorT > 0) {
            // Spinning down
            this.rotorT = Math.max(0, this.rotorT - dt / ROTOR_CONFIG.spinDownTime);
        }
        
        // Apply easing curve to get actual rotor speed
        this.rotorSpeed = ROTOR_CONFIG.spinCurve(this.rotorT);
        
        // Update blade rotation position (scaled by blurRPS for visual speed)
        this.rotorPos += this.rotorSpeed * ROTOR_CONFIG.blurRPS * dt;
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
        
        // Helper: rotation matrix for XZ plane (around Y) combined with helicopter tilt (around Z)
        const xzRotMatrix = (angle: number) => {
            const c = Math.cos(angle), s = Math.sin(angle);
            return [
                cosA * c, -sinA, cosA * s,
                sinA * c, cosA, sinA * s,
                -s, 0, c
            ];
        };
        
        // Helper: rotation matrix for XY plane (around Z) combined with helicopter tilt (around Z)
        const xyRotMatrix = (angle: number) => {
            const c = Math.cos(angle), s = Math.sin(angle);
            return [
                cosA * c - sinA * s, -(cosA * s + sinA * c), 0,
                sinA * c + cosA * s, -sinA * s + cosA * c, 0,
                0, 0, 1
            ];
        };
        
        const rotorSpinning = this.rotorSpeed >= 1.0;
        
        // Main rotor (above cockpit, spins in XZ plane)
        const mainRotorPos = this.transformLocal(new Vec3(0, 4.0, 0), cosA, sinA);
        const mainAngle = rotorSpinning ? this.rotorPos * 0.5 : this.rotorPos * Math.PI * 2;
        const mainMatrix = xzRotMatrix(mainAngle);
        
        if (rotorSpinning) {
            shapes.obb(mainRotorPos, new Vec3(6, 0.3, 6), mainMatrix, VoxelColor.LightBlue);
        } else {
            shapes.obb(mainRotorPos, new Vec3(8.5, 0.3, 0.4), mainMatrix, VoxelColor.LightBlue);
            shapes.obb(mainRotorPos, new Vec3(0.4, 0.3, 8.5), mainMatrix, VoxelColor.LightBlue);
        }
        
        // Tail rotor (at tail boom, spins in XY plane)
        const tailRotorPos = this.transformLocal(new Vec3(-10, 1, 2), cosA, sinA);
        const tailAngle = rotorSpinning ? this.rotorPos * 0.8 : this.rotorPos * Math.PI * 8;
        const tailMatrix = xyRotMatrix(tailAngle);
        
        if (rotorSpinning) {
            shapes.obb(tailRotorPos, new Vec3(1.5, 1.5, 0.2), tailMatrix, VoxelColor.LightBlue);
        } else {
            shapes.obb(tailRotorPos, new Vec3(2.1, 0.3, 0.2), tailMatrix, VoxelColor.LightBlue);
            shapes.obb(tailRotorPos, new Vec3(0.3, 2.1, 0.2), tailMatrix, VoxelColor.LightBlue);
        }
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
