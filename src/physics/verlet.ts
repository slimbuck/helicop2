import { Vec3 } from '../math';

export interface VerletPoint {
  pos: Vec3;
  old: Vec3;
  accel: Vec3;
  fixed: boolean;
}

export interface VerletEdge {
  p0: number;
  p1: number;
  restLength: number;
  stiffness: number;
}

export class VerletBody {
  points: VerletPoint[] = [];
  edges: VerletEdge[] = [];
  
  dragFactor = 0.01;
  gravityFactor = 1.0;

  addPoint(x: number, y: number, z: number, fixed = false): number {
    const index = this.points.length;
    this.points.push({
      pos: new Vec3(x, y, z),
      old: new Vec3(x, y, z),
      accel: new Vec3(0, 0, 0),
      fixed
    });
    return index;
  }

  addEdge(p0: number, p1: number, stiffness = 1.0): void {
    const restLength = Vec3.from(this.points[p0].pos).sub(this.points[p1].pos).length();
    this.edges.push({ p0, p1, restLength, stiffness });
  }

  reset(position: Vec3, rotation: Vec3 = new Vec3()): void {
    const cosY = Math.cos(rotation.y);
    const sinY = Math.sin(rotation.y);
    
    const centerOld = this.calcCenter();
    
    for (const point of this.points) {
      const local = Vec3.from(point.pos).sub(centerOld);
      
      const rotated = new Vec3(
        local.x * cosY - local.z * sinY,
        local.y,
        local.x * sinY + local.z * cosY
      );
      
      point.pos.copy(rotated).add(position);
      point.old.copy(point.pos);
      point.accel.set(0, 0, 0);
    }
  }

  calcCenter(): Vec3 {
    const center = new Vec3();
    let count = 0;
    for (const point of this.points) {
      if (!point.fixed) {
        center.add(point.pos);
        count++;
      }
    }
    if (count > 0) {
      center.scale(1 / count);
    }
    return center;
  }

  calcVelocity(): Vec3 {
    const velocity = new Vec3();
    let count = 0;
    for (const point of this.points) {
      if (!point.fixed) {
        velocity.add(Vec3.from(point.pos).sub(point.old));
        count++;
      }
    }
    if (count > 0) {
      velocity.scale(1 / count);
    }
    return velocity;
  }

  applyAccel(accel: Vec3): void {
    for (const point of this.points) {
      if (!point.fixed) {
        point.accel.add(accel);
      }
    }
  }

  applyAccelToPoint(index: number, accel: Vec3): void {
    if (!this.points[index].fixed) {
      this.points[index].accel.add(accel);
    }
  }

  applyTorque(center: Vec3, axis: Vec3, amount: number): void {
    for (const point of this.points) {
      if (point.fixed) continue;
      
      const toPoint = Vec3.from(point.pos).sub(center);
      const perpendicular = axis.cross(toPoint);
      const dist = perpendicular.length();
      
      if (dist > 0.001) {
        perpendicular.normalize().scale(amount);
        point.accel.add(perpendicular);
      }
    }
  }

  integrate(dt: number, gravity: Vec3): void {
    const dt2 = dt * dt;
    
    for (const point of this.points) {
      if (point.fixed) continue;
      
      // Apply gravity
      if (this.gravityFactor > 0) {
        point.accel.addScaled(gravity, this.gravityFactor);
      }
      
      // Verlet integration
      const newPos = new Vec3(
        point.pos.x * 2 - point.old.x + point.accel.x * dt2,
        point.pos.y * 2 - point.old.y + point.accel.y * dt2,
        point.pos.z * 2 - point.old.z + point.accel.z * dt2
      );
      
      // Apply drag
      if (this.dragFactor > 0) {
        const velocity = Vec3.from(newPos).sub(point.pos);
        newPos.addScaled(velocity, -this.dragFactor);
      }
      
      point.old.copy(point.pos);
      point.pos.copy(newPos);
      point.accel.set(0, 0, 0);
    }
  }

  constrain(iterations = 4): void {
    for (let iter = 0; iter < iterations; iter++) {
      for (const edge of this.edges) {
        const p0 = this.points[edge.p0];
        const p1 = this.points[edge.p1];
        
        const delta = Vec3.from(p1.pos).sub(p0.pos);
        const distance = delta.length();
        
        if (distance < 0.0001) continue;
        
        const diff = (distance - edge.restLength) / distance;
        const correction = delta.scale(diff * 0.5 * edge.stiffness);
        
        if (!p0.fixed) {
          p0.pos.add(correction);
        }
        if (!p1.fixed) {
          p1.pos.sub(correction);
        }
      }
    }
  }
}

export interface CollisionShape {
  type: 'box' | 'plane';
  min?: Vec3;
  max?: Vec3;
  normal?: Vec3;
  d?: number;
}

export class PhysicsWorld {
  bodies: VerletBody[] = [];
  shapes: CollisionShape[] = [];
  gravity = new Vec3(0, -20, 0);
  
  private simTime = 0;
  private readonly fixedDt = 1 / 64;

  addBody(body: VerletBody): void {
    this.bodies.push(body);
  }

  addShape(shape: CollisionShape): void {
    this.shapes.push(shape);
  }

  addGroundPlane(y: number): void {
    this.shapes.push({
      type: 'plane',
      normal: new Vec3(0, 1, 0),
      d: y
    });
  }

  addBox(min: Vec3, max: Vec3): void {
    this.shapes.push({
      type: 'box',
      min: Vec3.from(min),
      max: Vec3.from(max)
    });
  }

  step(dt: number): void {
    this.simTime += dt;
    
    while (this.simTime >= this.fixedDt) {
      for (const body of this.bodies) {
        body.integrate(this.fixedDt, this.gravity);
        body.constrain();
        this.collideBody(body);
      }
      
      this.simTime -= this.fixedDt;
    }
  }

  private collideBody(body: VerletBody): void {
    for (const point of body.points) {
      if (point.fixed) continue;
      
      for (const shape of this.shapes) {
        this.collidePointWithShape(point, shape);
      }
    }
  }

  private collidePointWithShape(point: VerletPoint, shape: CollisionShape): void {
    if (shape.type === 'plane' && shape.normal && shape.d !== undefined) {
      const dist = point.pos.dot(shape.normal) - shape.d;
      
      if (dist < 0) {
        const correction = Vec3.from(shape.normal).scale(-dist);
        point.pos.add(correction);
        
        // Apply friction
        const velocity = Vec3.from(point.pos).sub(point.old);
        const normalVel = shape.normal.clone().scale(velocity.dot(shape.normal));
        const tangentVel = velocity.sub(normalVel);
        
        point.old.addScaled(tangentVel, 0.2);
      }
    } else if (shape.type === 'box' && shape.min && shape.max) {
      const p = point.pos;
      
      if (p.x >= shape.min.x && p.x <= shape.max.x &&
          p.y >= shape.min.y && p.y <= shape.max.y &&
          p.z >= shape.min.z && p.z <= shape.max.z) {
        
        // Find closest face
        const distances = [
          p.x - shape.min.x,  // left
          shape.max.x - p.x,  // right
          p.y - shape.min.y,  // bottom
          shape.max.y - p.y,  // top
          p.z - shape.min.z,  // front
          shape.max.z - p.z   // back
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
        let minIndex = 0;
        
        for (let i = 1; i < 6; i++) {
          if (distances[i] < minDist) {
            minDist = distances[i];
            minIndex = i;
          }
        }
        
        point.pos.addScaled(normals[minIndex], minDist);
      }
    }
  }
}
