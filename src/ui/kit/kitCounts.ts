// What the kit counts as it goes (#973): the changes it sent the engine, the panels taken away, the frames it was
// brought up to date for and what runs before each, and the texts painted a frame (`PAINTS_A_FRAME`). Read by what
// keeps a list of panels (`press.ts`), a tree that settles once it sends nothing (`sheet.ts`), and the lab.

const everyFrame = new Set<() => void>();
/** the frames the panels were brought up to date for */
let frames = 0;
/** how many changes panels have sent the engine (a style, a look, a text or a picture) */
let sent = 0;
/** how many panels were taken away */
let removed = 0;

/** A change sent the engine. */
export const countSent = (): void => {
  sent++;
};
/** A panel taken away. */
export const countRemoved = (): void => {
  removed++;
};
/** How many changes panels have sent the engine so far: a tree that sent none in a frame has settled. */
export const kitSent = (): number => sent;
/** How many panels were taken away so far: what keeps a list of them sweeps it only as this moves. */
export const panelsRemoved = (): number => removed;
/** Which frame the panels are being brought up to date for: what's read once a frame is keyed by it. */
export const kitFrame = (): number => frames;

/** `tick` run before each frame's panels are brought up to date (an animation's step), until `stop` is called. */
export function onFrame(tick: () => void): () => void {
  everyFrame.add(tick);
  return () => everyFrame.delete(tick);
}

/** The ticks run before each frame: what the kit does each frame, for the lab's measure of its cost (`lab ui
 *  --cost`). */
export const frameTicks = (): ReadonlySet<() => void> => everyFrame;

/** A new frame begun: its ticks run. */
export function beginFrame(): void {
  frames++;
  for (const tick of everyFrame) tick();
}

/** the texts painted in a frame at most, the rest in the frames after (a big screen's shown over two or three): a
 *  guide's page opened painted some 400, 30 to 50 ms of its first frame with their sends (`lab guide`, #973), where
 *  main's page took 35 ms whole */
const PAINTS_A_FRAME = 150;
let paintsLeft = PAINTS_A_FRAME;
/** whether some text waited for a later frame to be painted */
let paintsWaiting = false;

/** The frame's texts to paint begun: `PAINTS_A_FRAME` of them. */
export function beginPaints(): void {
  paintsLeft = PAINTS_A_FRAME;
  paintsWaiting = false;
}

/** Whether a text may be painted this frame (counted), else it waits for the next. */
export function mayPaint(): boolean {
  if (!paintsLeft) {
    paintsWaiting = true;
    return false;
  }
  paintsLeft--;
  return true;
}

/** Whether some text shown is still to be painted (the lab's, before it pictures the screen). */
export const labelsWaiting = (): boolean => paintsWaiting;
