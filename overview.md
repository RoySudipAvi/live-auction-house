# Live Auction House — Overview

A real-time, English-style (ascending open-bid) auction service. Sellers list items, bidders compete live over WebSocket, and the server guarantees that every auction ends with exactly one correct, auditable outcome.

Built test-first on three layers:

1. **`conc`** — my concurrency primitives library (Mutex, Semaphore, AsyncQueue, pLimit, Redis lock)
2. **`authd`** — my auth server/library (JWT access tokens, refresh rotation with reuse detection, Redis sessions, WS handshake auth)
3. **`auction`** — this product, which depends on both and on Express + Redis + Postgres

No third-party auth or locking libraries are used in `auction`.

---

## 1. Actors

| Actor | Can do |
|---|---|
| **Visitor** (unauthenticated) | Browse auctions, watch live prices read-only over WebSocket |
| **Bidder** | Everything a visitor can, plus place bids, see own bid history, see own active sessions |
| **Seller** | Create/cancel own auctions, see bids on own auctions |
| **Admin** | Cancel any auction, revoke any user's sessions |

A user can be both bidder and seller, but **cannot bid on their own auction**.

---

## 2. Auction lifecycle

```
DRAFT ──publish──▶ SCHEDULED ──start_time──▶ OPEN ──end_time──▶ CLOSED
                       │                       │                   │
                       └────cancel─────────────┴──cancel──▶ CANCELLED
```

Terminal outcomes of `CLOSED`:
- **SOLD** — highest valid bid ≥ reserve price; winner and final price recorded
- **UNSOLD** — no bids, or highest bid below reserve

An auction is defined by: title, description, starting price, minimum increment, optional reserve price (hidden from bidders; they only see "reserve met / not met"), start time, end time, and anti-sniping settings.

---

## 3. Use cases

### UC1 — Register, log in, stay logged in
Priya signs up, logs in on her laptop and phone.
- She receives a short-lived access token (15 min) and a refresh token (rotating, 7 days).
- When the access token expires, the client silently refreshes. Each refresh issues a **new** refresh token and invalidates the old one.
- **Attack case:** an attacker replays Priya's old refresh token. The server detects reuse, revokes the **entire token family**, and both the attacker and Priya's current session are forced to log in again. Priya sees a "your session ended for security reasons" message.

### UC2 — Seller lists an item
Marcus lists a vintage camera.
```
POST /auctions
{
  "title": "Leica M3, 1957",
  "startingPrice": 50000,        // minor units (cents)
  "minIncrement": 1000,
  "reservePrice": 120000,
  "startsAt": "2026-11-01T18:00:00Z",
  "endsAt":   "2026-11-01T19:00:00Z",
  "antiSnipe": { "windowSec": 120, "extendBySec": 120 }
}
```
The auction is `SCHEDULED`. At `startsAt` the server moves it to `OPEN` and broadcasts `auction.opened` to watchers. Marcus can cancel any time **before the first bid**; after a bid exists, only an admin can cancel.

### UC3 — Watching an auction live
Anyone (even logged out) connects:
```
WS /ws
→ { "type": "subscribe", "auctionId": "a_123" }
← { "type": "snapshot", "auctionId": "a_123", "status": "OPEN",
    "currentPrice": 62000, "bidCount": 7, "reserveMet": false,
    "endsAt": "2026-11-01T19:00:00Z", "serverTime": "..." }
← { "type": "bid.accepted", "auctionId": "a_123", "price": 63000, "bidCount": 8, "reserveMet": false }
```
Watchers never see bidder identities in real time (shown as "Bidder 3" only). The `serverTime` field lets clients correct their countdown clock for drift. **The server clock is the only authority on when an auction ends.**

### UC4 — Placing a bid (the core flow)
Dana is logged in and connected over WS:
```
→ { "type": "bid", "auctionId": "a_123", "amount": 64000, "bidId": "c1f9-…" }
← { "type": "bid.result", "bidId": "c1f9-…", "status": "ACCEPTED", "price": 64000 }
```
Rules, enforced atomically under the per-auction lock:
- Auction must be `OPEN` and `now < endsAt`
- `amount ≥ currentPrice + minIncrement` (or `≥ startingPrice` for the first bid)
- Bidder is not the seller and is not already the current highest bidder
- `bidId` is client-generated and **idempotent**: resending the same `bidId` (e.g. after a flaky connection) returns the original result and never creates a second bid

Rejections are explicit and typed: `AUCTION_NOT_OPEN`, `BID_TOO_LOW` (includes the minimum acceptable amount), `OWN_AUCTION`, `ALREADY_HIGHEST`, `AUCTION_ENDED`, `UNAUTHORIZED`.

### UC5 — Two people bid at the same instant
Dana and Eli both send 65000 within the same millisecond.
- Both messages reach the server; the per-auction lock serializes them.
- Whichever acquires the lock first is `ACCEPTED`. The other gets `BID_TOO_LOW` with `minimumAcceptable: 66000`.
- **Never** two accepted bids at the same price, and never a lower bid accepted after a higher one. This holds across multiple server instances (Redis lock) and is verified by a test that fires hundreds of concurrent bids.

### UC6 — Last-second bid (anti-sniping)
At 18:59:30 (30 seconds left, inside the 2-minute window), Dana bids.
- The bid is accepted and `endsAt` extends by 2 minutes.
- All watchers receive `auction.extended` with the new `endsAt`.
- A bid *exactly at* or *after* `endsAt` is rejected with `AUCTION_ENDED`; the boundary is defined once, in one place, and tested.
- A hard cap on total extensions (e.g. 24h from original end) prevents infinite auctions.

### UC7 — Auction closes
At `endsAt` the server closes the auction **exactly once**, even if several instances race to do it:
- Highest bid ≥ reserve → `SOLD`; winner and price are recorded, and `auction.closed` is broadcast.
- Otherwise → `UNSOLD`.
- The winner and seller can fetch the result (`GET /auctions/a_123/result`). Payment is out of scope; the record is the output.

### UC8 — Logging out / being kicked mid-auction
Dana clicks "log out everywhere" from her device list, or an admin revokes her sessions.
- Her refresh tokens are revoked immediately.
- Her open WebSocket is closed with an `AUTH_REVOKED` code within a second, not at the next token expiry.
- Her already-accepted bids stay valid; she just can't place new ones.

### UC9 — Reconnecting after a network drop
Dana's train enters a tunnel and her WS drops.
- On reconnect she re-authenticates (refreshing the token if it expired), re-subscribes, and receives a fresh `snapshot`.
- If she had an in-flight bid, resending the same `bidId` tells her whether it landed.

### UC10 — Reviewing history
- Bidder: `GET /me/bids` shows each bid and its outcome (leading / outbid / won / lost).
- Seller: `GET /auctions/a_123/bids` shows the full ordered bid log, with bidder identities visible to the seller and admin only.
- Every bid has a monotonic sequence number per auction, so the history is a gap-free, auditable ordering.

---

## 4. Correctness invariants (what "complete" means)

These are the properties the test suite must prove. Each has at least one test, and the concurrency ones have stress tests.

1. **Total order:** accepted bids per auction form a strictly increasing price sequence with gap-free sequence numbers.
2. **No lost or duplicate bids:** every accepted bid is persisted exactly once, even with retries, crashes mid-request, or multiple instances.
3. **Single winner:** a closed auction has exactly one outcome, computed from the persisted bid log, never from in-memory state.
4. **Close exactly once:** concurrent close attempts produce one close and one broadcast.
5. **Time authority:** only the server clock decides acceptance; the boundary at `endsAt` is deterministic.
6. **Idempotency:** same `bidId` → same result, always.
7. **Auth integrity:** expired, forged, `alg: none`, revoked, or replayed-refresh tokens never authorize a bid. Revocation takes effect on live sockets.
8. **Lock safety:** a lock holder that crashes or stalls cannot cause two holders to act at once (TTL + fencing token checked at the database write).
9. **Money is integers:** all amounts are integer minor units; no floats anywhere.
10. **Broadcast consistency:** watchers never see a price that was not committed, and never see prices go backwards.

---

## 5. Scope

**In scope:** everything in the use cases above, a REST API, the WebSocket protocol, Postgres persistence, Redis for locks/sessions/pub-sub across instances, structured logging, and a minimal static HTML client to try it by hand.

**Out of scope (deliberately):** payments and escrow, images/uploads, email notifications, proxy/auto-bidding, search and categories, a polished UI, and horizontal autoscaling beyond "2-3 instances behind a local load balancer" for testing.

---

## 6. How it depends on the earlier projects

| Need | Provided by | Used for |
|---|---|---|
| Per-auction mutual exclusion | `conc` Mutex (in-process) + Redis lock with fencing token | Serializing bids; closing exactly once |
| Bounded concurrency | `conc` Semaphore / pLimit | Capping broadcast fan-out and DB work per tick |
| Ordered async processing | `conc` AsyncQueue | Per-connection outbound message queue (no interleaved writes) |
| Identity & tokens | `authd` JWT + refresh rotation | REST and WS authentication |
| Revocation & devices | `authd` Redis sessions | Kicking live sockets, "log out everywhere" |

If something I need is missing or awkward in `conc` or `authd` when I reach the auction, I fix it there first (with tests), not with a workaround in `auction`.

---

## 7. Definition of done

- All invariants above covered by passing tests, including a concurrent stress suite (hundreds of simultaneous bids, with repeated runs to catch flakiness).
- A scripted end-to-end scenario: 3 bidders, 1 seller, anti-sniping triggered, close, result verified.
- Two server instances running against the same Redis and Postgres, with the stress suite passing across both.
- A short README with how to run, the protocol reference, and the list of known limitations.
