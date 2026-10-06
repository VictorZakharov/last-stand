// Stands in for ez-tree's own texture module (its bark and leaf pictures, 16 MB of images: everything here is drawn
// at runtime). vite.config.ts points ez-tree's `./textures` import here; the trees take our own materials, so its
// materials are given none.
export const getBarkTexture = (): null => null;
export const getLeafTexture = (): null => null;
