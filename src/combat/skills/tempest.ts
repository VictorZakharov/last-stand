// Steel Tempest: channelled spin that shreds everything around the caster.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { sfx } from '../../core/audio';
import { slashMesh } from './slash';
import { sparks } from './cleave';
import type { ChannelSkill, Needs } from './types';

type Def = Needs<'damage' | 'radius'>;

interface TempestState { group: THREE.Group; arcs: ReturnType<typeof slashMesh>[]; tick: number; whoosh: number; t: number }

const TICK = 0.2;
const ARC = 2.6;
const COLOR = 0xe8eef8;
const BLADE = 0.68;

const skill: ChannelSkill<TempestState> = {
  anim: 'channel',
  channel: true,
  warm: () => [slashMesh(ARC, 0.55, COLOR).mesh],
  start() {
    const group = new THREE.Group();
    // two opposed blade trails, one bright and one fainter and lower
    const arcs = [slashMesh(ARC, 0.55, COLOR), slashMesh(ARC, 0.6, 0xffc080)];
    arcs[1].mesh.rotation.y = Math.PI;
    arcs[1].mesh.position.y = -0.25;
    for (const a of arcs) group.add(a.mesh);
    G.scene.add(group);
    return { group, arcs, tick: 0, whoosh: 0, t: 0 };
  },

  tick(player, rawDef, dt, st) {
    const def = rawDef as Def;
    st.t += dt;
    st.group.position.set(player.pos.x, player.obj.position.y + 1.0, player.pos.z);
    st.group.scale.setScalar(def.radius * 0.8);   // the blade's reach; hits count the foe's size too
    // the trail's head follows the blade: the model spins at 15 rad/s with the sword out to its
    // right, angled 0.68 rad forward (measured from the rig)
    st.group.rotation.y = player.facing + G.time * 15 - Math.PI / 2 + BLADE - ARC / 2;
    const fade = Math.min(1, st.t / 0.15);
    st.arcs[0].mat.uniforms.uFade.value = fade * 0.6;
    st.arcs[1].mat.uniforms.uFade.value = fade * 0.3;

    st.whoosh -= dt;
    if (st.whoosh <= 0) { st.whoosh = 0.21; sfx.swing(); }
    st.tick += dt;
    if (st.tick < TICK) return;
    st.tick -= TICK;
    const p = player.pos;
    let hits = 0;
    for (const e of G.enemies) {
      if (!e.alive || Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > def.radius + e.radius) continue;
      hitEnemy(e, def.damage * TICK, { tags: def.tags, type: 'physical', knock: 0.8, from: p });
      sparks(e.pos.x, e.height * 0.55, e.pos.z, 0xffe0b0, 4);
      hits++;
    }
    if (hits) sfx.clang();
  },

  stop(_player, _def, st) {
    G.scene.remove(st.group);
    for (const a of st.arcs) a.dispose();
  },
};

export default skill;
