// Lines of the code a browser ran traced back to the source (tools/lab, `--profile`): Vite serves each module
// compiled (TypeScript's types stripped, imports rewritten), so a line the profiler names is the compiled one's, and
// its source map says which line of the source it came from.

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** a base64 digit's bit that says another digit follows, and the bits of its value */
const CONTINUES = 32;
const VALUE_BITS = 31;

/** The numbers of one segment of a source map's mappings (base64 VLQ). */
function decodeSegment(segment) {
  const numbers = [];
  let value = 0;
  let shift = 0;
  for (const character of segment) {
    const digit = BASE64.indexOf(character);
    if (digit < 0) throw new Error(`a source map's mappings hold a ${JSON.stringify(character)}`);
    value += (digit & VALUE_BITS) << shift;
    if (digit & CONTINUES) {
      shift += 5;
      continue;
    }
    // (the lowest bit is the sign)
    numbers.push(value & 1 ? -(value >>> 1) : value >>> 1);
    value = 0;
    shift = 0;
  }
  return numbers;
}

/**
 * A source map's mappings decoded: for each line of the compiled code (from 0), its segments as `[column, source,
 * line]`, the compiled column, the index of the source in the map's `sources` and the line there it came from (from
 * 0), in the order of their columns. A segment that maps to no source is left out.
 */
export function decodeMappings(mappings) {
  const lines = [];
  // (each field but the compiled column runs on from the last segment that has it, across lines)
  let source = 0;
  let sourceLine = 0;
  for (const text of mappings.split(';')) {
    const segments = [];
    let column = 0;
    for (const segmentText of text.split(',')) {
      if (!segmentText) continue;
      const fields = decodeSegment(segmentText);
      column += fields[0];
      if (fields.length < 4) continue;
      source += fields[1];
      sourceLine += fields[2];
      segments.push([column, source, sourceLine]);
    }
    lines.push(segments);
  }
  return lines;
}

/**
 * Where the compiled code's `line` and `column` (from 0) came from, by `decoded` (`decodeMappings`): the last
 * segment at or before the column, else the line's first, as `{ source, line }` (the source's index and its line,
 * from 0); null when the line maps to no source.
 */
export function sourceOf(decoded, line, column) {
  const segments = decoded[line];
  if (!segments || segments.length === 0) return null;
  let found = segments[0];
  for (const segment of segments) {
    if (segment[0] > column) break;
    found = segment;
  }
  return { source: found[1], line: found[2] };
}
