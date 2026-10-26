// The weapon in the hero's hand against a foe stood ahead of him (tools/lab `range --foe`): where a blow coming down
// on it lands, as the weapon's lowest point over the foe's body (every corner of its surface within the foe's circle,
// as `weaponFloor.ts` reads them), a share of the foe's height from its feet. An overhead blow lands on the foe it
// strikes, its top (from play: "power strike should land on the enemy its striking, or ground if no enemy to strike
// in that trajectory"): at the foe's top it reads near 1; through the body to the floor, near 0; never over it, none.
import * as THREE from 'three';
import type { Lab } from './lab';
import type { Enemy } from '../../../src/entities/enemy';

/** the canary moves the foe this far aside for one reading (m): the weapon must then read as never over it */
const CANARY_ASIDE = 3;

/** A frame's lowest point of the weapon over the foe: a share of its height, and the frame. */
interface Over {
  share: number;
  at: string;
}

const _corner = new THREE.Vector3();

/** The weapon's lowest point over a foe through a scenario. */
export class WeaponOnFoe {
  private lowest: Over | null = null;

  /** `foe`: the foe stood ahead */
  constructor(readonly foe: Enemy) {}

  /** Notes how low over the foe the weapon is this frame (`frame`: the frame as the report names it). */
  observe(lab: Lab, frame: string): void {
    const share = lowestOver(lab, this.foe);
    if (share === null) return;
    if (!this.lowest || share < this.lowest.share) this.lowest = { share, at: frame };
  }

  /** Where the weapon came down on the foe, as words. */
  describe(): string {
    const name = this.foe.def.name;
    if (!this.lowest) return `the weapon never over the ${name} ahead`;
    const share = `${(this.lowest.share * 100).toFixed(0)}% of its height`;
    return `the weapon's lowest over the ${name} ahead at ${share} (frame ${this.lowest.at})`;
  }

  /** whether the weapon was ever over the foe */
  get met(): boolean {
    return this.lowest !== null;
  }
}

/** The canary: the foe moved aside for one reading, and back. Returns whether the weapon read as over it then (it must
 *  not). */
export function foeCanary(lab: Lab, foe: Enemy): boolean {
  const was = foe.pos.clone();
  foe.pos.x += CANARY_ASIDE;
  const over = lowestOver(lab, foe) !== null;
  foe.pos.copy(was);
  return over;
}

/** The weapon's lowest point within the foe's circle this frame, as a share of the foe's height over its feet, or
 *  none if no point of it is over the foe (or he holds none). */
function lowestOver(lab: Lab, foe: Enemy): number | null {
  const grip = lab.model.tip?.parent;
  if (!grip) return null;
  grip.updateWorldMatrix(true, true);
  const feet = foe.obj.position.y;
  let lowest: number | null = null;
  grip.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const corners = mesh.geometry.attributes.position;
    for (let i = 0; i < corners.count; i++) {
      _corner.fromBufferAttribute(corners, i).applyMatrix4(mesh.matrixWorld);
      if (Math.hypot(_corner.x - foe.pos.x, _corner.z - foe.pos.z) > foe.radius) continue;
      const share = (_corner.y - feet) / foe.height;
      if (lowest === null || share < lowest) lowest = share;
    }
  });
  return lowest;
}
