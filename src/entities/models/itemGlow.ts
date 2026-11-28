// A worn item's glow in its rarity's colour (#404): a Rare item and better glows faintly over its own colour and the
// hero's dye, most at its edges, wisps drifting slowly up it and breathing (`ITEM_GLOW` in core/materials.ts). No
// light and no program of its own: each item's parts draw with copies of their kit materials (`kitCopy`), the same
// program as every kit material's, their glow a uniform's colour of their own.
import { Color, Material, Mesh, Node, noteChanged } from '../../engine/api/index.ts';
import { ITEM_GLOW, kitCopy, ownAura } from '../../core/materials';
import { sameKitMaterial } from './kitTwin';
import { isDualQuaternionSkinned } from './dualQuaternion';
import { RARITIES } from '../../data/items';
import type { Gear, GlowSlot, RarityId } from '../../types';

/** the lowest rarity that glows (from play: "if green or above") */
const FROM: RarityId = 'rare';
const ORDER: RarityId[] = RARITIES.map((r) => r.id);

/** how strongly each glowing rarity glows against the rest (its colour times this and `ITEM_GLOW.strength`): the rarer
 *  a little more */
export const GLOW_STRENGTH: Partial<Record<RarityId, number>> = { rare: 1, epic: 1.15, legendary: 1.35, ascendant: 1.2, ultimate: 1.2 };
/** a rarity's weapon glowing less than `ITEM_GLOW.weapon` times the rest: Ascendant's orange (#403), its red near
 *  full, clipped at that and coated the bow in a flat paint (an adversarial review's FAIL). (Over a warm dye, gold
 *  above all, its strands read as rust more than light, as any orange or amber tried did, lighter ones as dirt: its
 *  light added saturation more than value, no pixel darker. A hot core to the strands is the shader's to give.) */
const WEAPON_SHARE: Partial<Record<RarityId, number>> = { ascendant: 0.6, ultimate: 0.6 };

/** The colour (linear) an item of `rarity` glows, black for none. */
export function glowOf(rarity: RarityId | undefined, out: Color): Color {
  if (!rarity || ORDER.indexOf(rarity) < ORDER.indexOf(FROM)) return out.setRGB(0, 0, 0);
  return out.set(RARITIES.find((r) => r.id === rarity)!.color).multiplyScalar(GLOW_STRENGTH[rarity] ?? 1);
}

/** how `ItemGlows.add` takes an item's parts */
interface GlowParts {
  inPlace?: boolean;
  only?: (mesh: Mesh) => boolean;
}

/** Whether `mesh` is drawn in one of `materials`, or a copy of one (a skinned part's, `Sculpt.build`:
 *  models/kitTwin.ts), not a hand's (skinned by dual quaternions: a hand is given its glow in place, `inPlace`). */
export function drawnIn(mesh: Mesh, materials: Material[]): boolean {
  const isCopy = (m: Material): boolean => materials.some((x) => sameKitMaterial(x, m));
  return [mesh.material].flat().some((m) => !isDualQuaternionSkinned(m) && isCopy(m));
}

export class ItemGlows {
  private readonly auras = new Map<GlowSlot, Color[]>();
  /** each slot's glowing materials, told as their glow is set (`noteChanged`: the engine asks them only then) */
  private readonly glowing = new Map<GlowSlot, Material[]>();

  /** `kitMats`: the kit's materials, which the copies join (disposed with them) */
  constructor(private readonly kitMats: Material[]) {}

  /**
   * The meshes under `parts` glow as `slot`'s item. Each kit material among them is copied once for the slot, so the
   * rest of the hero in that material doesn't glow; `inPlace`, it keeps its material and is given a glow of its own
   * (a material already the item's alone, whose hook a wrapper calls with that material: the hands' copies,
   * `hands.ts`). `only`: of the meshes under `parts`, these alone (a coat's among the body's). Call as the model is
   * built, before it's first drawn: the glow's uniform is taken as it compiles.
   */
  add(slot: GlowSlot, parts: Iterable<Node>, { inPlace = false, only }: GlowParts = {}): this {
    const copies = new Map<Material, Material>();
    const auras = this.auras.get(slot) ?? [];
    this.auras.set(slot, auras);
    const glowing: Material[] = [];
    this.glowing.set(slot, glowing);
    for (const part of parts) {
      part.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh || (only && !only(mesh))) return;
        const mine = (material: Material): Material => {
          if (!(material as { kitLooks?: unknown }).kitLooks) return material;
          let copy = copies.get(material);
          if (copy) return copy;
          if (inPlace) {
            copies.set(material, material);
            const aura = ownAura(material);
            if (aura) {
              auras.push(aura);
              glowing.push(material);
            }
            return material;
          }
          copy = kitCopy(material);
          copies.set(material, copy);
          this.kitMats.push(copy);
          auras.push((copy as unknown as { kitLooks: { aura: { value: Color } } }).kitLooks.aura.value);
          glowing.push(copy);
          return copy;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(mine) : mine(mesh.material);
      });
    }
    return this;
  }

  /** Each slot's parts glow as the rarity of the item worn there has it (`Gear.rarity`). */
  set(gear: Gear): void {
    for (const [slot, auras] of this.auras) {
      const rarity = gear.rarity[slot];
      const share = rarity ? WEAPON_SHARE[rarity] ?? 1 : 1;
      const scale = slot === 'weapon' ? ITEM_GLOW.weapon * share : 1;
      for (const aura of auras) glowOf(rarity, aura).multiplyScalar(scale);
      for (const material of this.glowing.get(slot) ?? []) noteChanged(material);
    }
  }
}
