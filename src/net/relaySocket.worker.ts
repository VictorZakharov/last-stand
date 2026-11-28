// The co-op relay's WebSocket, held off the page's main thread (`relaySocket.ts`). Each message is stamped as it
// arrives here and the round trip to the server is timed here: on the page, a reply waited for the frame being drawn,
// so a game at 25 fps showed a ping of 60 to 100 ms on a 22 ms route, and a long frame read as a late link.
import type { FromSocket, ToSocket } from './relaySocket';

let socket: WebSocket | null = null;
let pinger: ReturnType<typeof setInterval> | undefined;

/** this worker's clock as the page reads its own: both count from the same moment (ms) */
const now = (): number => performance.timeOrigin + performance.now();
const post = (message: FromSocket): void => self.postMessage(message);

self.onmessage = (event: MessageEvent<ToSocket>): void => {
  const order = event.data;
  if (order.k === 'open') {
    const ws = new WebSocket(order.url);
    socket = ws;
    ws.onopen = () => post({ k: 'open' });
    ws.onmessage = (e) => {
      const text = e.data as string;
      // (the relay's answer to a ping is timed and kept here, never passed on)
      if (text.startsWith('{"t":"pong"')) {
        const sent = (JSON.parse(text) as { n?: unknown }).n;
        if (typeof sent === 'number') post({ k: 'rtt', ms: now() - sent });
        return;
      }
      post({ k: 'msg', text, at: now() });
    };
    ws.onclose = (e) => { clearInterval(pinger); post({ k: 'close', code: e.code, reason: e.reason }); };
  } else if (order.k === 'send') {
    if (socket?.readyState === WebSocket.OPEN) socket.send(order.text);
  } else if (order.k === 'ping') {
    clearInterval(pinger);
    pinger = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'ping', n: now() }));
    }, order.every);
  } else if (order.k === 'close') {
    clearInterval(pinger);
    socket?.close(order.code, order.reason);
  }
};
