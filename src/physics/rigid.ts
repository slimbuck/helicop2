import { Vec3 } from '../math';
import type { DebugLines } from '../gpu/voxelPipeline';

export class RigidBody {
    position = new Vec3();
    velocity = new Vec3();
    angle = 0;
    angularVel = 0;
    
    mass = 1;
    drag = 0.02;
    angularDrag = 0.05;
    grounded = false;
    
    private force = new Vec3();
    private torque = 0;

    applyForce(force: Vec3): void {
        this.force.add(force);
    }

    applyTorque(amount: number): void {
        this.torque += amount;
    }

    integrate(dt: number, gravity: number): void {
        // Apply gravity
        this.force.y += gravity * this.mass;
        
        // Linear integration
        const accel = new Vec3(
            this.force.x / this.mass,
            this.force.y / this.mass,
            this.force.z / this.mass
        );
        
        this.velocity.addScaled(accel, dt);
        this.velocity.scale(1 - this.drag);
        this.position.addScaled(this.velocity, dt);
        
        // Angular integration
        this.angularVel += this.torque * dt;
        this.angularVel *= (1 - this.angularDrag);
        this.angle += this.angularVel * dt;
        
        // Reset accumulators
        this.force.set(0, 0, 0);
        this.torque = 0;
        this.grounded = false;
    }

    reset(pos: Vec3): void {
        this.position.copy(pos);
        this.velocity.set(0, 0, 0);
        this.angle = 0;
        this.angularVel = 0;
        this.force.set(0, 0, 0);
        this.torque = 0;
    }
}

export class BoxShape {
    constructor(
        public min: Vec3,
        public max: Vec3
    ) {}

    containsPoint(p: Vec3): boolean {
        return p.x >= this.min.x && p.x <= this.max.x &&
                      p.y >= this.min.y && p.y <= this.max.y &&
                      p.z >= this.min.z && p.z <= this.max.z;
    }

    collidePoint(p: Vec3): { normal: Vec3, depth: number } | null {
        if (!this.containsPoint(p)) return null;
        
        const distances = [
            p.x - this.min.x,
            this.max.x - p.x,
            p.y - this.min.y,
            this.max.y - p.y,
            p.z - this.min.z,
            this.max.z - p.z
        ];
        
        const normals = [
            new Vec3(-1, 0, 0),
            new Vec3(1, 0, 0),
            new Vec3(0, -1, 0),
            new Vec3(0, 1, 0),
            new Vec3(0, 0, -1),
            new Vec3(0, 0, 1)
        ];
        
        let minDist = distances[0];
        let minIdx = 0;
        for (let i = 1; i < 6; i++) {
            if (distances[i] < minDist) {
                minDist = distances[i];
                minIdx = i;
            }
        }
        
        return { normal: normals[minIdx], depth: minDist };
    }

    collideBox(other: BoxShape): { normal: Vec3, depth: number } | null {
        const overlapX = Math.min(this.max.x, other.max.x) - Math.max(this.min.x, other.min.x);
        const overlapY = Math.min(this.max.y, other.max.y) - Math.max(this.min.y, other.min.y);
        const overlapZ = Math.min(this.max.z, other.max.z) - Math.max(this.min.z, other.min.z);
        
        if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) return null;
        
        const centerThis = new Vec3(
            (this.min.x + this.max.x) * 0.5,
            (this.min.y + this.max.y) * 0.5,
            (this.min.z + this.max.z) * 0.5
        );
        const centerOther = new Vec3(
            (other.min.x + other.max.x) * 0.5,
            (other.min.y + other.max.y) * 0.5,
            (other.min.z + other.max.z) * 0.5
        );
        
        if (overlapX <= overlapY && overlapX <= overlapZ) {
            const dir = centerThis.x > centerOther.x ? 1 : -1;
            return { normal: new Vec3(dir, 0, 0), depth: overlapX };
        } else if (overlapY <= overlapZ) {
            const dir = centerThis.y > centerOther.y ? 1 : -1;
            return { normal: new Vec3(0, dir, 0), depth: overlapY };
        } else {
            const dir = centerThis.z > centerOther.z ? 1 : -1;
            return { normal: new Vec3(0, 0, dir), depth: overlapZ };
        }
    }
}

export class SphereShape {
    constructor(
        public center: Vec3,
        public radius: number
    ) {}

    collidePoint(p: Vec3): { normal: Vec3, depth: number } | null {
        const dx = p.x - this.center.x;
        const dy = p.y - this.center.y;
        const dz = p.z - this.center.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (dist >= this.radius) return null;
        
        const depth = this.radius - dist;
        if (dist > 0.001) {
            return { normal: new Vec3(dx / dist, dy / dist, dz / dist), depth };
        }
        return { normal: new Vec3(0, 1, 0), depth };
    }

    collideBox(box: BoxShape): { normal: Vec3, depth: number } | null {
        const closest = new Vec3(
            Math.max(box.min.x, Math.min(this.center.x, box.max.x)),
            Math.max(box.min.y, Math.min(this.center.y, box.max.y)),
            Math.max(box.min.z, Math.min(this.center.z, box.max.z))
        );
        
        const dx = this.center.x - closest.x;
        const dy = this.center.y - closest.y;
        const dz = this.center.z - closest.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (dist >= this.radius) return null;
        
        const depth = this.radius - dist;
        if (dist > 0.001) {
            return { normal: new Vec3(dx / dist, dy / dist, dz / dist), depth };
        }
        return { normal: new Vec3(0, 1, 0), depth };
    }
}

export class HeightfieldShape {
    constructor(
        public getHeight: (x: number) => number,
        public minX: number = -1000,
        public maxX: number = 1000
    ) {}

    getHeightAt(x: number): number {
        return this.getHeight(x);
    }

    collidePoint(p: Vec3): { normal: Vec3, depth: number } | null {
        if (p.x < this.minX || p.x > this.maxX) return null;
        
        const groundY = this.getHeight(p.x);
        if (p.y >= groundY) return null;
        
        const depth = groundY - p.y;
        
        const sampleDist = 0.5;
        const heightLeft = this.getHeight(p.x - sampleDist);
        const heightRight = this.getHeight(p.x + sampleDist);
        const slope = (heightRight - heightLeft) / (sampleDist * 2);
        
        const normal = new Vec3(-slope, 1, 0).normalize();
        return { normal, depth };
    }
}

export interface DynamicBody {
    body: RigidBody;
    shape: BoxShape;
    restitution?: number;
    useSkidPoints?: boolean;
}

export class SimplePhysicsWorld {
    gravity = -20;
    bodies: DynamicBody[] = [];
    staticBoxes: BoxShape[] = [];
    staticSpheres: SphereShape[] = [];
    heightfield: HeightfieldShape | null = null;
    
    private fixedDt = 1 / 60;
    private accumulator = 0;

    addBody(body: RigidBody, halfExtents: Vec3, restitution = 0.3, useSkidPoints = false): DynamicBody {
        const shape = new BoxShape(
            new Vec3(-halfExtents.x, -halfExtents.y, -halfExtents.z),
            new Vec3(halfExtents.x, halfExtents.y, halfExtents.z)
        );
        const dynamicBody: DynamicBody = { body, shape, restitution, useSkidPoints };
        this.bodies.push(dynamicBody);
        return dynamicBody;
    }

    addStaticBox(min: Vec3, max: Vec3): BoxShape {
        const box = new BoxShape(Vec3.from(min), Vec3.from(max));
        this.staticBoxes.push(box);
        return box;
    }

    addStaticSphere(center: Vec3, radius: number): SphereShape {
        const sphere = new SphereShape(Vec3.from(center), radius);
        this.staticSpheres.push(sphere);
        return sphere;
    }

    setHeightfield(getHeight: (x: number) => number): void {
        this.heightfield = new HeightfieldShape(getHeight);
    }

    collideSkidPoints(body: RigidBody, worldPoints: Vec3[], restitution = 0.2): void {
        if (!this.heightfield) return;
        
        let anyGrounded = false;
        const stiffness = 800;
        const damping = 40;
        
        for (const point of worldPoints) {
            const groundY = this.heightfield.getHeightAt(point.x);
            const penetration = groundY - point.y;
            
            if (penetration > 0) {
                anyGrounded = true;
                
                // Calculate local offset from body center (in world space, rotated)
                const offsetX = point.x - body.position.x;
                const offsetY = point.y - body.position.y;
                
                // Spring-damper force (upward)
                const relVelY = body.velocity.y + body.angularVel * offsetX;
                const forceY = stiffness * penetration - damping * relVelY;
                
                // Apply force to body
                body.velocity.y += forceY / body.mass * this.fixedDt;
                
                // Torque from off-center force: tau = r x F
                // In 2D (rotation around Z): tau = offsetX * forceY - offsetY * forceX
                // forceX = 0 for ground collision, so tau = offsetX * forceY
                const torque = offsetX * forceY * 0.01;
                body.angularVel += torque / body.mass * this.fixedDt;
                
                // Friction to slow horizontal motion when grounded
                body.velocity.x *= 0.98;
            }
        }
        
        body.grounded = anyGrounded;
    }

    step(dt: number): void {
        this.accumulator += dt;
        
        while (this.accumulator >= this.fixedDt) {
            this.fixedStep(this.fixedDt);
            this.accumulator -= this.fixedDt;
        }
    }

    private fixedStep(dt: number): void {
        for (const { body } of this.bodies) {
            body.integrate(dt, this.gravity);
        }
        
        for (const dynamicBody of this.bodies) {
            this.collideBody(dynamicBody);
        }
    }

    private collideBody(dynamicBody: DynamicBody): void {
        const { body, shape, restitution = 0.3, useSkidPoints = false } = dynamicBody;
        
        const worldShape = new BoxShape(
            new Vec3(
                body.position.x + shape.min.x,
                body.position.y + shape.min.y,
                body.position.z + shape.min.z
            ),
            new Vec3(
                body.position.x + shape.max.x,
                body.position.y + shape.max.y,
                body.position.z + shape.max.z
            )
        );
        
        // Skip heightfield collision if using skid points (handled separately)
        if (this.heightfield && !useSkidPoints) {
            const groundY = this.heightfield.getHeightAt(body.position.x);
            const bottomY = body.position.y + shape.min.y;
            
            if (bottomY < groundY) {
                const depth = groundY - bottomY;
                body.position.y += depth;
                
                if (body.velocity.y < 0) {
                    body.velocity.y *= -restitution;
                    body.velocity.x *= 0.95;
                }
                body.grounded = true;
            }
        }
        
        for (const staticBox of this.staticBoxes) {
            const collision = worldShape.collideBox(staticBox);
            if (collision) {
                const { normal, depth } = collision;
                
                body.position.addScaled(normal, depth);
                
                const vn = body.velocity.dot(normal);
                if (vn < 0) {
                    body.velocity.addScaled(normal, -vn * (1 + restitution));
                }
                
                if (normal.y > 0.5) {
                    body.grounded = true;
                }
            }
        }

        // Check against static spheres
        for (const sphere of this.staticSpheres) {
            const collision = sphere.collideBox(worldShape);
            if (collision) {
                const { normal, depth } = collision;
                // Negate normal since collideBox returns normal pointing from sphere center
                body.position.addScaled(normal, depth);
                
                const vn = body.velocity.dot(normal);
                if (vn < 0) {
                    body.velocity.addScaled(normal, -vn * (1 + restitution));
                }
            }
        }
    }

    renderDebug(lines: DebugLines): void {
        // Draw dynamic body collision boxes (yellow)
        for (const { body, shape } of this.bodies) {
            const min = new Vec3(
                body.position.x + shape.min.x,
                body.position.y + shape.min.y,
                body.position.z + shape.min.z
            );
            const max = new Vec3(
                body.position.x + shape.max.x,
                body.position.y + shape.max.y,
                body.position.z + shape.max.z
            );
            lines.wireBox(min, max, 1, 1, 0); // Yellow
        }

        // Draw static collision boxes (cyan)
        for (const box of this.staticBoxes) {
            lines.wireBox(box.min, box.max, 0, 1, 1); // Cyan
        }

        // Draw static collision spheres (magenta)
        for (const sphere of this.staticSpheres) {
            lines.wireSphere(sphere.center, sphere.radius, 1, 0, 1); // Magenta
        }
    }
}
