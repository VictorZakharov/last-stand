// Material kit: every entity builds its materials through a kit so that
// shared per-entity FX uniforms (dissolve, frozen, charred, hit flash) can be driven
// with a single write each frame.
import {
  AdditiveBlending, Color, ColorRepresentation, DoubleSide, LitMaterial, LitParameters, Material, UnlitMaterial, Vec3,
  Vec4,
} from '../engine/api/index.ts';
import { tunable } from './tuning';
import { readCookie, writeCookie } from './cookies';

/**
 * Through the eyes the hero's own gear is held a hand's breadth from them, and a light's highlight on it fills the
 * view: the sun on a blade's flat (steel polished to 0.3) blew it out white and bloomed over 7.7% of the frame,
 * its rougher grime left as dark blots across it. There the highlights on his materials are eased from half of
 * `eyes` (light, HDR) towards it, as the eye stops down for a glint that near (`kit.u.uShine`, set each frame by his
 * player; 0 elsewhere, as they are). Measure with `npm run lab -- haze --class warrior --gear dual`.
 */
export const SHINE = tunable('shine', { eyes: 0.7 });

/**
 * Effect glows dim with their distance from the camera, the way a light up close dazzles and the eye stops
 * down: full strength from NEAR_GLOW.ref metres (the top-down camera, which effects are tuned for), then
 * (distance / ref)^pow, never below min.
 */
export const NEAR_GLOW = { ref: 20, pow: 0.75, min: 0.25 };


/**
 * A worn item's glow in its rarity's colour (#404, from play: "slight glow, not much, no light source", "should not
 * make it flat", "subtly animated (slowly)", "glow should be on the object, not around it", "tendrils need to animate
 * too, not just pan", "make sure glow is continuous/looped and not jumping"): tendrils of light on the item's own
 * surface, `strength` times its rarity's colour, `face` of it over all the item. A noise in the item's own space,
 * `across` cells a metre across it and `up` along it, warped by itself, its light in thin strands where it crosses
 * `centre`, `width` either side (light wherever it lay over a level made broad blobs, read on a robe as camouflage),
 * brighter over part of the item at a time, where the slow field that warps it is high (strands even everywhere made
 * a net; none outside those parts left a small item, a blade or a glove, without any);
 * as time goes on it drifts `rise` cells up and moves `turns` cells on through its own time each `cycle` s, and
 * wraps at both: after a cycle it is exactly where it began, so it loops with no join (a crossfade between two cycles
 * was seen as one; so was an odd `turns`, which its warp's half scale left a cell short: both are rounded even). Chosen on a flat panel first (`.tmp`'s live page, then `lab glow`); an outline, an even tint
 * and blotches were each turned down. A material's own colour (its `kitLooks.aura`, black for none), the same shape
 * for all: `ITEM_GLOW` the shape, `tickItemGlow` its clock, the colour the item's (`models/itemGlow.ts`).
 */
export const ITEM_GLOW = tunable('itemGlow', {
  strength: 0.07, face: 0.05, across: 6, up: 3, centre: 0.5, width: 0.05, rise: 2, turns: 4, cycle: 16,
  // the weapon's glow this many times the rest: its brightest strands past the bloom's threshold, a soft light round
  // them (from play: "a bit of glow on weapon only, in addition to the shader"); read as its gear is set. The rest at
  // 0.07 (0.12 before: "more subtle... 4 player coop might look too distracting"), the weapon kept as it was
  weapon: 10,
});
/** the glow's shape (x its cells a metre across, y along, z the level its strands lie on, w how far either side), its loop (x the cells
 *  it rises a cycle, y the cells it moves on through time, z the face's share, w the strength) and its clock (the
 *  share of its cycle, 0 to 1: kept small on the CPU, as a game's time grows past what a float holds finely) */
const AURA_SHAPE = { value: new Vec4() };
const AURA_LOOP = { value: new Vec4() };
const AURA_CLOCK = { value: 0 };
/** what the engine's kit look reads them by (engine/looks/kit.ts) */
export const itemGlowUniforms = { shape: AURA_SHAPE, loop: AURA_LOOP, clock: AURA_CLOCK };

/** A loop's cells rounded to an even count: the noise wraps where the cycle does only in whole cells, and the slow
 *  field that warps it runs at half the scale (`turns` 3 left it 1.5 cells, and it jumped as each cycle began). */
const wholeAtHalf = (cells: number): number => Math.max(2, 2 * Math.round(cells / 2));

/** the setting (Settings' Gear glow, the cookie): on unless turned off ("opt in, enabled by default, but can be
 *  disabled in pause menu settings"); off, the glow's strength is 0, a uniform's value: nothing compiles, and a
 *  pixel passes its strands over (worked out and multiplied by nothing, Off saved none of the 3 to 10% of the frame
 *  the glow takes where gear fills the view: `npm run lab -- glowcost`). Until the player chooses, the quality
 *  level decides (`QualityPreset.gearGlow`: off at Very low; from play, "turn off gear glow automatically at very
 *  low, could be toggled on in settings if user prefers it on"). */
const GLOW_COOKIE = 'last-stand-gear-glow';
// Geometry workers import the material kit too; they have no page preferences or document.
const glowKept = typeof document === 'undefined' ? null : readCookie(GLOW_COOKIE);
/** the player's own choice, null while none was made */
let gearGlowChosen: boolean | null = glowKept === 'on' ? true : glowKept === 'off' ? false : null;
/** what the quality level in effect has it at */
let gearGlowByLevel = true;

/** Whether worn gear glows in its rarity's colour: the player's choice, else the quality level's. */
export const gearGlow = (): boolean => gearGlowChosen ?? gearGlowByLevel;

/** The setting: worn gear glowing or not, kept for the next visit, whatever the quality level. */
export function setGearGlow(on: boolean): void {
  gearGlowChosen = on;
  writeCookie(GLOW_COOKIE, on ? 'on' : 'off');
}

/** Whether worn gear glows at the quality level in effect, where the player hasn't chosen (core/quality.ts). */
export function setGearGlowByLevel(on: boolean): void {
  gearGlowByLevel = on;
}

/** The glow's clock moved to the game's (`G.time`, s), and its shape read, once a frame. */
export function tickItemGlow(time: number): void {
  const { strength, face, across, up, centre, width, rise, turns, cycle } = ITEM_GLOW;
  AURA_SHAPE.value.set(across, up, centre, width);
  AURA_LOOP.value.set(wholeAtHalf(rise), wholeAtHalf(turns), face, gearGlow() ? strength : 0);
  AURA_CLOCK.value = (((time % cycle) + cycle) % cycle) / cycle;
}

/** A kit material's looks as the engine reads them: the kit's uniforms, and the
 *  material's own near glow and rim. */
export interface KitLooks {
  u: Record<'uDissolve' | 'uFrozen' | 'uChar' | 'uHit' | 'uShine', { value: number }> & { uEdge: { value: Color } };
  near: { value: number };
  rim: { value: Color };
  /** the hood's shade (`Head.shade`): how deep, where up the mesh it's full, where it's gone, how much more aside */
  shade: { value: Vec4 };
  /** a worn item's glow in its rarity's colour (`ITEM_GLOW`), black for none: the material's own, never the kit's */
  aura: { value: Color };
  /** a painted face's hair moved to another colour (`kit.face`, models/head.ts `setHair`): the picked colour less the
   *  face's own, in the paint's sRGB, added in the share of hair its roughness map's blue holds; none, as painted */
  hair: { value: Vec3 };
  /** whether the material reads `hair` (`kit.face`'s alone) */
  hairTinted: boolean;
}

export function createKit(edgeColor: ColorRepresentation = 0x66ffcc) {
  const u = {
    uDissolve: { value: 0 },
    uFrozen: { value: 0 },
    /** burnt: charred black, embers glowing in its cracks (a body the fire killed, entities/corpse.ts) */
    uChar: { value: 0 },
    uHit: { value: 0 },
    uEdge: { value: new Color(edgeColor).multiplyScalar(3) },
    /** the most light a highlight reflects, eased into from half of it (`SHINE`); 0: as it is */
    uShine: { value: 0 },
  };
  const mats: Material[] = [];

  /**
   * near: an enemy's glow dims near the camera like the effect glows (its eyes up close would dazzle).
   * rim: light added at glancing angles, the cheap stand-in for a physical material's sheen.
   * Both are the material's uniforms, not variants of its shader: every kit's material of a kind shares one program
   * (a variant each made 26 more programs at boot, each compiled for half a second on a first visit's ANGLE).
   */
  function patch<M extends Material>(m: M, near = false, rim?: Color, hairTinted = false): M {
    // (in a hood's shade, `Head.shade`: x how deep, y where up the mesh it's full, z where it's gone, w how much more
    // towards the sides; the game's shadow map is too coarse to shade a face under a brim)
    const shade = { value: new Vec4() };
    m.userData.shade = shade;
    // (what the engine reads its looks from, off the material drawn; a property of its own, not copied to a clone)
    const looks: KitLooks = {
      u, near: { value: near ? 1 : 0 }, rim: { value: rim ?? new Color(0) }, shade,
      aura: { value: new Color(0) }, hair: { value: new Vec3() }, hairTinted,
    };
    Object.defineProperty(m, 'kitLooks', { value: looks, configurable: true });
    mats.push(m);
    return m;
  }

  return {
    u,
    mats,
    std: (p?: LitParameters) => patch(new LitMaterial(p)),
    phys: (p?: LitParameters) => patch(new LitMaterial(p)),
    /** a standard material with a rim of `rim` light at glancing angles (skin, cloth) */
    rim: (p: LitParameters, rim: ColorRepresentation, strength = 1) =>
      patch(new LitMaterial(p), false, new Color(rim).multiplyScalar(strength)),
    /** `rim`'s, for a painted face (models/head.ts): its hair's colour moved by a uniform (`KitLooks.hair`), a program of
     *  its own every face shares, whatever colour (`KitLooks.hair`) */
    face: (p: LitParameters, rim: ColorRepresentation, strength = 1) =>
      patch(new LitMaterial(p), false, new Color(rim).multiplyScalar(strength), true),
    // Unlit glow (eyes, crystals) - still dissolves via patch on MeshStandard with black base.
    // `near`: dims near the camera (enemies' glows; the heroes keep theirs)
    glow: (color: ColorRepresentation, intensity = 3, near = true) => patch(new LitMaterial({
      color: 0x000000, emissive: new Color(color), emissiveIntensity: intensity, roughness: 1,
    }), near),
    dispose() { for (const m of mats) m.dispose(); },
  };
}

/** `copy`, a copy of a kit's material, given its looks, which `clone` leaves behind (what they read are the kit's own
 *  uniforms, so it shows them as its original does; and its hood's shade, which says what it's a copy of:
 *  `sameKitMaterial` in models/kitTwin.ts). */
export function sameLooks(copy: Material, original: Material): void {
  const { kitLooks } = original as { kitLooks?: KitLooks };
  if (kitLooks) (copy as unknown as { kitLooks: KitLooks }).kitLooks = kitLooks;
}

/** A kit material's copy of its own, drawn by the same look, its glow (`kitLooks.aura`) its own: an item's parts
 *  glow in its rarity's colour, the rest of the hero's in that material not (models/itemGlow.ts). Dyed with its
 *  original (models/dye.ts finds it by the shade they share, `sameKitMaterial` in models/kitTwin.ts). */
export function kitCopy<M extends Material>(original: M): M {
  const copy = original.clone() as M;
  // (its hood's shade its original's, the uniform the hook binds: `clone` copies user data through JSON, and the
  // head's `shade` set a plain object's value)
  copy.userData.shade = original.userData.shade;
  ownAura(copy, original);
  return copy;
}

/** `m` given looks of its own, as `from`'s but with a glow of its own (black), which it returns. */
export function ownAura(m: Material, from: Material = m): Color | null {
  const looks = (from as { kitLooks?: KitLooks }).kitLooks;
  if (!looks) return null;
  const aura = new Color(0);
  Object.defineProperty(m, 'kitLooks', { value: { ...looks, aura: { value: aura } }, configurable: true });
  return aura;
}

/**
 * Makes an effect material dim with distance, see NEAR_GLOW (a look material's own look reads it: `fx_near` in
 * engine/effects.ts). Only for effects: the world's own glows keep their look.
 */
export function nearGlow<T extends Material>(m: T): T {
  // (a marker the engine dims it by, `NEAR_GLOW`: engine/materials.ts)
  m.userData.nearGlow = true;
  return m;
}

// Additive, unlit HDR material for VFX meshes (dimming with distance, see nearGlow).
export function additive(color: ColorRepresentation, intensity = 2, opacity = 1): UnlitMaterial {
  return nearGlow(new UnlitMaterial({
    color: new Color(color).multiplyScalar(intensity),
    transparent: true, opacity, blending: AdditiveBlending,
    depthWrite: false, side: DoubleSide, toneMapped: true,
  }));
}
