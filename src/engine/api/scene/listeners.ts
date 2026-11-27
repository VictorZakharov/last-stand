// A node's listeners, by the type of event each is told of (`Node.addEventListener`): `added`, `removed`,
// `childadded`, `childremoved`, or the game's own.
import type { Node } from './node.ts';

/** A listener of a node's events (`dispatchEvent`). */
export type NodeListener = (event: { type: string; target: Node; [key: string]: unknown }) => void;

/** A node's listeners, made as its first is added. */
export class Listeners {
  private readonly byType = new Map<string, NodeListener[]>();

  /** `listener` told of `type`, once however often it's added. */
  add(type: string, listener: NodeListener): void {
    const list = this.byType.get(type);
    if (!list) {
      this.byType.set(type, [listener]);
      return;
    }
    if (!list.includes(listener)) list.push(listener);
  }

  /** `listener` no longer told of `type`. */
  remove(type: string, listener: NodeListener): void {
    const list = this.byType.get(type);
    if (!list) return;
    const at = list.indexOf(listener);
    if (at >= 0) list.splice(at, 1);
  }

  /** `event` told to the listeners of its type, `target` its node; a listener taken away meanwhile still told. */
  tell(event: { type: string; [key: string]: unknown }, target: Node): void {
    const list = this.byType.get(event.type);
    if (!list) return;
    const told = { ...event, target };
    for (const listener of list.slice()) listener(told);
  }
}
