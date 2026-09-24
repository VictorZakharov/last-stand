// Makes procedural PBR maps off the main thread during loading (core/textures.ts preloadTextures).
import { RECIPES, recipeKey, type PBRData, type RecipeName } from './pbr';

self.onmessage = (e: MessageEvent<[RecipeName, unknown[]]>) => {
  const [name, args] = e.data;
  const data = (RECIPES[name] as (...a: unknown[]) => PBRData)(...args);
  self.postMessage({ key: recipeKey(name, args), data }, { transfer: [data.albedo.buffer, data.normal.buffer, data.rough.buffer] });
};
