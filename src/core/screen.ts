// The page's canvas, where three's renderer stood (VictorZakharov/last-stand#973: three leaves the game): the engine's
// own canvas (src/engine), which takes the pointer and the keys' focus, sized by the window and the screen's pixel
// ratio. It answers what the game and the lab ask of the canvas's host (`G.renderer`: its element, its ratio, its
// size, counts). Nothing draws through it: the engine draws the frame, the world's overlays with it.
import { Vec2 } from '../engine/api/index.ts';

/** what the counts a frame ask of the host (`info`): three's renderer kept them; the engine keeps its own
 *  (`RUST.bridge.stats`), so these stand at none */
export interface ScreenInfo {
  autoReset: boolean;
  render: { calls: number; drawCalls: number; triangles: number; frame: number };
  memory: { geometries: number; textures: number };
  programs: unknown[];
  reset(): void;
}

/** The page's canvas and its size, the engine's canvas. */
export class GameScreen {
  /** the canvas on the page: the engine's */
  readonly domElement: HTMLCanvasElement;
  /** what the counts ask of it: none of three's (`ScreenInfo`) */
  readonly info: ScreenInfo = {
    autoReset: true,
    render: { calls: 0, drawCalls: 0, triangles: 0, frame: 0 },
    memory: { geometries: 0, textures: 0 },
    programs: [],
    reset: () => {},
  };
  /** what's asked of a GPU's limits: the side of the largest texture (the labels' atlas is sized within it) */
  readonly capabilities: { maxTextureSize: number };
  private ratio = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  constructor(canvas: HTMLCanvasElement, maxTextureSize: number) {
    this.domElement = canvas;
    this.capabilities = { maxTextureSize };
  }

  /** the screen's pixels per css px the frame is fitted at */
  getPixelRatio(): number {
    return this.ratio;
  }

  /** The frame fitted at `ratio` pixels per css px. */
  setPixelRatio(ratio: number): void {
    this.ratio = ratio;
  }

  /** The frame fitted to `width` by `height` css px (the canvas's own pixels are the engine's: the scene's size). */
  setSize(width: number, height: number): void {
    this.cssWidth = width;
    this.cssHeight = height;
  }

  /** The frame's size in css px, into `out`. */
  getSize(out: Vec2): Vec2 {
    return out.set(this.cssWidth, this.cssHeight);
  }

  /** The frame's size in the screen's pixels, into `out`. */
  getDrawingBufferSize(out: Vec2): Vec2 {
    return out.set(Math.floor(this.cssWidth * this.ratio), Math.floor(this.cssHeight * this.ratio));
  }

  /** The target drawn into: none, the frame (a look's hook asks it, world/meadow.ts). */
  getRenderTarget(): null {
    return null;
  }
}
