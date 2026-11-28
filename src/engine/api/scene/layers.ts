// Which views draw a node: 32 layers as bits, a node drawn by a camera whose layers share one with its own (the
// first person's arms are drawn by a camera of their own, on a layer the world's camera doesn't draw).

/** Told when a node's layers change (its draws are written again). */
export interface LayersOwner {
  /** the layers changed */
  layersChanged(): void;
}

/** A node's layers, the first alone by default. */
export class Layers {
  private bits = 1;
  /** the node told of a change, if any */
  owner: LayersOwner | null = null;

  /** the layers as bits */
  get mask(): number { return this.bits; }
  set mask(value: number) {
    const bits = value | 0;
    if (bits === this.bits) return;
    this.bits = bits;
    this.owner?.layersChanged();
  }

  /** On layer `layer` alone. */
  set(layer: number): void { this.mask = (1 << layer) | 0; }
  /** On layer `layer` too. */
  enable(layer: number): void { this.mask = this.bits | (1 << layer); }
  /** On every layer. */
  enableAll(): void { this.mask = 0xffffffff | 0; }
  /** Off layer `layer`. */
  disable(layer: number): void { this.mask = this.bits & ~(1 << layer); }
  /** On layer `layer` if it was off, off if it was on. */
  toggle(layer: number): void { this.mask = this.bits ^ (1 << layer); }
  /** On no layer. */
  disableAll(): void { this.mask = 0; }
  /** Whether these share a layer with `other`. */
  test(other: Layers): boolean { return (this.bits & other.bits) !== 0; }
  /** Whether layer `layer` is on. */
  isEnabled(layer: number): boolean { return (this.bits & (1 << layer)) !== 0; }
}
