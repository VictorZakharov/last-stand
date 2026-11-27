// A point by its distance and two angles, as three's `Spherical`: `phi` down from +y, `theta` round y from +z
// towards +x (an orbit's camera).
import { clamp } from './maths.ts';
import type { Vec3 } from './vec3.ts';

/** how near the poles `makeSafe` lets `phi` come */
const POLE = 0.000001;

/** three's `Spherical` */
export class Spherical {
  /** the distance from the origin */
  radius: number;
  /** the angle down from +y, in radians */
  phi: number;
  /** the angle round y from +z towards +x, in radians */
  theta: number;

  /** the point given, or one up +y */
  constructor(radius = 1, phi = 0, theta = 0) {
    this.radius = radius;
    this.phi = phi;
    this.theta = theta;
  }

  /** sets all three */
  set(radius: number, phi: number, theta: number): this {
    this.radius = radius;
    this.phi = phi;
    this.theta = theta;
    return this;
  }

  /** a new one with these numbers */
  clone(): Spherical {
    return new Spherical(this.radius, this.phi, this.theta);
  }

  /** takes `other`'s numbers */
  copy(other: Spherical): this {
    return this.set(other.radius, other.phi, other.theta);
  }

  /** `phi` kept off the poles, where `theta` would be lost */
  makeSafe(): this {
    this.phi = clamp(this.phi, POLE, Math.PI - POLE);
    return this;
  }

  /** the point `v` */
  setFromVector3(v: Vec3): this {
    return this.setFromCartesianCoords(v.x, v.y, v.z);
  }

  /** the point `(x, y, z)` (both angles 0 at the origin) */
  setFromCartesianCoords(x: number, y: number, z: number): this {
    this.radius = Math.sqrt(x * x + y * y + z * z);
    if (this.radius === 0) {
      this.theta = 0;
      this.phi = 0;
      return this;
    }
    this.theta = Math.atan2(x, z);
    this.phi = Math.acos(clamp(y / this.radius, -1, 1));
    return this;
  }
}
