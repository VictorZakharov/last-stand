// A hero's cloth dyed in a player's colour (data/heroColours.ts): the colour of each material a model names, and of
// its rim light, set again; nothing else. A colour is a material's value, never a variant of its shader, so a dye
// compiles nothing (root AGENTS.md: shaders compile at load).
import { Color, Material, Mesh, Node, SRGBColorSpace } from '../../engine/api/index.ts';
import { heroColour, type HeroColourId } from '../../data/heroColours.ts';
import type { KitLooks } from '../../core/materials';
import { sameKitMaterial } from './kitTwin.ts';
import { isDualQuaternionSkinned } from './dualQuaternion.ts';

interface Dyed {
  material: Material & { color: Color };
  /** its colour and its rim's as built */
  color: Color;
  tone: Color;
  matched: boolean;
  rim: Color | null;
  rimBuilt: Color | null;
  tint: boolean;
}

const _hsl = { h: 0, s: 0, l: 0 };

export class Dye {
  private readonly dyed: Dyed[] = [];
  /** the main cloth's colour as built (HSL): every dyed colour keeps its shade against it */
  private readonly main = { h: 0, s: 0, l: 0 };

  /** `native`: the colour the hero is built in (that colour leaves him as he is) */
  readonly native: HeroColourId;
  constructor(native: HeroColourId) { this.native = native; }

  /** Cloth dyed with the rest, the main cloth first. */
  cloth(...materials: Material[]): this {
    return this.add(materials, false);
  }

  /** Added surfaces keep their original look under Any, but take even the class's explicit native colour. */
  tint(...materials: Material[]): this {
    return this.add(materials, true);
  }

  /** Cover another torso surface in the cloth's shade, while Any still restores its original material colour. */
  tintLike(reference: Material, ...materials: Material[]): this {
    return this.add(materials, true, (reference as Dyed['material']).color);
  }

  private add(materials: Material[], tint: boolean, reference?: Color): this {
    for (const material of materials) {
      const m = material as Dyed['material'];
      const rim = (material as { kitLooks?: KitLooks }).kitLooks?.rim.value ?? null;
      if (!this.dyed.length) m.color.getHSL(this.main, SRGBColorSpace);
      const color = m.color.clone();
      this.dyed.push({ material: m, color, tone: reference?.clone() ?? color, matched: !!reference,
        rim, rimBuilt: rim?.clone() ?? null, tint });
    }
    return this;
  }

  /** The main cloth's colour as it's drawn now (hex, sRGB): what a harness reads to see a dye shown. */
  get shown(): number {
    return this.dyed[0]?.material.color.getHex() ?? 0;
  }

  /**
   * `built` as the colour `id` dyes it into `out`: the colour's own hue, and its saturation and lightness by `built`'s
   * against the main cloth's. (The hue too was kept against the main cloth's at first: the ranger's felt sits 0.03
   * greener than his coat, nothing in green, but in gold it turned olive and in red brown, the hat another cloth.)
   */
  private shade(built: Color, id: HeroColourId, out: Color, tint: boolean): void {
    const [h, s, l] = heroColour(id)!.hsl;
    built.getHSL(_hsl, SRGBColorSpace);
    let sat = this.main.s > 0.01 ? (_hsl.s * s) / this.main.s : s;
    let light = this.main.l > 0.01 ? (_hsl.l * l) / this.main.l : l;
    // Silver's low saturation and high lightness otherwise wash every dye back to almost white.
    if (tint) { sat = Math.max(sat, s * 0.65); light = Math.min(light, l * 1.7); }
    out.setHSL(h, Math.min(1, sat), Math.min(0.92, light), SRGBColorSpace);
  }

  /**
   * Dyes the hero under `root` in colour `id` (null, or his own: as built). A skinned part keeps a copy of its
   * material (`Sculpt.build`), found by the kit's mark it shares with its original (models/kitTwin.ts).
   */
  apply(root: Node, id: HeroColourId | null): void {
    const copies = new Map<Dyed, Dyed['material'][]>();
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      for (const material of [mesh.material].flat()) {
        // (not a hand's copy, skinned by dual quaternions: as under three, whose patch it wrapped, it isn't dyed)
        if (isDualQuaternionSkinned(material)) continue;
        const d = this.dyed.find((x) => x.material !== material && sameKitMaterial(x.material, material));
        if (d) copies.set(d, [...(copies.get(d) ?? []), material as Dyed['material']]);
      }
    });
    for (const d of this.dyed) {
      const own = !id || !heroColour(id) || (id === this.native && !d.tint);
      if (own) d.material.color.copy(d.color);
      else if (id === this.native && d.matched) d.material.color.copy(d.tone);
      else this.shade(d.tone, id, d.material.color, d.tint);
      for (const copy of copies.get(d) ?? []) copy.color.copy(d.material.color);
      if (d.rim && d.rimBuilt) {
        if (own) d.rim.copy(d.rimBuilt);
        else this.shade(d.rimBuilt, id, d.rim, d.tint);
      }
    }
  }
}
