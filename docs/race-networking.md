Race movement uses `/api/kart/event/socket`, authenticated with the existing
session cookie and a strict same-origin upgrade check. Identity is attached by
the Worker; client packets cannot select another player or meeting. Connections
reauthenticate on reconnect and expire after one hour. Race registration and pit
service remain authenticated HTTP actions.

Moving clients send poses at the existing 100 ms cadence. The server validates
road position, speed, progress, laps and pit rules, then broadcasts personalized
snapshots on one shared 100 ms clock. The renderer retains timestamp buffering
and bounded extrapolation. Cars ghost through rivals; track boundaries still
apply. Slow connections drop queued outgoing samples instead of replaying a
backlog. Reconnect uses bounded exponential backoff, without HTTP polling.

The Durable Object serializes race actions against shared in-memory meeting
state. It checkpoints at most every five seconds during movement, immediately
at registration, grid/lap/pit/finish milestones and socket closure. Completed lap
records are durable. An unexpected process loss can roll back up to five seconds
of ongoing movement. Idle registration sockets use the hibernation API and a
phase-transition alarm. Broadcast timers stop when no connected unfinished
drivers remain. Expired meetings are removed from the memory cache.

This reduces multiplayer HTTP/authentication requests and pose storage writes;
it does not make Durable Objects unlimited or restore an exhausted allowance.
Time Trial, presence and leaderboard HTTP endpoints retain their existing cadence.

The race leader opens the chequered flag on their third verified lap. All other
drivers finish on their next forward crossing of the track or pit-lane timing
line; lapped cars do not have to complete three laps. Results sort by completed
laps, then finish order; the mandatory pit-stop rule still applies. Flag state
is checkpointed immediately and race elapsed time starts at lights out.

Garage choices are original closed-roof GT-style designs with equal handling.
The server validates and locks the car ID at race registration and includes it
in rival snapshots. Local selection is remembered for the next session.
