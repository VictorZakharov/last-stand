| What | Where | Follows | Licence |
| --- | --- | --- | --- |
| The constants' values (sides, blendings, factors, equations, wraps, filters, types, formats, colour spaces, usages) | `material/constants.ts` | three.js 0.187.0, `src/constants.js`: the same numbers and strings, so the engine's readers compare them | MIT |
| Every material's and texture's defaults | `material/material.ts`, `lit.ts`, `unlit.ts`, `look.ts`, `texture.ts` | three.js 0.187.0, `src/materials/*.js`, `src/textures/*.js`: the values read off its constructors | MIT |
| A parameters object set over a material (a colour set from what's given, a vector copied, an unknown key warned of and left out) | `Material.assign` in `material/material.ts` | three.js 0.187.0, `Material.setValues` | MIT |
| A look material's uniforms copied a value at a time (cloned where they can be, arrays sliced); unlike three, a texture is shared | `copyUniforms` in `material/look.ts` | three.js 0.187.0, `cloneUniforms` in `src/renderers/shaders/UniformsUtils.js` | MIT |
| `userData` copied through JSON | `copyUserData` in `material/fields.ts` | three.js 0.187.0, `Material.copy`, `Texture.copy` | MIT |
