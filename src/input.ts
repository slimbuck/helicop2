import { Vec2, damp } from './math';

export enum Key {
    Space,
    Up,
    Down,
    Left,
    Right,
    W,
    A,
    S,
    D,
    Escape,
    F1
}

export class Input {
    // Touch state
    touching = false;
    touchPosition = new Vec2();
    
    // Sensor state (device orientation)
    pitch = 0;  // forward/backward tilt (-1 to 1)
    roll = 0;   // left/right tilt (-1 to 1)
    
    // Keyboard state
    private keys: Set<Key> = new Set();
    private prevKeys: Set<Key> = new Set();
    
    // Simulated tilt from keyboard
    private simulatedPitch = 0;
    private simulatedRoll = 0;
    
    // Is mobile device
    readonly isMobile: boolean;

    constructor(canvas: HTMLCanvasElement) {
        this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        this.setupTouchEvents(canvas);
        this.setupKeyboardEvents();
        this.setupDeviceOrientation();
        
        // Show appropriate controls hint
        this.updateControlsHint();
    }

    private setupTouchEvents(canvas: HTMLCanvasElement): void {
        const handleTouchStart = (e: TouchEvent) => {
            e.preventDefault();
            if (e.touches.length > 0) {
                this.touching = true;
                const touch = e.touches[0];
                this.touchPosition.set(touch.clientX, touch.clientY);
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            e.preventDefault();
            if (e.touches.length > 0) {
                const touch = e.touches[0];
                this.touchPosition.set(touch.clientX, touch.clientY);
            }
        };

        const handleTouchEnd = (e: TouchEvent) => {
            e.preventDefault();
            if (e.touches.length === 0) {
                this.touching = false;
            }
        };

        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
        canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });
        
        // Mouse fallback for desktop
        canvas.addEventListener('mousedown', (e) => {
            this.touching = true;
            this.touchPosition.set(e.clientX, e.clientY);
        });
        
        canvas.addEventListener('mouseup', () => {
            this.touching = false;
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (this.touching) {
                this.touchPosition.set(e.clientX, e.clientY);
            }
        });
    }

    private setupKeyboardEvents(): void {
        const keyMap: Record<string, Key> = {
            'Space': Key.Space,
            ' ': Key.Space,
            'ArrowUp': Key.Up,
            'ArrowDown': Key.Down,
            'ArrowLeft': Key.Left,
            'ArrowRight': Key.Right,
            'KeyW': Key.W,
            'w': Key.W,
            'KeyA': Key.A,
            'a': Key.A,
            'KeyS': Key.S,
            's': Key.S,
            'KeyD': Key.D,
            'd': Key.D,
            'Escape': Key.Escape,
            'F1': Key.F1
        };

        window.addEventListener('keydown', (e) => {
            const key = keyMap[e.code] ?? keyMap[e.key];
            if (key !== undefined) {
                this.keys.add(key);
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            const key = keyMap[e.code] ?? keyMap[e.key];
            if (key !== undefined) {
                this.keys.delete(key);
            }
        });

        // Handle window blur
        window.addEventListener('blur', () => {
            this.keys.clear();
        });
    }

    private setupDeviceOrientation(): void {
        if (!this.isMobile) return;
        
        // Request permission for iOS 13+
        const requestPermission = async () => {
            if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
                try {
                    const permission = await (DeviceOrientationEvent as any).requestPermission();
                    if (permission === 'granted') {
                        this.addOrientationListener();
                    }
                } catch (e) {
                    console.warn('Device orientation permission denied:', e);
                }
            } else {
                this.addOrientationListener();
            }
        };

        // Request on first touch
        window.addEventListener('touchstart', () => {
            requestPermission();
        }, { once: true });
        
        // Try immediately for non-iOS devices
        requestPermission();
    }

    private addOrientationListener(): void {
        window.addEventListener('deviceorientation', (e) => {
            // gamma is left/right tilt (-90 to 90)
            // beta is front/back tilt (-180 to 180)
            
            if (e.gamma !== null) {
                // Normalize to -1 to 1 range
                this.roll = Math.max(-1, Math.min(1, (e.gamma || 0) / 45));
            }
            
            if (e.beta !== null) {
                // Normalize pitch, accounting for holding device at ~45 degree angle
                const beta = (e.beta || 0) - 45;
                this.pitch = Math.max(-1, Math.min(1, beta / 30));
            }
        });
    }

    private updateControlsHint(): void {
        const desktop = document.querySelector('#controls .desktop') as HTMLElement;
        const mobile = document.querySelector('#controls .mobile') as HTMLElement;
        
        if (desktop) desktop.style.display = this.isMobile ? 'none' : 'inline';
        if (mobile) mobile.style.display = this.isMobile ? 'inline' : 'none';
    }

    update(dt: number): void {
        // Store previous key state
        this.prevKeys = new Set(this.keys);
        
        // Simulate tilt from keyboard (for desktop)
        if (!this.isMobile) {
            let targetPitch = 0;
            let targetRoll = 0;
            
            if (this.isDown(Key.Up) || this.isDown(Key.W)) targetPitch = -0.6;
            if (this.isDown(Key.Down) || this.isDown(Key.S)) targetPitch = 0.6;
            if (this.isDown(Key.Left) || this.isDown(Key.A)) targetRoll = -0.6;
            if (this.isDown(Key.Right) || this.isDown(Key.D)) targetRoll = 0.6;
            
            this.simulatedPitch = damp(this.simulatedPitch, targetPitch, 0.001, dt);
            this.simulatedRoll = damp(this.simulatedRoll, targetRoll, 0.001, dt);
            
            this.pitch = this.simulatedPitch;
            this.roll = this.simulatedRoll;
        }
    }

    isDown(key: Key): boolean {
        return this.keys.has(key);
    }

    isPressed(key: Key): boolean {
        return this.keys.has(key) && !this.prevKeys.has(key);
    }

    isReleased(key: Key): boolean {
        return !this.keys.has(key) && this.prevKeys.has(key);
    }

    // Returns true if thrust is active (touch or space)
    get thrust(): boolean {
        return this.touching || this.isDown(Key.Space);
    }
}
