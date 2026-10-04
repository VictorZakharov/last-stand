// The ranger's recurve bow as a working spring, and its arrows. Its limbs bend as the string is drawn: the string keeps
// its length, so as the nock goes back the tips come back and in, each limb bending along its working part and not in
// its stiff recurved tip. Loosed, the limbs spring forward past rest and ring out. The bow's own frame: the grip's pivot at
// the origin, +y up its limbs, +z its back (towards the target), +x the archer's left; metres at the model's scale.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { taperTube } from './armor';
import { clamp } from '../../util';

/** half the riser's length, to the limbs' pockets, which stand this far in front of the grip (a deflexed riser) */
const RISER = 0.24, POCKET_Z = 0.03;
/** each limb's length along it, and the share of it that bends (the recurve beyond it is stiff) */
const LIMB = 0.5, WORK = 0.72;
/** the braced limb: its lean back from the pocket (rad), its curve back along the working part and forward round the recurve (rad/m) */
const LEAN = 0.25, CURVE = 1.6, RECURVE = -5;
/** the arrow's rest above the grip's pivot, on the riser's shelf (the string's nocking point is level with it) */
export const REST_Y = 0.045;
/** an arrow (38 in: as long as the hero's draw, which is what his arms reach, and its head out past the riser at full draw;
 *  at 30 in it stopped short of the riser) and its shaft's radius */
export const ARROW = 0.96;
const SHAFT = 0.0055;
const SEG = 18, RING = 10;

/** how far the string is pulled (0..1 of the full draw) after `k` of the draw's time: quick at first, slowing into the
 *  anchor as the weight builds (a bow's draw force rises with the draw) */
export const pullAt = (k: number): number => 1 - (1 - clamp(k, 0, 1)) ** 2;

/** the braced limb's angle back from +y at `s` along it, and how much of an added bend reaches there (the working part bends, the recurve barely) */
const braced = (s: number): number => (s < WORK * LIMB ? LEAN + CURVE * s : LEAN + CURVE * WORK * LIMB + RECURVE * (s - WORK * LIMB));
const worked = (s: number): number => Math.min(s, WORK * LIMB) + Math.max(0, s - WORK * LIMB) * 0.15;

/** the upper limb's centre line (y, z pairs from the pocket to the tip) with `bend` added (rad/m along its working part) */
function limbLine(bend: number, out: Float64Array): Float64Array {
  let y = RISER, z = POCKET_Z;
  out[0] = y; out[1] = z;
  const ds = LIMB / SEG;
  for (let i = 0; i < SEG; i++) {
    const s = (i + 0.5) * ds, phi = braced(s) + bend * worked(s);
    y += Math.cos(phi) * ds; z -= Math.sin(phi) * ds;
    out[i * 2 + 2] = y; out[i * 2 + 3] = z;
  }
  return out;
}

/** An arrow along +z, centred on its middle: a wooden shaft, a steel broadhead, three vanes (the cock vane red, out
 *  from the bow: +x) and a nock, in vertex colours. */
let arrowGeo: THREE.BufferGeometry | null = null;
export function arrowGeometry(): THREE.BufferGeometry {
  if (arrowGeo) return arrowGeo;
  const paint = (g: THREE.BufferGeometry, c: number) => {
    const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  const h = ARROW / 2, parts = [
    paint(new THREE.CylinderGeometry(SHAFT, SHAFT, ARROW - 0.05, 6, 1).rotateX(Math.PI / 2).translate(0, 0, -0.01), 0xa8834f),
    paint(new THREE.ConeGeometry(0.016, 0.065, 4).rotateX(Math.PI / 2).scale(1, 0.25, 1).translate(0, 0, h - 0.03), 0x8f969c),
    paint(new THREE.CylinderGeometry(0.0065, 0.0065, 0.016, 6).rotateX(Math.PI / 2).translate(0, 0, -h + 0.008), 0x2a2622),
  ];
  for (let i = 0; i < 3; i++) {
    const vane = new THREE.BoxGeometry(0.0015, 0.021, 0.105).translate(0, SHAFT + 0.0105, -h + 0.085).rotateZ(-Math.PI / 2 + i * Math.PI * 2 / 3);
    parts.push(paint(vane, i ? 0xd9d2bd : 0x8c2a1f));
  }
  arrowGeo = mergeGeometries(parts)!;
  arrowGeo.computeVertexNormals();
  return arrowGeo;
}

/** An arrow in pieces from its nock (z 0) forward along +z, for one drawn out of a quiver a part at a time: the nock and
 *  vanes (`rear`, 14 cm), the shaft a unit long (scaled to what's out), and the head (`head`, its tip at z 0). */
export function arrowPieces(): { rear: THREE.BufferGeometry; shaft: THREE.BufferGeometry; head: THREE.BufferGeometry } {
  const paint = (g: THREE.BufferGeometry, c: number) => {
    const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  const rear = [paint(new THREE.CylinderGeometry(0.0065, 0.0065, 0.016, 6).rotateX(Math.PI / 2).translate(0, 0, 0.008), 0x2a2622)];
  for (let i = 0; i < 3; i++) rear.push(paint(new THREE.BoxGeometry(0.0015, 0.021, 0.105).translate(0, SHAFT + 0.0105, 0.085).rotateZ(-Math.PI / 2 + i * Math.PI * 2 / 3), i ? 0xd9d2bd : 0x8c2a1f));
  const r = mergeGeometries(rear)!; r.computeVertexNormals();
  const shaft = paint(new THREE.CylinderGeometry(SHAFT, SHAFT, 1, 6, 1).rotateX(Math.PI / 2).translate(0, 0, 0.5), 0xa8834f);
  const head = paint(new THREE.ConeGeometry(0.016, 0.065, 4).rotateX(Math.PI / 2).scale(1, 0.25, 1).translate(0, 0, -0.0325), 0x8f969c);
  shaft.computeVertexNormals(); head.computeVertexNormals();
  return { rear: r, shaft, head };
}

export interface BowMaterials { riser: THREE.Material; limb: THREE.Material; grip: THREE.Material; string: THREE.Material; arrow: THREE.Material }

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class Bow {
  /** the bow's frame (see the file header): place it on the hand */
  readonly group = new THREE.Group();
  /** the string's rest from the grip's pivot (its brace height) and its length */
  readonly brace: number;
  private readonly stringLen: number;
  /** the string's nocking point as last set, and the limbs' tips (the bow's frame) */
  readonly nock = new THREE.Vector3();
  readonly tipU = new THREE.Vector3();
  readonly tipL = new THREE.Vector3();
  /** the limbs' added bend as last set (rad/m) */
  bend = 0;
  private readonly line = new Float64Array(SEG * 2 + 2);
  private readonly limbGeo: THREE.BufferGeometry;
  private readonly strings: THREE.Mesh[];
  private readonly serving: THREE.Mesh;
  /** the nocked arrows (one, or a fan) */
  readonly arrows: THREE.Mesh[] = [];

  constructor(m: BowMaterials) {
    const g = this.group;
    g.name = 'bow';
    limbLine(0, this.line);
    this.brace = -this.line[SEG * 2 + 1];
    this.stringLen = 2 * Math.hypot(this.line[SEG * 2], 0);
    // the riser: the grip in the hand, the shelf the arrow lies on, the window cut past the middle (the arrow passes at x 0, beside it) and the pockets
    const riser = [new THREE.Vector3(0, -RISER - 0.01, POCKET_Z), new THREE.Vector3(0, -0.14, 0.022), new THREE.Vector3(0, -0.05, 0.004), new THREE.Vector3(0, 0.02, 0),
      new THREE.Vector3(-0.011, 0.07, 0.006), new THREE.Vector3(-0.012, 0.15, 0.018), new THREE.Vector3(0, RISER + 0.01, POCKET_Z)];
    const rr = (t: number) => (t < 0.18 ? 0.021 : t < 0.5 ? 0.019 : t < 0.8 ? 0.014 : 0.019) - Math.abs(t - 0.4) * 0.006;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => { const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; g.add(mesh); return mesh; };
    add(taperTube(riser, rr, 28, 10), m.riser).name = 'riser';
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 12).translate(0, -0.012, 0.003), m.grip);
    add(new THREE.BoxGeometry(0.014, 0.008, 0.03).translate(-0.004, REST_Y - SHAFT - 0.004, 0), m.grip);
    // the limbs: one shape, the lower its mirror (three flips the faces of a mirrored mesh)
    const n = (SEG + 2) * RING, pos = new Float32Array(n * 3), idx: number[] = [];
    for (let i = 0; i <= SEG; i++) for (let k = 0; k < RING; k++) {
      const a = i * RING + k, b = i * RING + (k + 1) % RING;
      idx.push(a, a + RING, b, b, a + RING, b + RING);
    }
    this.limbGeo = new THREE.BufferGeometry();
    this.limbGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.limbGeo.setIndex(idx);
    add(this.limbGeo, m.limb);
    add(this.limbGeo, m.limb).scale.y = -1;
    this.strings = [0, 1].map(() => add(new THREE.CylinderGeometry(0.0022, 0.0022, 1, 5, 1).translate(0, 0.5, 0), m.string));
    for (const s of this.strings) s.castShadow = false;
    this.serving = add(new THREE.CylinderGeometry(0.0034, 0.0034, 0.05, 6), m.string);
    this.serving.castShadow = false;
    for (let i = 0; i < 5; i++) { const a = add(arrowGeometry(), m.arrow); a.castShadow = false; a.visible = false; this.arrows.push(a); }
    this.set(0);
  }

  /** the limbs' tips with `bend` added */
  private tips(bend: number): void {
    limbLine(bend, this.line);
    this.tipU.set(0, this.line[SEG * 2], this.line[SEG * 2 + 1]);
    this.tipL.set(0, -this.tipU.y, this.tipU.z);
  }

  /**
   * Draw the string `pull` back past brace (m): the limbs bend just as far as keeps the string its length. A loosed
   * bow (`pull` 0) rings with `ring`, an added bend (rad/m, negative: forward past rest), the string straight.
   */
  set(pull: number, ring = 0): void {
    if (pull > 1e-4) {
      // (the string's two halves, tip to nock, against its length: the bend that matches by bisection)
      this.nock.set(0, REST_Y, -this.brace - pull);
      let lo = 0, hi = 4;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        this.tips(mid);
        if (this.tipU.distanceTo(this.nock) + this.tipL.distanceTo(this.nock) > this.stringLen) lo = mid; else hi = mid;
      }
      this.bend = (lo + hi) / 2;
    } else this.bend = ring;
    this.tips(this.bend);
    // a loose string runs straight, tip to tip
    if (pull <= 1e-4) this.nock.set(0, REST_Y, this.tipU.z + (this.tipL.z - this.tipU.z) * (this.tipU.y - REST_Y) / (this.tipU.y - this.tipL.y));
    // the limb's cross-section: wide and flat, tapering to the tip, closed at its end
    const pos = this.limbGeo.attributes.position as THREE.BufferAttribute, P = pos.array as Float32Array, L = this.line;
    for (let i = 0; i <= SEG + 1; i++) {
      const c = Math.min(i, SEG), s = c / SEG, y = L[c * 2], z = L[c * 2 + 1];
      const j0 = Math.max(0, c - 1), j1 = Math.min(SEG, c + 1), ty = L[j1 * 2] - L[j0 * 2], tz = L[j1 * 2 + 1] - L[j0 * 2 + 1], tl = Math.hypot(ty, tz);
      // (the normal in the limb's plane: square to the tangent, towards its back)
      const ny = -tz / tl, nz = ty / tl, w = i > SEG ? 0 : 0.022 - 0.013 * s, th = i > SEG ? 0 : 0.0085 - 0.0035 * s;
      for (let k = 0; k < RING; k++) {
        const a = (k / RING) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), cx = Math.sign(ca) * Math.abs(ca) ** 0.5, cy = Math.sign(sa) * Math.abs(sa) ** 0.7;
        const o = (i * RING + k) * 3;
        P[o] = cx * w; P[o + 1] = y + ny * cy * th; P[o + 2] = z + nz * cy * th;
      }
    }
    pos.needsUpdate = true;
    this.limbGeo.computeVertexNormals();
    this.limbGeo.computeBoundingSphere();
    // the string's two halves, tip to nock
    [this.tipU, this.tipL].forEach((tip, i) => {
      const s = this.strings[i], d = _a.copy(tip).sub(this.nock);
      s.position.copy(this.nock); s.scale.set(1, d.length(), 1); s.quaternion.setFromUnitVectors(_up, d.normalize());
    });
    this.serving.position.copy(this.nock);
    this.serving.quaternion.copy(this.strings[0].quaternion);
  }

  /** `n` arrows on the string, a fan `spread` apart (rad), lying from the nock over the rest; or, with the bow laid over
   *  flat (`flat`: its +x down), fanned out across its top. 0 takes them off. */
  nockArrows(n: number, spread = 0, flat = false): void {
    const d = _b.set(0, REST_Y, 0).sub(this.nock).normalize();
    this.arrows.forEach((a, i) => {
      a.visible = i < n;
      if (i >= n) return;
      const yaw = (i - (n - 1) / 2) * spread;
      _a.copy(d).applyAxisAngle(flat ? SIDE : _up, yaw);
      a.quaternion.setFromUnitVectors(FWD, _a);
      a.position.copy(this.nock).addScaledVector(_a, ARROW / 2 - 0.008);
      // (on top of the riser and the limbs, which the outer arrows cross)
      if (flat) a.position.x -= 0.024;
    });
  }
}
const FWD = new THREE.Vector3(0, 0, 1), SIDE = new THREE.Vector3(1, 0, 0);
