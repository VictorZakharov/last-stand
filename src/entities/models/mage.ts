// The Mage: hooded, layered robes with animated skirt panels, a cape and a
// crystal-headed staff. Fully procedural geometry + animation.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, part, joint, resetPose, walkCycle, idle, deathFall, pulse, ramp } from './rig';
import { clamp } from '../../util';
import { SkeletonCape } from './cape';
import type { CapeFabricPalette } from '../../vendor/cape/physics/CapeAppearance';
import type { AnimState, Model } from '../../types';

const ZERO = new THREE.Vector3();

/** Indigo cape with gold trim, matching the robes. */
const MAGE_CAPE_PALETTE: CapeFabricPalette = Object.freeze({
  fabric: [30, 34, 86] as const,
  trim: [196, 156, 72] as const,
  sheenColor: 0x2c3a9a,
  attachmentColor: 0x1e2256,
  materialName: 'Woven indigo mage cape',
});

export function buildMage(): Model {
  const kit = createKit(0x5dffa8);
  const g = pbrMaterialMaps(grunge(), 3, 0.6);
  const robe = kit.std({ color: 0x1b2248, roughness: 0.85, roughnessMap: g.roughnessMap, normalMap: g.normalMap, normalScale: g.normalScale });
  const robeDark = kit.std({ color: 0x10132a, roughness: 0.9, roughnessMap: g.roughnessMap, side: THREE.DoubleSide });
  const lining = kit.std({ color: 0x5a0f1c, roughness: 0.8, side: THREE.DoubleSide });
  const gold = kit.std({ color: 0xc9a14a, metalness: 1, roughness: 0.32 });
  const steel = kit.std({ color: 0x3b3f4c, metalness: 0.85, roughness: 0.4, roughnessMap: g.roughnessMap });
  const leather = kit.std({ color: 0x2c1f18, roughness: 0.7, normalMap: g.normalMap });
  const wood = kit.std({ color: 0x2a1a12, roughness: 0.6, normalMap: g.normalMap });
  const face = kit.std({ color: 0x050508, roughness: 1 });
  const glow = kit.glow(0x5dffa8, 5);
  const gem = kit.phys({ color: 0x2aff9a, emissive: 0x2aff9a, emissiveIntensity: 2.5, roughness: 0.05, metalness: 0, clearcoat: 1, flatShading: true });

  const j = buildHumanoid({ skin: face, torso: robe, legs: leather, feet: steel, arms: robe, hands: leather }, {
    chestW: 0.21, chestD: 0.14, shoulderW: 0.25, upperR: 0.06, foreR: 0.05,
  });

  // --- belt, sash, collar
  part(new THREE.TorusGeometry(0.165, 0.028, 8, 24).rotateX(Math.PI / 2).scale(1, 1, 0.85), gold, j.spine, 0, 0.02, 0);
  part(new THREE.OctahedronGeometry(0.035), gem, j.spine, 0, 0.02, 0.14);
  part(new THREE.CylinderGeometry(0.2, 0.15, 0.14, 20, 1, true, Math.PI * 0.55, Math.PI * 1.9), lining, j.chest, 0, 0.29, -0.01);
  part(new THREE.TorusGeometry(0.19, 0.012, 6, 24, Math.PI * 1.4).rotateX(Math.PI / 2).rotateY(Math.PI * 0.8), gold, j.chest, 0, 0.35, 0);

  // chest plate / tabard
  const tabard = part(new THREE.BoxGeometry(0.2, 0.34, 0.02), robeDark, j.chest, 0, 0.06, 0.13);
  tabard.rotation.x = -0.12;
  part(new THREE.BoxGeometry(0.02, 0.34, 0.025), gold, j.chest, 0.1, 0.06, 0.135).rotation.x = -0.12;
  part(new THREE.BoxGeometry(0.02, 0.34, 0.025), gold, j.chest, -0.1, 0.06, 0.135).rotation.x = -0.12;

  // --- skirt: 8 panels hinged at the waist that react to the legs
  const skirt: { flap: THREE.Group; a: number }[] = [];
  const panels = 8;
  const panelGeo = new THREE.CylinderGeometry(0.2, 0.3, 0.62, 5, 3, true, -Math.PI / panels * 1.25, (Math.PI * 2) / panels * 1.25);
  panelGeo.translate(0, -0.31, 0);
  for (let i = 0; i < panels; i++) {
    const a = (i / panels) * Math.PI * 2;
    const hinge = joint(j.hips, 0, 0.02, 0);
    hinge.rotation.y = a;
    const flap = joint(hinge);
    part(panelGeo, i % 2 ? robe : robeDark, flap);
    // gold hem
    const hem = part(new THREE.TorusGeometry(0.3, 0.008, 4, 6, (Math.PI * 2) / panels * 1.2).rotateX(Math.PI / 2).rotateY(Math.PI / 2 - Math.PI / panels * 0.6), gold, flap, 0, -0.62, 0);
    hem.castShadow = false;
    skirt.push({ flap, a });
  }

  // --- pauldrons
  for (const [s, sh] of [[1, j.shoulderL], [-1, j.shoulderR]] as const) {
    const p = joint(sh, s * 0.02, 0.03, 0);
    part(new THREE.SphereGeometry(0.115, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.1, 0.8, 1.1), steel, p);
    part(new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4).scale(1.15, 0.55, 1.15), robeDark, p, 0, -0.05, 0);
    part(new THREE.TorusGeometry(0.125, 0.01, 6, 20).rotateX(Math.PI / 2), gold, p, 0, 0.0, 0);
    part(new THREE.ConeGeometry(0.03, 0.12, 6), gold, p, s * 0.05, 0.1, 0).rotation.z = -s * 0.5;
  }
  // flared sleeves + bracers
  for (const el of [j.elbowL, j.elbowR]) {
    part(new THREE.CylinderGeometry(0.06, 0.1, 0.22, 12, 1, true), robeDark, el, 0, -0.15, 0);
    part(new THREE.CylinderGeometry(0.052, 0.055, 0.1, 10), steel, el, 0, -0.08, 0);
  }

  // --- hood with a shadowed face and glowing eyes
  const hood = joint(j.head, 0, 0.1, 0);
  const hoodGeo = new THREE.SphereGeometry(0.155, 24, 16, Math.PI * 0.5 + 0.55, Math.PI * 2 - 1.1, 0, Math.PI * 0.72);
  (part(hoodGeo, robe, hood).material as THREE.Material).side = THREE.DoubleSide;
  part(new THREE.ConeGeometry(0.1, 0.22, 12).rotateX(-2.2), robe, hood, 0, 0.02, -0.16);
  part(new THREE.TorusGeometry(0.152, 0.01, 6, 24, Math.PI * 1.1).rotateY(-Math.PI / 2).rotateZ(Math.PI * 0.95), gold, hood, 0, 0.0, 0.0);
  part(new THREE.SphereGeometry(0.11, 14, 10), face, hood, 0, -0.02, 0.02);
  for (const s of [1, -1]) {
    const eye = part(new THREE.SphereGeometry(0.014, 8, 6).scale(1.4, 0.7, 1), glow, hood, s * 0.04, 0.0, 0.115);
    eye.castShadow = false;
  }
  // mantle over shoulders
  part(new THREE.CylinderGeometry(0.17, 0.3, 0.16, 20, 1, true), robeDark, j.chest, 0, 0.3, -0.01);

  // --- cape (vertex animated)
  // simulated after the root exists (see below)

  // --- staff (right hand)
  const staff = joint(j.handR, 0, -0.05, 0.02);
  staff.rotation.x = 0.05;
  part(new THREE.CylinderGeometry(0.022, 0.028, 1.75, 8), wood, staff, 0, 0.35, 0);
  for (const y of [-0.45, 0.0, 0.9, 1.05]) part(new THREE.CylinderGeometry(0.032, 0.032, 0.05, 8), gold, staff, 0, y, 0);
  part(new THREE.ConeGeometry(0.03, 0.12, 8).rotateX(Math.PI), steel, staff, 0, -0.58, 0);
  // head: two curved prongs cradling a floating crystal
  for (const s of [1, -1]) {
    const prong = part(new THREE.TorusGeometry(0.13, 0.016, 6, 16, Math.PI * 0.9), gold, staff, s * 0.02, 1.33, 0);
    prong.rotation.set(0, s > 0 ? 0 : Math.PI, Math.PI * 0.55);
  }
  const tip = joint(staff, 0, 1.42, 0);
  const crystal = part(new THREE.OctahedronGeometry(0.07, 0).scale(0.8, 1.6, 0.8), gem, tip);
  crystal.castShadow = false;
  const ringA = part(new THREE.TorusGeometry(0.14, 0.004, 4, 32), glow, tip);
  const ringB = part(new THREE.TorusGeometry(0.11, 0.004, 4, 32), glow, tip);
  ringA.castShadow = ringB.castShadow = false;

  // offhand focus point (left palm)
  const palm = joint(j.handL, 0, -0.08, 0.03);

  const root = j.root;
  root.scale.setScalar(1.08);

  // --- cape: position-based-dynamics cloth (cape-physics solver), pinned under the
  // mantle and colliding with a capsule rig that follows the animated skeleton.
  const cape = new SkeletonCape({
    anchor: j.chest, root,
    left: [0.11, 0.3, -0.16], right: [-0.11, 0.3, -0.16],
    palette: MAGE_CAPE_PALETTE,
    // narrower than the cape-physics default: the mage holds staff and orb in front,
    // so a wide cape would drape over the arms and stick out forward
    settings: { length: 1.42, width: 0.74 },
    capsules: [
      { name: 'shoulders', a: j.shoulderL, offA: [0.02, 0.03, 0], b: j.shoulderR, offB: [-0.02, 0.03, 0], radius: 0.12, clearance: 0.008 },
      { name: 'gorget', a: j.chest, offA: [0, 0.27, 0], radius: 0.17, clearance: 0.006, faceSampleSpacing: 0.03 },
      { name: 'upper torso', a: j.chest, offA: [0, 0.22, 0], offB: [0, -0.02, 0], radius: 0.24, depthRadius: 0.17, clearance: 0.006, faceSampleSpacing: 0.07 },
      { name: 'hips', a: j.hips, offA: [0, 0.02, 0], offB: [0, -0.25, 0], radius: 0.24, depthRadius: 0.22, clearance: 0.008, faceSampleSpacing: 0.08 },
      { name: 'robe skirt', a: j.hips, offA: [0, -0.3, 0], offB: [0, -0.55, 0], radius: 0.31, depthRadius: 0.3, clearance: 0.008, faceSampleSpacing: 0.08 },
      { name: 'left arm', a: j.shoulderL, offA: [0, -0.02, 0], b: j.elbowL, radius: 0.07, clearance: 0.006 },
      { name: 'right arm', a: j.shoulderR, offA: [0, -0.02, 0], b: j.elbowR, radius: 0.07, clearance: 0.006 },
      { name: 'left thigh', a: j.thighL, offA: [0, -0.1, 0], b: j.kneeL, radius: 0.11 },
      { name: 'left shin', a: j.kneeL, b: j.ankleL, radius: 0.085 },
      { name: 'left boot', a: j.ankleL, offA: [0, -0.03, 0.02], offB: [0, -0.03, 0.12], radius: 0.08 },
      { name: 'right thigh', a: j.thighR, offA: [0, -0.1, 0], b: j.kneeR, radius: 0.11 },
      { name: 'right shin', a: j.kneeR, b: j.ankleR, radius: 0.085 },
      { name: 'right boot', a: j.ankleR, offA: [0, -0.03, 0.02], offB: [0, -0.03, 0.12], radius: 0.08 },
    ],
  });
  function animate(st: AnimState): void {
    const { t, dt } = st;
    resetPose(j);
    const move = st.move;
    const dir = st.moveDir ?? 1;

    // base stance: staff held at the side, slightly forward
    idle(j, t, 1 - move * 0.6);
    walkCycle(j, st.phase, move, { stride: 0.5, knee: 0.95, arm: 0.35, bob: 0.07, dir });
    j.shoulderR.rotation.x += -0.35; j.shoulderR.rotation.z += -0.12; j.elbowR.rotation.x += -0.55;
    j.spine.rotation.x += move * 0.12 * dir;
    j.body.rotation.z += (st.lean || 0) * 0.12;

    const a = st.action;
    if (a) {
      const k = a.t;
      if (a.name === 'cast') {
        const w = pulse(k, 0, 1);
        j.shoulderR.rotation.x += -1.05 * w; j.elbowR.rotation.x += 0.45 * w;
        j.shoulderL.rotation.x += -1.2 * w; j.shoulderL.rotation.z += 0.25 * w; j.elbowL.rotation.x += -0.2 * w;
        j.chest.rotation.y += 0.35 * w; j.spine.rotation.x += 0.12 * w;
      } else if (a.name === 'channel') {
        const tr = Math.sin(t * 40) * 0.02;
        j.shoulderL.rotation.x += -1.45 + tr; j.shoulderL.rotation.z += -0.2; j.elbowL.rotation.x += 0.05;
        j.shoulderR.rotation.x += -0.9; j.elbowR.rotation.x += 0.2;
        j.chest.rotation.y += 0.25; j.spine.rotation.x += 0.15;
      } else if (a.name === 'slam') {
        const up = ramp(k, 0, 0.45) * (1 - ramp(k, 0.5, 0.7));
        const down = ramp(k, 0.5, 0.7) * (1 - ramp(k, 0.8, 1));
        j.shoulderL.rotation.x += -2.7 * up - 0.6 * down; j.shoulderR.rotation.x += -2.4 * up - 0.6 * down;
        j.shoulderL.rotation.z += 0.3 * up; j.shoulderR.rotation.z += -0.3 * up;
        j.body.position.y += -0.16 * down; j.kneeL.rotation.x += 0.5 * down; j.kneeR.rotation.x += 0.5 * down;
        j.thighL.rotation.x += -0.35 * down; j.thighR.rotation.x += -0.35 * down;
        j.spine.rotation.x += 0.35 * down - 0.15 * up;
      } else if (a.name === 'buff') {
        const w = pulse(k, 0, 1);
        j.shoulderL.rotation.x += -1.6 * w; j.shoulderL.rotation.z += 0.8 * w;
        j.shoulderR.rotation.x += -0.8 * w; j.shoulderR.rotation.z += -0.6 * w;
        j.neck.rotation.x += -0.3 * w;
      }
    }
    if (st.hit > 0) { j.spine.rotation.x += -0.25 * st.hit; j.neck.rotation.x += -0.2 * st.hit; }
    if (st.dead >= 0) deathFall(j, st.dead, -1);

    // skirt panels follow the legs + flare with speed
    const fL = -j.thighL.rotation.x, fR = -j.thighR.rotation.x;
    for (const p of skirt) {
      const sx = Math.sin(p.a), cz = Math.cos(p.a);
      const wl = clamp(0.5 + sx * 0.9, 0, 1);
      const legPush = (fL * wl + fR * (1 - wl)) * cz;
      const flare = 0.06 + move * 0.08 + Math.sin(t * 3 + p.a * 3) * 0.015;
      p.flap.rotation.x = -(Math.max(-0.1, legPush * 0.8) + flare) - (cz > 0 ? 0 : move * 0.25 * -cz);
    }

    // cloth runs after the pose so it collides with this frame's skeleton
    if (dt > 0) cape.update(dt, st.velocity ?? ZERO);
    cape.setVisible(st.dead < 0.6);

    // staff crystal
    crystal.rotation.y = t * 2.2;
    crystal.position.y = Math.sin(t * 3) * 0.02;
    ringA.rotation.set(t * 1.7, t * 1.1, 0);
    ringB.rotation.set(-t * 1.3, 0, t * 2.1);
    const charge = st.charge || 0;
    gem.emissiveIntensity = 2.5 + charge * 6 + Math.sin(t * 6) * 0.4;
  }

  return {
    root, kit, joints: j, animate, tip, palm, height: 2.0,
    worldObjects: [cape.mesh],
    reset: () => cape.reset(),
    dispose() {
      kit.dispose();
      cape.dispose();
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}
