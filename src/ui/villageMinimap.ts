// The minimap's village (ui/hud.ts draws the rest, as in a run): the plan of the village in the run's minimap's own
// marks, its boundary and what stands inside it pale on the dark, its two portals the colours of their biomes' gates,
// so a player meets the minimap in the village as the fights show it. The village stands still: drawn once, and turned
// with the camera each time the minimap is drawn.
import { BIOME_IDS, BIOMES } from '../data/biomes';
import { COTTAGES, ENTRANCES, HALL, TERRACE, VILLAGE_OBJECTS, YARD, portalPlace } from '../data/village';
import { FOUNTAIN } from '../world/fountain';
import { COTTAGE, PODIUM, SQUARE_EDGE, TOMB, palisadePolygon, roadLines } from '../world/villagePlan';
import { canvasOf, ctx2d } from '../core/textures';
import { HALL_ROOF } from './villageMap';

/** the minimap's own colours (ui/hud.ts): its boundary and the ground within it */
const LINE = 'rgba(200,190,170,.55)', LAND = 'rgba(60,58,62,.35)';
// (what's built stays under the hero's arrow: brighter, the hall's roof was the first thing the eye went to)
const ROAD = 'rgba(214,196,150,.3)', BUILT = 'rgba(150,146,140,.55)', WATER = '#6f9fc4', USED = '#e8c878';
/** how far the village's farthest place stays in from the round minimap's edge (px of its 200) */
const MARGIN = 6;
/** the village drawn at this many pixels a pixel of the minimap, as it's turned */
const SHARP = 2;
/** how wide a way out's road is drawn (m), and the dots of a portal and of what's used (px) */
const WAY_WIDTH = 3, PORTAL_DOT = 3.5, USED_DOT = 2;

const fence = palisadePolygon(120);
/** how far from the middle the hero can walk (m): its palisade and its portals (the tomb behind the crypt's runs under
 *  the round's edge: counted, the village took 40% of the minimap's width) */
const reach = Math.max(
  ...fence.map(([x, z]) => Math.hypot(x, z)),
  ...BIOME_IDS.map((id) => Math.hypot(portalPlace(id).x, portalPlace(id).z)),
);

let drawn: HTMLCanvasElement | null = null;

/** A place on a way out, `o` m along it from its gap. */
function alongWay(id: keyof typeof ENTRANCES, o: number): [number, number] {
  const { gap, out } = ENTRANCES[id];
  return [gap[0] + out[0] * o, gap[1] + out[1] * o];
}

/** The minimap's pixels a metre in the village, on a minimap `width` px across: the whole village inside its round. */
export function villageMinimapScale(width: number): number {
  return (width / 2 - MARGIN) / reach;
}

/** A box round (x, z), half sides hx and hz, turned `turn` about y, filled in `fill`. */
function box(c: CanvasRenderingContext2D, s: number, [x, z]: readonly [number, number], hx: number, hz: number,
  turn: number, fill: string): void {
  c.save();
  c.translate(x * s, z * s);
  c.rotate(-turn);
  c.fillStyle = fill;
  c.fillRect(-hx * s, -hz * s, hx * 2 * s, hz * 2 * s);
  c.restore();
}

/** A dot at (x, z) of `radius` px. */
function dot(c: CanvasRenderingContext2D, s: number, x: number, z: number, radius: number, fill: string): void {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x * s, z * s, radius, 0, Math.PI * 2);
  c.fill();
}

/** A line through `points`, `width` px wide. */
function stroked(c: CanvasRenderingContext2D, s: number, points: readonly (readonly [number, number])[], width: number,
  ink: string): void {
  c.beginPath();
  points.forEach(([x, z], i) => (i ? c.lineTo(x * s, z * s) : c.moveTo(x * s, z * s)));
  c.lineWidth = width;
  c.strokeStyle = ink;
  c.stroke();
}

/** The village on `c`, its middle at the origin, `s` px a metre. */
function drawVillage(c: CanvasRenderingContext2D, s: number): void {
  c.lineJoin = c.lineCap = 'round';
  c.beginPath();
  fence.forEach(([x, z], i) => (i ? c.lineTo(x * s, z * s) : c.moveTo(x * s, z * s)));
  c.closePath();
  c.fillStyle = LAND;
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = LINE;
  c.stroke();
  for (const road of roadLines) stroked(c, s, road.line, Math.max(1.5, road.width * s), ROAD);
  for (const id of BIOME_IDS) {
    const portal = portalPlace(id);
    stroked(c, s, [ENTRANCES[id].gap, [portal.x, portal.z]], WAY_WIDTH * s, ROAD);
  }
  dot(c, s, 0, 0, SQUARE_EDGE * s, ROAD);
  dot(c, s, 0, 0, FOUNTAIN.r * s, WATER);
  // what's built: the terrace and the hall on it, the cottages, the tomb on its podium, the yard's ground
  const hallBack = HALL.wall - HALL_ROOF.back;
  box(c, s, [TERRACE.x, (TERRACE.front + TERRACE.back) / 2], TERRACE.half, (TERRACE.front - TERRACE.back) / 2, 0, ROAD);
  box(c, s, [TERRACE.x, (HALL_ROOF.front + hallBack) / 2], HALL_ROOF.half, (HALL_ROOF.front - hallBack) / 2, 0, BUILT);
  for (const cottage of COTTAGES) {
    const hx = (COTTAGE.w / 2 + COTTAGE.eave) * cottage.size, hz = (COTTAGE.d / 2 + COTTAGE.eave) * cottage.size;
    box(c, s, [cottage.x, cottage.z], hx, hz, cottage.facing, BUILT);
  }
  const { out } = ENTRANCES.crypt;
  const tombTurn = Math.atan2(-out[0], -out[1]);
  const tombMiddle = alongWay('crypt', (PODIUM.front + TOMB.back + 0.7) / 2);
  box(c, s, tombMiddle, TOMB.w / 2 + 0.7, (TOMB.back + 0.7 - PODIUM.front) / 2, tombTurn, BUILT);
  box(c, s, [YARD.x, YARD.z], YARD.halfX, YARD.halfZ, YARD.turn, ROAD);
  for (const object of VILLAGE_OBJECTS) {
    if (!object.biome) dot(c, s, object.at[0], object.at[1], USED_DOT, USED);
  }
  for (const id of BIOME_IDS) dot(c, s, portalPlace(id).x, portalPlace(id).z, PORTAL_DOT, BIOMES[id].minimap.portal);
}

/** The village drawn on a minimap `width` px across, turned as the caller has turned `c` round its middle. */
export function drawVillageOnMinimap(c: CanvasRenderingContext2D, width: number): void {
  if (!drawn) {
    drawn = canvasOf(width * SHARP, width * SHARP);
    const own = ctx2d(drawn);
    own.scale(SHARP, SHARP);
    own.translate(width / 2, width / 2);
    drawVillage(own, villageMinimapScale(width));
  }
  c.drawImage(drawn, -width / 2, -width / 2, width, width);
}
