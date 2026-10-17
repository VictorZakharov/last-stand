// Text copied to the clipboard, for the reports the overlays offer (the network log, the battle log).

/** Copy `text`; false if the browser wouldn't. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // no clipboard (an insecure page, a denied permission): the copy that always works
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const done = document.execCommand('copy');
    ta.remove();
    return done;
  }
}
