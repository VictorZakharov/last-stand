// Fur that moves: each fur mesh (a collar, a cuff) gets a damped spring that lags the acceleration of the
// joint it rides, plus a light flutter, both applied in the vertex shader (the engine's kit look: engine/looks/kit.ts
// reads `userData.fur`) so the tufts (a static merged mesh) cost nothing extra to draw. A tuft's weight along its
// length is its uv's v (0 at the root, 1 at the tip: `furTufts` scales it by three), so roots stay put and tips swing.
// One material copy per mesh: the meshes each have their own lag.
import { Material, Mesh, Quat, Vec3 } from '../../engine/api/index.ts';
import { sameLooks } from '../../core/materials';

/** `?fur=0` keeps the fur still, for A/B comparison */
const FUR = typeof location === 'undefined' || !/[?&]fur=0/.test(location.search);
const F = 3.2, ZETA = 0.22, MAX = 0.05, GAIN = 0.9;
const _w = new Vec3(), _q = new Quat(), _s = new Vec3(), _l = new Vec3();

export class FurSway {
  readonly material: Material;
  private readonly lag = { value: new Vec3() };
  private readonly time = { value: 0 };
  private readonly x = new Vec3();   // the spring's displacement (world), and its speed
  private readonly v = new Vec3();
  private readonly pos = new Vec3();
  private readonly vel = new Vec3();
  private readonly centre = new Vec3();
  private fresh = true;

  constructor(private readonly mesh: Mesh, base: Material) {
    const m = this.material = base.clone();
    sameLooks(m, base);
    // (each mesh's lag its own: a merge of the hero's parts would take it still)
    mesh.userData.drawsAlone = true;
    mesh.material = m;
    mesh.userData.furLag = this.lag;   // (read by probes)
    // (what the Rust engine's kit look sways it by: engine/looks/kit.ts)
    m.userData.fur = { lag: this.lag, time: this.time };
    mesh.geometry.computeBoundingSphere();
    this.centre.copy(mesh.geometry.boundingSphere!.center);
  }

  /** after the pose, the mesh's world matrix current */
  update(dt: number): void {
    const mesh = this.mesh;
    mesh.updateWorldMatrix(true, false);
    _w.copy(this.centre).applyMatrix4(mesh.matrixWorld);
    if (this.fresh || _w.distanceToSquared(this.pos) > 4) { this.pos.copy(_w); this.vel.set(0, 0, 0); this.x.set(0, 0, 0); this.v.set(0, 0, 0); this.fresh = false; }
    dt = Math.min(dt, 1 / 30);
    if (dt <= 0 || !FUR) return;
    const vel = _l.copy(_w).sub(this.pos).divideScalar(dt), acc = vel.sub(this.vel).divideScalar(dt);
    this.vel.copy(_w).sub(this.pos).divideScalar(dt);
    this.pos.copy(_w);
    // the tuft's tip is a mass on a spring hung from the joint: an acceleration pushes it the other way
    const w = 2 * Math.PI * F, k = w * w, c = 2 * ZETA * w;
    this.v.addScaledVector(acc, -1 * dt).addScaledVector(this.x, -k * dt).addScaledVector(this.v, -c * dt);
    this.x.addScaledVector(this.v, dt);
    if (this.x.length() > MAX) this.x.setLength(MAX);
    // into the mesh's own space, at the model's scale
    mesh.matrixWorld.decompose(_w, _q, _s);
    this.lag.value.copy(this.x).applyQuaternion(_q.invert()).multiplyScalar(GAIN / _s.x);
    this.time.value += dt;
  }

  dispose(): void { this.material.dispose(); }
}
