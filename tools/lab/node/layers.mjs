// The page's composited layers at each of its screen pictures (tools/lab, `--layers`), as Chrome drew them: which
// element each is, where, how big, and why Chrome made it a layer. Two sides whose pictures differ in a few pixels
// of the page's UI, its lines drawn a little brighter or dimmer with nothing else changed, differ in how Chrome
// rastered it, and how its layers fell is what decides that: a list for each picture says whether they fell alike.

/** A DOM node as a list names it: its tag, then its id or its classes (`div#bottombar`, `div.slot.art`). */
function nodeName(node) {
  if (!node) return '(no element)';
  const attributes = node.attributes ?? [];
  const valueOf = (name) => {
    const at = attributes.indexOf(name);
    return at >= 0 && at % 2 === 0 ? attributes[at + 1] : '';
  };
  const tag = (node.localName || node.nodeName || '?').toLowerCase();
  const id = valueOf('id');
  if (id) return `${tag}#${id}`;
  const classes = valueOf('class').split(/\s+/).filter(Boolean);
  return classes.length ? `${tag}.${classes.join('.')}` : tag;
}

/** Each number of a layer's box to a tenth of a pixel, as its line shows it. */
const tenth = (value) => Math.round(value * 10) / 10;

/** The layers Chrome draws content for, a line each: its element, its box (css px) and why it's a layer. */
async function describeLayers(devtools, layers) {
  const lines = [];
  for (const layer of layers.filter((each) => each.drawsContent)) {
    const described = layer.backendNodeId
      ? await devtools.send('DOM.describeNode', { backendNodeId: layer.backendNodeId }).catch(() => null)
      : null;
    const why = await devtools.send('LayerTree.compositingReasons', { layerId: layer.layerId }).catch(() => null);
    const reasons = why?.compositingReasonIds?.length ? why.compositingReasonIds.join(', ') : 'no reason given';
    const box = `${tenth(layer.width)}x${tenth(layer.height)} at ${tenth(layer.offsetX)},${tenth(layer.offsetY)}`;
    lines.push(`${nodeName(described?.node)} ${box} (${reasons})`);
  }
  return lines;
}

/**
 * Watches `devtools`' page's layers; `pictured()` keeps them as they are at a picture, `stop()` ends the watch and
 * resolves with them, a list of lines for each picture in its order.
 */
export async function watchLayers(devtools) {
  let latest = [];
  const changed = (event) => {
    if (event.layers) latest = event.layers;
  };
  devtools.on('LayerTree.layerTreeDidChange', changed);
  await devtools.send('LayerTree.enable');
  const pictures = [];
  return {
    async pictured() {
      pictures.push(await describeLayers(devtools, latest));
    },
    async stop() {
      devtools.off('LayerTree.layerTreeDidChange', changed);
      await devtools.send('LayerTree.disable').catch(() => undefined);
      return pictures;
    },
  };
}

/** One side's layers at each picture, as the report lists them. */
export function summarizeLayers(pictures) {
  if (!pictures.length) return 'layers: no screen picture was taken';
  const listed = pictures.flatMap((lines, at) => {
    const layers = lines.map((line) => `    ${line}`);
    return [`  picture ${at + 1}: ${lines.length} layers`, ...layers];
  });
  return ['the page\'s layers at each screen picture:', ...listed].join('\n');
}

/** Where two sides' layers differ, picture by picture: the layers this tree had (+) and the other didn't (-). */
export function layersDiffer(mine, other) {
  const rows = [];
  const count = Math.max(mine.length, other.length);
  for (let at = 0; at < count; at++) {
    const ours = mine[at] ?? [];
    const theirs = other[at] ?? [];
    const more = ours.filter((line) => !theirs.includes(line)).map((line) => `    + ${line}`);
    const fewer = theirs.filter((line) => !ours.includes(line)).map((line) => `    - ${line}`);
    if (more.length || fewer.length) rows.push(`  picture ${at + 1}:`, ...more, ...fewer);
  }
  if (!rows.length) return 'layers: both sides\' layers fell alike at every picture';
  const head = 'layers this tree had (+) and the other didn\'t (-), at each picture where they differ:';
  return [head, ...rows].join('\n');
}
