// How the two sides of an A/B differ (tools/lab): their reports compared line by line, so a commit compared with
// itself says at once whether it agreed, and an A/B shows what changed without two reports read side by side.

/**
 * The edits that turn `before` into `after` (lists of lines): each line `same`, `removed` (only before) or `added`
 * (only after), from their longest common subsequence. The reports are tens of lines, so its table is small.
 */
export function lineEdits(before, after) {
  // (common[i][j]: the longest common subsequence of before[i..] and after[j..])
  const common = Array.from({ length: before.length + 1 }, () => new Array(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      common[i][j] = before[i] === after[j]
        ? common[i + 1][j + 1] + 1
        : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  const edits = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      edits.push({ kind: 'same', line: before[i] });
      i++;
      j++;
    } else if (j === after.length || (i < before.length && common[i + 1][j] >= common[i][j + 1])) {
      edits.push({ kind: 'removed', line: before[i] });
      i++;
    } else {
      edits.push({ kind: 'added', line: after[j] });
      j++;
    }
  }
  return edits;
}

/** Whether a line heads a section of a report (not indented). */
function isHeading(line) {
  return line.length > 0 && !/^\s/.test(line);
}

/**
 * The A/B's verdict on two sides' reports: that they agree line for line, or each line that differs (`-` the side
 * before, `+` the side after), each run of them under the heading of the section it's in.
 */
export function describeDifferences(beforeName, beforeText, afterName, afterText) {
  const edits = lineEdits(String(beforeText).split('\n'), String(afterText).split('\n'));
  const changed = edits.filter((edit) => edit.kind !== 'same');
  if (changed.length === 0) return 'A/B: the two sides agree, line for line';
  const lines = [`A/B: ${changed.length} lines differ (- ${beforeName}, + ${afterName})`];
  let heading = null;
  let headingShown = false;
  for (const edit of edits) {
    if (edit.kind === 'same') {
      if (isHeading(edit.line)) {
        heading = edit.line;
        headingShown = false;
      }
      continue;
    }
    if (heading && !headingShown && !isHeading(edit.line)) {
      lines.push(`  ${heading}`);
      headingShown = true;
    }
    lines.push(`${edit.kind === 'removed' ? '-' : '+'} ${edit.line}`);
  }
  return lines.join('\n');
}
