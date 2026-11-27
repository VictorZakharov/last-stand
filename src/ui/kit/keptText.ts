// Text kept as it's written (#973: a `pre`, CSS's `white-space: pre-wrap`, as the bug report shows the report whole):
// each of its lines a panel of its own, wrapped at the panel's width. Said as one wrapped text, a report of some
// forty lines was one label taller than the overlay's atlas holds, and the engine stopped drawing the labels.
import { Panel } from './panel';
import type { TextAlign } from './wrap';
import type { TextStyle } from '../overlay/paint';

export class KeptText {
  private readonly lines: Panel[] = [];

  constructor(private readonly panel: Panel) {
    panel.style({ direction: 'column' });
  }

  /** `text`'s lines shown in `style`, a panel each, made or taken away as their count changes. */
  set(text: string, style: TextStyle, align: TextAlign): void {
    const lines = text.split('\n');
    while (this.lines.length > lines.length) this.lines.pop()!.remove();
    while (this.lines.length < lines.length) this.lines.push(new Panel(this.panel, { shrink: 0 }));
    // (an empty line keeps its height: a space said in its place)
    lines.forEach((line, at) => this.lines[at].say(line || ' ', style, align));
  }
}
