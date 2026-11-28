# `relay`

`npm run lab -- relay` (`node/relayRoute.mjs`; once: `npm ci --prefix server/relay`, as `rooms` needs): what a round
trip through the co-op relay is made of, from this PC. It opens a private room of four sockets on the relay (a random
code, never listed: the relay's `ORIGINS` take the dev server's origin it says it comes from), and times four things,
each socket pinging every 100 ms for 5 s:

- the relay's own ping, idle;
- a message from the host's socket to the guests' through the relay, sent and received on one clock, so the whole
  route out and back;
- both while the host sends a fight's messages (`--snapshot` bytes, 12000 by default, 20 a second, and 400 B of events
  60 a second) and each guest 300 B 60 a second;
- the pings read by this process kept busy 40 ms of every 50, as a game at 20 fps keeps its page. They must read at
  least 15 ms longer than idle, or the measure saw nothing (its canary).

`--server wss://host` times another relay (a local one: `ws://localhost:8787`).

Measured on 2026-11-28 from the owner's PC: the relay's ping 22.7 ms (median), a message through it from socket to
socket 23.5, and the same with the fight's messages 23.1 and 24.8 for the snapshots: the relay's own share is a ms
or two, and a 4-player fight doesn't move it. The busy thread read 61.6. That was the scoreboard's ping: four players
in one city saw 56 to 97 ms at wave 44, the page's socket handing each pong over only between frames. The game's socket
is a worker's now (`src/net/relaySocket.ts`), which times the ping and stamps each message's arrival itself.
