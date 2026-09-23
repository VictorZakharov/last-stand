// Training dummy: a straw-stuffed burlap sack on a wooden post, with a glowing
// target rune. It wobbles on a spring when hit (lobby target practice).
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { burlap, pbrMaterialMaps, slabs, wood } from '../../core/textures';
import type { AnimState, Model } from '../../types';
import { part, joint } from './rig';

const STIFFNESS = 70, DAMPING = 5;

export function buildDummy(): Model {
  const kit = createKit(0xf0c860);
  const woodMat = kit.std({ ...pbrMaterialMaps(wood(), 1, 1.2), roughness: 1 });
  const sack = kit.std({ ...pbrMaterialMaps(burlap(), 2, 1.5), roughness: 1 });
  const straw = kit.std({ color: 0xc9a54e, roughness: 0.8 });
  const rope = kit.std({ color: 0x6e5a3a, roughness: 0.9 });
  const stone = kit.std({ ...pbrMaterialMaps(slabs(33, 2, 2), 1, 1.2), color: 0x9a9aa2 });
  const iron = kit.std({ color: 0x2a2a2e, roughness: 0.45, metalness: 0.8 });
  const paint = kit.std({ color: 0x1a1210, roughness: 0.9 });
  const rune = kit.glow(0xf0c860, 2.2);

  const root = new THREE.Group();
  // plinth (stays put while the rest wobbles)
  part(new THREE.CylinderGeometry(0.46, 0.52, 0.16, 20), stone, root, 0, 0.08, 0);
  part(new THREE.TorusGeometry(0.2, 0.025, 6, 18).rotateX(Math.PI / 2), iron, root, 0, 0.17, 0);

  const sway = joint(root, 0, 0.16, 0);
  part(new THREE.CylinderGeometry(0.06, 0.075, 1.9, 10), woodMat, sway, 0, 0.95, 0);

  // body: a bulging sack, tied at both ends
  const profile = [
    [0.05, 0], [0.2, 0.02], [0.28, 0.12], [0.31, 0.3], [0.3, 0.48], [0.25, 0.62], [0.14, 0.7], [0.06, 0.72],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  part(new THREE.LatheGeometry(profile, 20), sack, sway, 0, 0.7, 0);
  for (const y of [0.76, 1.3]) part(new THREE.TorusGeometry(y < 1 ? 0.23 : 0.21, 0.018, 6, 20).rotateX(Math.PI / 2), rope, sway, 0, y, 0);
  // straw spilling out below the sack
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const tuft = part(new THREE.ConeGeometry(0.03, 0.26, 4), straw, sway, Math.sin(a) * 0.13, 0.62, Math.cos(a) * 0.13);
    tuft.rotation.set(Math.PI + Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4);
    tuft.castShadow = false;
  }

  // arms: a crossbar with straw bundles bound at the ends
  part(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8).rotateZ(Math.PI / 2), woodMat, sway, 0, 1.22, 0);
  for (const s of [1, -1]) {
    part(new THREE.CylinderGeometry(0.07, 0.09, 0.26, 8).rotateZ(Math.PI / 2), sack, sway, s * 0.55, 1.22, 0);
    part(new THREE.TorusGeometry(0.075, 0.012, 5, 12).rotateY(Math.PI / 2), rope, sway, s * 0.5, 1.22, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const tuft = part(new THREE.ConeGeometry(0.022, 0.18, 4), straw, sway, s * 0.74, 1.22 + Math.sin(a) * 0.035, Math.cos(a) * 0.035);
      tuft.rotation.z = -s * Math.PI / 2 + Math.sin(a) * 0.3;
      tuft.castShadow = false;
    }
  }

  // head: a tied sack with painted eyes
  const head = joint(sway, 0, 1.66, 0);
  part(new THREE.SphereGeometry(0.19, 16, 12).scale(1, 1.08, 0.95), sack, head, 0, 0, 0);
  part(new THREE.TorusGeometry(0.1, 0.02, 6, 16).rotateX(Math.PI / 2), rope, head, 0, -0.17, 0);
  for (const s of [1, -1]) {
    for (const r of [0.7, -0.7]) {
      const bar = part(new THREE.BoxGeometry(0.075, 0.016, 0.01), paint, head, s * 0.07, 0.03, 0.175);
      bar.rotation.set(0, s * 0.3, r);
      bar.castShadow = false;
    }
  }
  for (let i = 0; i < 6; i++) {
    const tuft = part(new THREE.ConeGeometry(0.02, 0.16, 4), straw, head, (i - 2.5) * 0.02, 0.23, 0);
    tuft.rotation.z = (i - 2.5) * 0.22;
    tuft.castShadow = false;
  }

  // target rune on the chest
  const target = joint(sway, 0, 1.03, 0.3);
  target.rotation.x = -0.12;
  for (const [r0, r1] of [[0.13, 0.15], [0.07, 0.085]]) {
    part(new THREE.RingGeometry(r0, r1, 32), rune, target).castShadow = false;
  }
  part(new THREE.CircleGeometry(0.025, 16), rune, target).castShadow = false;

  // spring wobble: lean back when struck, sway a little sideways
  let lean = 0, leanV = 0, tilt = 0, tiltV = 0, prevHit = 0;
  function animate(st: AnimState): void {
    const dt = st.dt;
    if (st.hit > prevHit + 0.2) {
      leanV -= 2.2 * (st.hit - prevHit);
      tiltV += (Math.random() - 0.5) * 2.4;
    }
    prevHit = st.hit;
    leanV += (-STIFFNESS * lean - DAMPING * leanV) * dt; lean += leanV * dt;
    tiltV += (-STIFFNESS * tilt - DAMPING * tiltV) * dt; tilt += tiltV * dt;
    sway.rotation.set(lean + Math.sin(st.t * 0.9) * 0.01, 0, tilt);
    head.rotation.set(-lean * 0.6, 0, -tilt * 0.8);
  }

  return { root, kit, animate, height: 1.95, dispose() { kit.dispose(); } };
}
