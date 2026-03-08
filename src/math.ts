export class Vec3 {
    constructor(
        public x: number = 0,
        public y: number = 0,
        public z: number = 0
    ) {}

    static from(v: Vec3): Vec3 {
        return new Vec3(v.x, v.y, v.z);
    }

    static zero(): Vec3 {
        return new Vec3(0, 0, 0);
    }

    clone(): Vec3 {
        return new Vec3(this.x, this.y, this.z);
    }

    set(x: number, y: number, z: number): this {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }

    copy(v: Vec3): this {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        return this;
    }

    add(v: Vec3): this {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;
        return this;
    }

    sub(v: Vec3): this {
        this.x -= v.x;
        this.y -= v.y;
        this.z -= v.z;
        return this;
    }

    scale(s: number): this {
        this.x *= s;
        this.y *= s;
        this.z *= s;
        return this;
    }

    addScaled(v: Vec3, s: number): this {
        this.x += v.x * s;
        this.y += v.y * s;
        this.z += v.z * s;
        return this;
    }

    length(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    lengthSq(): number {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    normalize(): this {
        const len = this.length();
        if (len > 0) {
            this.scale(1 / len);
        }
        return this;
    }

    dot(v: Vec3): number {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    cross(v: Vec3): Vec3 {
        return new Vec3(
            this.y * v.z - this.z * v.y,
            this.z * v.x - this.x * v.z,
            this.x * v.y - this.y * v.x
        );
    }

    lerp(v: Vec3, t: number): this {
        this.x += (v.x - this.x) * t;
        this.y += (v.y - this.y) * t;
        this.z += (v.z - this.z) * t;
        return this;
    }

    toArray(): [number, number, number] {
        return [this.x, this.y, this.z];
    }
}

export class Vec2 {
    constructor(
        public x: number = 0,
        public y: number = 0
    ) {}

    static zero(): Vec2 {
        return new Vec2(0, 0);
    }

    clone(): Vec2 {
        return new Vec2(this.x, this.y);
    }

    set(x: number, y: number): this {
        this.x = x;
        this.y = y;
        return this;
    }

    length(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
}

export class Mat4 {
    public m: Float32Array;

    constructor() {
        this.m = new Float32Array(16);
        this.identity();
    }

    identity(): this {
        this.m.fill(0);
        this.m[0] = 1;
        this.m[5] = 1;
        this.m[10] = 1;
        this.m[15] = 1;
        return this;
    }

    perspective(fov: number, aspect: number, near: number, far: number): this {
        const f = 1 / Math.tan(fov / 2);
        const rangeInv = 1 / (near - far);
        // FOV applies to largest axis (horizontal in landscape, vertical in portrait)
        const scale = Math.max(aspect, 1.0);

        // Row-major perspective matrix for WebGPU (depth range [0, 1])
        this.m[0] = f * scale / aspect;
        this.m[1] = 0;
        this.m[2] = 0;
        this.m[3] = 0;
        this.m[4] = 0;
        this.m[5] = f * scale;
        this.m[6] = 0;
        this.m[7] = 0;
        this.m[8] = 0;
        this.m[9] = 0;
        this.m[10] = far * rangeInv;
        this.m[11] = near * far * rangeInv;
        this.m[12] = 0;
        this.m[13] = 0;
        this.m[14] = -1;
        this.m[15] = 0;

        return this;
    }

    lookAt(eye: Vec3, target: Vec3, up: Vec3): this {
        const zAxis = new Vec3(eye.x - target.x, eye.y - target.y, eye.z - target.z).normalize();
        const xAxis = up.cross(zAxis).normalize();
        const yAxis = zAxis.cross(xAxis);

        // Row-major: each row contains a basis vector dotted with position
        this.m[0] = xAxis.x;
        this.m[1] = xAxis.y;
        this.m[2] = xAxis.z;
        this.m[3] = -xAxis.dot(eye);
        this.m[4] = yAxis.x;
        this.m[5] = yAxis.y;
        this.m[6] = yAxis.z;
        this.m[7] = -yAxis.dot(eye);
        this.m[8] = zAxis.x;
        this.m[9] = zAxis.y;
        this.m[10] = zAxis.z;
        this.m[11] = -zAxis.dot(eye);
        this.m[12] = 0;
        this.m[13] = 0;
        this.m[14] = 0;
        this.m[15] = 1;

        return this;
    }

    translate(x: number, y: number, z: number): this {
        this.m[12] += x;
        this.m[13] += y;
        this.m[14] += z;
        return this;
    }

    rotateY(angle: number): this {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const m0 = this.m[0], m2 = this.m[2];
        const m4 = this.m[4], m6 = this.m[6];
        const m8 = this.m[8], m10 = this.m[10];

        this.m[0] = m0 * c - m2 * s;
        this.m[2] = m0 * s + m2 * c;
        this.m[4] = m4 * c - m6 * s;
        this.m[6] = m4 * s + m6 * c;
        this.m[8] = m8 * c - m10 * s;
        this.m[10] = m8 * s + m10 * c;

        return this;
    }
}

export function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

export function damp(current: number, target: number, smoothing: number, dt: number): number {
    return lerp(current, target, 1 - Math.pow(smoothing, dt));
}
