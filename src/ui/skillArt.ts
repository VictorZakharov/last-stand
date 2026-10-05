// Painted skill icons (`skillArt/<impl>.webp`, 384 px square: the largest slot, a tablet's touch attack button, is
// 125 css px, a phone's 93 at three to three and a half device pixels each). A skill without a picture shows its
// glyph (`SkillDef.icon`) instead. Every picture is fetched and decoded at boot, so a class switch shows them at once.
import type { SkillDef } from '../types';

const ART: Record<string, string> = {};
for (const [path, url] of Object.entries(import.meta.glob<string>('./skillArt/*.webp', { eager: true, query: '?url', import: 'default' }))) {
  ART[path.slice(path.lastIndexOf('/') + 1, -'.webp'.length)] = url;
}
for (const url of Object.values(ART)) { const im = new Image(); im.decoding = 'async'; im.src = url; }

/** the skill's painted icon, if it has one */
export const skillArt = (def: SkillDef): string | undefined => ART[def.impl];

/** A skill's icon as an inline element: its picture, else its glyph in its colour (the key and mouse diagrams). */
export function skillIconHTML(def: SkillDef): string {
  const art = skillArt(def);
  return art ? `<i class="art" style="background-image:url('${art}')"></i>` : `<i>${def.icon.glyph}</i>`;
}
