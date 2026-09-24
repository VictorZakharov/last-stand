// Minimal typed event bus so systems can react to each other without hard imports.
import type { Enemy } from './entities/enemy';
import type { Item } from './types';

export interface GameEvents {
  enemyKilled: [enemy: Enemy];
  playerDied: [];
  playerHurt: [amount: number];
  lootGained: [item: Item];
  waveCleared: [wave: number];
  waveStarted: [wave: number];
}

type Handler<K extends keyof GameEvents> = (...args: GameEvents[K]) => void;
const handlers = new Map<keyof GameEvents, Set<(...args: never[]) => void>>();

export function on<K extends keyof GameEvents>(name: K, fn: Handler<K>): () => void {
  let set = handlers.get(name);
  if (!set) { set = new Set(); handlers.set(name, set); }
  const s = set;
  s.add(fn as (...args: never[]) => void);
  return () => { s.delete(fn as (...args: never[]) => void); };
}

export function emit<K extends keyof GameEvents>(name: K, ...args: GameEvents[K]): void {
  const set = handlers.get(name);
  if (set) for (const fn of set) (fn as Handler<K>)(...args);
}
