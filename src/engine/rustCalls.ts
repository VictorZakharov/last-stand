// The engine's calls that need no engine of their own (Bulwark's free functions: cloth draped over a body's limbs,
// cloth.rs), for the game's own code to reach once the engine's module has loaded (`bootRust` in `index.ts`).
// VictorZakharov/last-stand#973: what does vector work moves into Rust whole, and the game's script asks for it.
import type * as Bulwark from './pkg/bulwark';

/** The engine's module's free functions, none till it has loaded. */
export type RustCalls = Pick<typeof Bulwark, 'drape_cloth'>;

let calls: RustCalls | null = null;

/** The engine's free functions, once its module has loaded (null before: the boot hasn't reached the engine). */
export const rustCalls = (): RustCalls | null => calls;

/** The engine's module loaded: its free functions from now on. */
export function rustCallsReady(module: RustCalls): void {
  calls = module;
}
