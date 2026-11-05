# Live Auction House: Build Plan (need-driven)

This plan replaces "build `conc` and `authd` first". We build the auction in thin slices. Each slice has a test that fails first. When a test shows we need a primitive, we build it in `conc` or `authd`, then use it.

No code here. This is the plan only.

---

## 1. Strict rules

These rules keep the need-driven approach clean.

1. **Three separate modules from day one.** `conc`, `authd` and `auction` each live in their own folder, with their own tests and a small public API. `auction` uses them only through that public API. It never reaches into their internals.
2. **Test first.** Write the test. Watch it fail. Then write the code. A primitive is only built after a failing test shows we need it.
3. **Need-driven, but never sloppy.** When a primitive is pulled in, we build it fully to its contract in `conc-design.md`: FIFO, always release, timeouts and cancel, typed errors, leak checks. The design note is a checklist, not a plan to finish up front.
4. **Fix the library, not the product.** If `conc` or `authd` is awkward, fix it there first, with tests. No workaround inside `auction`.
5. **Design the data early.** Some things are hard to add later. We settle them in the first slices (see section 2).
6. **Stress tests early.** The first concurrency stress test is written before any lock exists. We want to see it fail.
7. **One slice at a time.** A slice is small. We finish it, run all tests, and only then start the next.
8. **Understand before implementing.** Before each slice we talk through the design in simple words. Code comes after.

---

## 2. Data decisions made early

These shape the database. We decide them in slices 1 to 3, even if the features come later.

- **Money:** integer minor units only. No floats anywhere.
- **Bids table:** each bid has a per-auction sequence number (gap-free), a client-generated `bidId` with a unique constraint, the amount, the bidder, a timestamp, and a column for the fencing token.
- **Auction row:** status, current price, bid count, end time, extension count, and a field for the last fencing token seen.
- **Close record:** result (SOLD or UNSOLD), winner, final price, closed time. Written once.
- **Auth storage (later):** refresh token families and sessions, designed with reuse detection in mind.

---

## 3. The slices

Tags: **[auction]**, **[conc]**, **[authd]**.

| # | Slice | Pulls in |
|---|---|---|
| 1 | Money and the auction model [auction] | Nothing |
| 2 | Postgres schema and storage [auction] | Nothing |
| 3 | Place a bid, one at a time [auction] | Nothing |
| 4 | REST API with a temporary fake user [auction] | Nothing |
| 5 | Server clock, boundary and anti-sniping [auction] | Nothing |
| 6 | Close an auction once, one instance [auction] | Nothing |
| 7 | First stress test fails, then in-process lock [conc] | **Mutex** |
| 8 | Real login and access tokens [authd] | **authd v1** |
| 9 | WebSocket watchers and broadcast [auction] | Possibly nothing yet |
| 10 | Slow watchers [conc] | **AsyncQueue** |
| 11 | Refresh tokens, rotation, reuse detection [authd] | **authd v2** |
| 12 | Second instance [conc] | **Redis lock v1** |
| 13 | Stalled lock holder [conc] | **Fencing token (Redis lock v2)** |
| 14 | Logout everywhere, kick live sockets [authd] | **authd v3** |
| 15 | Heavy load: fan-out and close spikes [conc] | **Semaphore, then pLimit** (only if needed) |
| 16 | End-to-end scenario and README | Nothing |

The order can change if a real need appears earlier. Slices 8 and 9 can swap. Slice 15 may be skipped if the load never demands it.

---

## 4. Slice details

For each slice: what we build, the first failing test, and when it is done.

### Slice 1: Money and the auction model
- **Build:** the auction data shape, the lifecycle states (DRAFT, SCHEDULED, OPEN, CLOSED, CANCELLED) and the allowed moves between them. Integer money helpers.
- **First failing test:** an illegal state move is rejected. A float amount is rejected.
- **Done when:** the state machine is fully covered by tests. Invariant 9 is enforced.

### Slice 2: Postgres schema and storage
- **Build:** the tables from section 2, and a small storage layer to read and write them.
- **First failing test:** save an auction and a bid, read them back. A duplicate `bidId` is rejected by the database. Sequence numbers cannot repeat.
- **Done when:** the database itself refuses bad data, even before the app logic exists.

### Slice 3: Place a bid, one at a time
- **Build:** the bid rules from UC4: auction open, amount high enough, not the seller, not already the highest bidder. Typed rejections. Idempotent `bidId`.
- **First failing test:** each rejection type is returned with the right reason. Sending the same `bidId` twice returns the original result and creates one bid.
- **Done when:** all rules pass with one bid at a time. We know this is NOT yet safe under concurrency.

### Slice 4: REST API with a temporary fake user
- **Build:** create, publish, cancel and read auctions, and a bid endpoint. The user comes from a simple header. This is a clearly marked stub.
- **First failing test:** an end-to-end call creates an auction and accepts a bid.
- **Done when:** the flow works over HTTP. The stub is easy to replace with `authd`.

### Slice 5: Server clock, boundary and anti-sniping
- **Build:** a clock the code receives from outside, so tests can control time. The exact rule at `endsAt`. The anti-sniping extension and the cap on total extensions.
- **First failing test:** a bid exactly at `endsAt` is rejected. A bid in the last window extends the end time. Extensions stop at the cap.
- **Done when:** the boundary is defined in one place and tested. Invariant 5 holds.

### Slice 6: Close an auction once, one instance
- **Build:** the closing step. It reads the saved bids, picks the winner, compares with the reserve, and writes the result once.
- **First failing test:** closing twice leaves one result. A reserve not met gives UNSOLD. The winner comes from the database, not from memory.
- **Done when:** invariants 3 and 4 hold for one instance.

### Slice 7: First stress test fails, then the Mutex
- **Build, part 1 (test only):** a stress test that fires hundreds of concurrent bids at one auction. Run it and watch it fail: two bids accepted at the same price, or gaps in sequence numbers.
- **Build, part 2 [conc]:** the **Mutex**, to its full contract. Then a per-auction lock around the bid flow.
- **First failing test:** the stress test above.
- **Done when:** the stress test passes in many repeated runs. Invariants 1, 2 and 6 hold for one instance.

### Slice 8: Real login and access tokens
- **Build [authd]:** register, login, password hashing, short-lived signed access tokens. Reject expired, forged and `alg: none` tokens. Replace the fake user in the API.
- **First failing test:** a forged token and an expired token never authorize a bid.
- **Done when:** the REST API uses real tokens.

### Slice 9: WebSocket watchers and broadcast
- **Build:** subscribe, snapshot, `bid.accepted`, `auction.extended`, `auction.closed`. Visitors can watch. Broadcast only after the commit.
- **First failing test:** a watcher never sees an uncommitted price. A watcher never sees the price go backwards.
- **Done when:** the basic live view works. We expect a problem with slow watchers next.

### Slice 10: Slow watchers
- **Build [conc]:** the **AsyncQueue**: bounded, with backpressure and a clean close. One per connection.
- **First failing test:** one watcher that reads slowly must not slow down bidders or other watchers. A watcher that falls too far behind is closed.
- **Done when:** invariant 10 holds under a slow-client test.

### Slice 11: Refresh tokens, rotation, reuse detection
- **Build [authd]:** refresh tokens stored in Redis, one-time use, grouped in families. Reuse of an old token revokes the whole family.
- **First failing test:** replaying an old refresh token ends both the attacker's and the real user's session.
- **Done when:** UC1 works fully, including the attack case.

### Slice 12: Second instance
- **Build, part 1 (test only):** run two instances against the same Redis and Postgres. Run the stress test across both. Watch it fail, because the in-process Mutex cannot see the other instance.
- **Build, part 2 [conc]:** the **Redis lock, version 1**: atomic take with TTL, unique owner id, safe release. Add pub/sub so a bid on one instance reaches watchers on the other.
- **First failing test:** the cross-instance stress test.
- **Done when:** the stress test passes across two instances. Closing still happens once.

### Slice 13: Stalled lock holder
- **Build, part 1 (test only):** pause a lock holder past its TTL, let a second holder act, then wake the first one. Watch its late write succeed. That is the bug.
- **Build, part 2 [conc]:** the **fencing token**. The auction passes the token to every write, and the database rejects an older one.
- **First failing test:** the stalled-holder test.
- **Done when:** invariant 8 holds.

### Slice 14: Logout everywhere, kick live sockets
- **Build [authd]:** list sessions, revoke them, and close open WebSockets with `AUTH_REVOKED` within about one second. Already-accepted bids stay valid.
- **First failing test:** a revoked user's open socket is closed in time and cannot bid.
- **Done when:** invariant 7 holds on live sockets.

### Slice 15: Heavy load (only if needed)
- **Build [conc]:** the **Semaphore**, then **pLimit**, to cap broadcast fan-out and database work when many auctions close at once.
- **First failing test:** a load test where uncapped work overwhelms the database or memory.
- **Done when:** the load test passes. If no real problem appears, we skip this slice and note it.

### Slice 16: End-to-end scenario and README
- **Build:** the scripted scenario: 3 bidders, 1 seller, anti-sniping, close, result checked. A short README with how to run, the protocol, and the known limits.
- **Done when:** the definition of done in the overview is met.

---

## 5. Which slice proves which invariant

| Invariant | Proven in slice |
|---|---|
| 1. Total order | 3, 7, 12 |
| 2. No lost or duplicate bids | 2, 3, 7, 13 |
| 3. Single winner | 6 |
| 4. Close exactly once | 6, 12 |
| 5. Time authority | 5 |
| 6. Idempotency | 2, 3 |
| 7. Auth integrity | 8, 11, 14 |
| 8. Lock safety | 13 |
| 9. Money is integers | 1, 2 |
| 10. Broadcast consistency | 9, 10 |

---

## 6. Rules for each slice

For every slice, we follow the same short routine:

1. **Talk it through.** Explain the idea in simple words. No code yet.
2. **Write the failing test.** Describe it first, then write it.
3. **Make it pass.** The smallest change that works.
4. **Run everything.** All old tests must still pass. Stress tests run many times.
5. **Check for leaks.** Locks, permits, waiters and connections are back to their start state.
6. **Note what we learned.** One or two lines, and any known limit.

---

## 7. Next step

Start with slice 1: the money and the auction model. We talk through the data shape and the lifecycle states first, with no code.
