// Waiting on the browser with a limit (tools/stalls): Chrome once never sent what a measure waited for, and the run
// waited 14 minutes.

/** Whether `promise` settles within `ms`. */
export function within(promise, ms) {
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(resolve, ms, false);
  });
  return Promise.race([promise.then(() => true), late]).finally(() => clearTimeout(timer));
}
