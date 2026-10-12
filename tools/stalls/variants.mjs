// Changes tried on the page before its own scripts run (tools/stalls `--variants`), to A/B a cause of the stalls
// without a build of its own. Each is serialized into the page, so it can use nothing from here.

/** None: the page as it is. */
function base() {}

/**
 * Every 2D canvas drawn on the CPU (`willReadFrequently`), never by the GPU process's Skia: a canvas drawn on the GPU
 * builds a Skia program for each new kind of drawing (a shadow's blur, a gradient), and building one holds up the
 * GPU process, the game's WebGL with it.
 */
function cpuCanvas() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, options) {
    if (kind !== '2d') return getContext.call(this, kind, options);
    return getContext.call(this, kind, { ...options, willReadFrequently: true });
  };
}

/** The variants by name. */
export const VARIANTS = { base, cpuCanvas };
