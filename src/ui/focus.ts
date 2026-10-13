// A control clicked with the mouse (or tapped) gives its focus back: the game is played with the keyboard, and a
// button left focused showed the browser's focus ring at the game's next key (clipped by its group's frame, a second
// border down its side) and was pressed again by Space or Enter. A control reached with Tab keeps it, its ring shown.

/** what gives its focus back once clicked: buttons and checkboxes (a slider keeps it while it's dragged) */
const LETS_GO = 'button, [role="button"], input[type="checkbox"]';

/** Every click of the pointer on a button or a checkbox lets go of the focus the click gave it. */
export function releaseClickedFocus(): void {
  // (on the document as it captures, before the click's own handlers: one that puts the focus somewhere, the save
  // slot's name box, keeps it there)
  document.addEventListener('click', (event) => {
    // (a click made by a key, Enter on a button reached with Tab, has no count)
    if (event.detail === 0) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.matches(LETS_GO)) focused.blur();
  }, true);
}
