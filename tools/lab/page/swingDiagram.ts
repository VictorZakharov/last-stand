// tools/lab swing diagrams (lab eyes): a cast's frames drawn as one picture, the arms and the weapon at every frame in
// the eyes' own space (m: x right, y up, -z ahead) from the side, from above and as the eyes see them, each frame a
// line coloured by its time: the wind-up blue, light to dark, the strike red, the follow-through grey, the frame the
// skill fires on yellow; the eye and the edges of its frame marked. A swing's whole arc, and the arm behind it, are
// judged at a glance. (A film shows a frame at a time: a cut through the eyes keyed by arithmetic wound up into the
// camera's face, its blow a frame long, and that took a film of 79 frames to see.)
import * as THREE from 'three';
import type { Pictured } from './lab';

/** An arm in the eyes' space: its shoulder, elbow and wrist. */
export type ArmAt = [THREE.Vector3, THREE.Vector3, THREE.Vector3];

/** A frame's arms and weapon in the eyes' space. */
export interface ArmsAt {
  /** the right arm's, then the left's */
  arms: ArmAt[];
  /** the held weapon's grip and tip, if any */
  weapon: [THREE.Vector3, THREE.Vector3] | null;
}

/** Where a frame falls in its cast. */
export type Phase = 'before' | 'strike' | 'after';

/** A frame of the diagram: its arms and weapon, where it falls in the cast and how far through that (0..1). */
export interface DiagramFrame {
  pose: ArmsAt;
  phase: Phase;
  through: number;
  fires: boolean;
}

/** How wide the eyes' frame spans: half its width and half its height a metre ahead. */
export interface Lens {
  halfAcross: number;
  halfUp: number;
}

/** A panel: its name, a point of the eyes' space on it (its own units, or null where it isn't drawn), its bounds in
 *  those units, and its guides (the eye, the frame's edges) as lines in them. */
interface Panel {
  name: string;
  at: (point: THREE.Vector3) => [number, number] | null;
  bounds: { left: number; right: number; bottom: number; top: number };
  guides: [number, number][][];
}

const PANEL_WIDTH = 640;
const PANEL_HEIGHT = 560;
const MARGIN = 28;
/** how far ahead the side and the top views reach, and how far behind the eye (m) */
const AHEAD = 1.9;
const BEHIND = 0.5;
/** a point this near the eye's plane, or behind it, is not drawn through the eyes (m) */
const NEAR = 0.05;

const COLOURS: Record<Phase, string> = { before: '30, 110, 255', strike: '230, 40, 30', after: '120, 120, 120' };

/** The eye seen from the hero's right: ahead to the right, up up; the frame's top and bottom edges from the eye. */
function sidePanel(lens: Lens): Panel {
  return {
    name: 'from the side (ahead to the right)',
    at: (point) => [-point.z, point.y],
    bounds: { left: -BEHIND, right: AHEAD, bottom: -1.2, top: 0.9 },
    guides: [
      [[0, 0], [AHEAD, AHEAD * lens.halfUp]],
      [[0, 0], [AHEAD, -AHEAD * lens.halfUp]],
    ],
  };
}

/** The eye seen from above: right to the right, ahead up; the frame's sides from the eye. */
function topPanel(lens: Lens): Panel {
  return {
    name: 'from above (ahead up)',
    at: (point) => [point.x, -point.z],
    bounds: { left: -1.2, right: 1.2, bottom: -BEHIND, top: AHEAD },
    guides: [
      [[0, 0], [AHEAD * lens.halfAcross, AHEAD]],
      [[0, 0], [-AHEAD * lens.halfAcross, AHEAD]],
    ],
  };
}

/** As the eyes see it, the frame's edges at 1 each way (points behind the eye left out). */
function eyesPanel(lens: Lens): Panel {
  const frame: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]];
  return {
    name: 'through the eyes (the frame boxed)',
    at: (point) => (point.z > -NEAR ? null : [point.x / -point.z / lens.halfAcross, point.y / -point.z / lens.halfUp]),
    bounds: { left: -2.2, right: 2.2, bottom: -2.2, top: 1.6 },
    guides: [frame],
  };
}

/** A panel's own units on its canvas area (`left` px from the canvas's left). */
class Plotter {
  private readonly scale: number;
  private readonly middle: [number, number];

  constructor(private readonly panel: Panel, private readonly left: number) {
    const { bounds } = panel;
    const width = bounds.right - bounds.left;
    const height = bounds.top - bounds.bottom;
    this.scale = Math.min((PANEL_WIDTH - 2 * MARGIN) / width, (PANEL_HEIGHT - 2 * MARGIN) / height);
    this.middle = [(bounds.left + bounds.right) / 2, (bounds.bottom + bounds.top) / 2];
  }

  /** a point of the panel's units in pixels */
  pixel([u, v]: [number, number]): [number, number] {
    const x = this.left + PANEL_WIDTH / 2 + (u - this.middle[0]) * this.scale;
    const y = PANEL_HEIGHT / 2 - (v - this.middle[1]) * this.scale;
    return [x, y];
  }

  /** a line through points of the eyes' space, broken where one isn't drawn */
  line(context: CanvasRenderingContext2D, points: THREE.Vector3[]): void {
    let open = false;
    context.beginPath();
    for (const point of points) {
      const at = this.panel.at(point);
      if (!at) {
        open = false;
        continue;
      }
      const [x, y] = this.pixel(at);
      if (open) context.lineTo(x, y);
      else context.moveTo(x, y);
      open = true;
    }
    context.stroke();
  }

  /** the panel's guides, the eye (through the eyes, the crosshair) and its name */
  frame(context: CanvasRenderingContext2D): void {
    context.strokeStyle = '#999';
    context.lineWidth = 1;
    context.setLineDash([6, 4]);
    for (const guide of this.panel.guides) {
      context.beginPath();
      guide.forEach((point, i) => {
        const [x, y] = this.pixel(point);
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
    context.setLineDash([]);
    const [x, y] = this.pixel([0, 0]);
    context.fillStyle = '#000';
    context.beginPath();
    context.arc(x, y, 5, 0, 2 * Math.PI);
    context.fill();
    context.font = '16px system-ui, sans-serif';
    context.fillText(this.panel.name, this.left + MARGIN, 20);
  }
}

/** A frame's lines: its arms thin, its weapon thick, in its phase's colour (darker further through it). */
function drawFrame(context: CanvasRenderingContext2D, plotter: Plotter, frame: DiagramFrame): void {
  const alpha = frame.phase === 'before' ? 0.25 + 0.75 * frame.through : 0.9;
  const colour = frame.fires ? '240, 190, 0' : COLOURS[frame.phase];
  context.strokeStyle = `rgba(${colour}, ${alpha})`;
  context.lineWidth = 1.5;
  for (const arm of frame.pose.arms) plotter.line(context, arm);
  if (!frame.pose.weapon) return;
  context.lineWidth = frame.fires ? 5 : 3;
  plotter.line(context, frame.pose.weapon);
}

/** The order the frames are drawn in: the wind-up, then the follow-through, the strike over them, the firing on top. */
const LAYER: Record<Phase, number> = { before: 0, after: 1, strike: 2 };
const layerOf = (frame: DiagramFrame) => (frame.fires ? 3 : LAYER[frame.phase]);

/** `frames` as a diagram, a moment of the report under `name`. */
export function swingDiagram(name: string, frames: DiagramFrame[], lens: Lens): Pictured {
  const panels = [sidePanel(lens), topPanel(lens), eyesPanel(lens)];
  const canvas = document.createElement('canvas');
  canvas.width = PANEL_WIDTH * panels.length;
  canvas.height = PANEL_HEIGHT;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const ordered = [...frames].sort((a, b) => layerOf(a) - layerOf(b));
  panels.forEach((panel, i) => {
    const plotter = new Plotter(panel, i * PANEL_WIDTH);
    plotter.frame(context);
    for (const frame of ordered) drawFrame(context, plotter, frame);
  });
  const png = canvas.toDataURL('image/png');
  const notes = ['blue: the wind-up (light to dark), red: the strike, grey: after it, yellow: the frame it fires on'];
  return { label: name, tiles: [{ view: 'diagram', png, width: canvas.width, height: canvas.height }], notes };
}
