# `conc` Library Design

A design note for my concurrency primitives library. No code here. This is the plan for what the library has and how it will be built.

---

## 1. What the library is for

`conc` gives the auction a small set of tools to control **who runs when**. Its goal is to make concurrent code safe and easy to reason about.

It has five primitives:

| Primitive | One-line job | Scope |
|---|---|---|
| **Mutex** | One task at a time inside a critical section | One process |
| **Semaphore** | At most N tasks at a time | One process |
| **pLimit** | Run many tasks, but only N at once | One process |
| **AsyncQueue** | Pass items in order from producers to consumers | One process |
| **Redis lock** | One holder at a time across all processes, with a fencing token | Across processes |

---

## 2. Design rules for the whole library

Decide these once. Every primitive follows them.

1. **Small, boring API.** Few methods, clear names. A primitive that is easy to misuse is a bad primitive.
2. **Safe by default.** The easy way to use it is also the safe way. Main example: a "run this inside the lock" method that **always releases**, even on errors. Raw acquire and release exist, but are the advanced path. This avoids lock leaks.
3. **Fair (FIFO).** Waiters are served in the order they arrived. This prevents starvation and makes tests predictable.
4. **No busy waiting.** A waiting task sleeps in a queue. It does not poll in a loop.
5. **Waiting can be cancelled.** Every wait accepts a timeout and a cancel signal. A task waiting for a lock must be able to give up.
6. **Typed errors.** Timeout, cancelled, and "lock lost" are different errors. The caller can tell them apart.
7. **No hidden global state.** Each primitive is an object you create. Nothing is shared by accident.
8. **Easy to observe.** Each primitive can report its state: how many are waiting, how many are active.
9. **Testable time.** Anything that uses time (timeouts, TTL) must work with a fake clock in tests.
10. **Fail loudly on misuse.** Releasing twice, or releasing a lock you do not hold, must raise an error. It must not fail silently.

---

## 3. The primitives

For each one: what it does, the decisions to make, and what to test.

### 3.1 Mutex

**What it does.** One holder at a time. Others wait in a FIFO queue.

**Decisions:**
- **Re-entrant or not?** Simple choice: not re-entrant. In async JS, "the same task" is hard to identify anyway.
- **Try-lock?** A method that returns at once if the lock is taken.
- **Handoff style.** On release, give the lock directly to the next waiter, or let it go free and let waiters compete. Direct handoff is fairer and simpler to prove correct.
- **Release ownership.** Does release need a token from acquire? This stops releasing someone else's lock.

**Tests:**
- Two tasks never overlap in the critical section.
- Waiters are served in order.
- The lock releases when the task throws.
- A timeout removes the waiter from the queue cleanly.
- Many tasks at once (stress).

### 3.2 Semaphore

**What it does.** A counter of free permits. Acquire takes one, release gives one back.

**Decisions:**
- **Permits at once.** Can a task take more than one? That adds complexity. First version: one at a time.
- **Relationship to Mutex.** Is Mutex just a Semaphore with N = 1? A separate Mutex with a clear name is friendlier to read.
- **Over-release.** What if the count goes above N? It should throw.

**Tests:**
- Never more than N active.
- The count returns to N after all tasks finish, even when tasks fail. This catches leaks.
- Waiters are served in order.

### 3.3 pLimit

**What it does.** You give it many tasks. It runs at most N at once and returns each task's result.

**Design idea.** It sits on top of the Semaphore. pLimit is the friendly shape. The Semaphore is the engine.

**Decisions:**
- **Task failure.** The error goes to that task's caller only. Other tasks continue.
- **Can the limit change at runtime?**
- **Can queued tasks be cancelled or cleared?**
- **Result order.** Results match what the caller expects, even if tasks finish out of order.

**Tests:**
- Never more than N running.
- A failing task does not break the others.
- Everything finishes and the queue empties.

### 3.4 AsyncQueue

**What it does.** Producers add items. Consumers take items, one at a time, in order. If the queue is empty, a consumer waits.

**Decisions:**
- **Bounded or unbounded?** Unbounded can fill memory if consumers are slow. Bounded makes producers wait when full. This is **backpressure**. For slow WebSocket watchers, bounded is safer.
- **What to do when full?** Wait, drop oldest, drop newest, or throw. For a WebSocket, a client that is too slow may be closed.
- **Closing.** The queue must be able to say "no more items" so consumers finish cleanly.
- **One consumer or many?** For per-connection outbound messages, one consumer keeps order.

**Tests:**
- Order is never broken.
- A waiting consumer wakes when an item arrives.
- Backpressure works.
- Close stops everyone cleanly with no hanging waiters.

### 3.5 Redis lock

This one is different. It crosses process boundaries, so it faces failures the in-process tools never see: network drops, crashes, slow clocks.

**What it does.** One holder at a time across all instances. It also gives a **fencing token**: a number that increases with every grant.

**Core design parts:**
- **Taking the lock.** An atomic "set only if not present, with an expiry (TTL)". One Redis command.
- **Unique owner id.** Each holder writes a random id into the lock.
- **Safe release.** Release only if the stored id is still mine. Otherwise I might delete a lock that expired and was taken by someone else. The check and delete must be **atomic**, so it needs a small server-side script.
- **TTL.** Protects against a crashed holder.
- **Renewal (optional).** For long work, the holder extends the TTL. Skip at first, since work should be short.
- **Fencing token.** An atomic counter in Redis, incremented at each grant. The holder sends the token with every database write. Postgres rejects a write if its token is older than the last one it saw.
- **Waiting.** When the lock is taken, the caller retries after a short delay with random jitter, so waiters do not all retry together. Always with a timeout.
- **Lock lost.** The holder must be able to learn it lost the lock.

**Decisions:**
- **Single Redis or multiple?** A single Redis is simple and enough for this project. Multi-node schemes (like Redlock) are debated and out of scope. Record as a known limitation.
- **Where the fencing check happens.** In the Postgres write. The library gives the token. The auction code uses it.
- **Redis is down.** Safest: reject bids rather than risk two holders.

**Tests:**
- Two clients never hold the lock at once.
- A holder cannot release someone else's lock.
- The lock expires after the TTL.
- Fencing tokens always increase.
- A stalled holder's late write is rejected (simulate with a paused client).
- Stress test across multiple real processes.

---

## 4. How the pieces connect

```
Mutex       <- used by the auction to serialize bids inside one instance
Semaphore   <- the engine of pLimit
pLimit      <- caps broadcast fan-out and DB work
AsyncQueue  <- per-connection outbound messages
Redis lock  <- serializes bids across instances, and closes an auction exactly once
```

Mutex, Semaphore and pLimit are close relatives. The queue and the Redis lock are separate.

---

## 5. Build order

Build from simple to hard. Tests come before code.

1. **Shared basics.** Error types, the cancel and timeout idea, the fake clock helper.
2. **Mutex.** The simplest primitive. It teaches fairness, release safety and cancellation. Everything else reuses these lessons.
3. **Semaphore.** A generalization of the Mutex.
4. **pLimit.** A thin layer on the Semaphore.
5. **AsyncQueue.** A new idea: backpressure and closing.
6. **Redis lock, version 1.** Basic take and safe release with TTL.
7. **Redis lock, version 2.** Add the fencing token.
8. **Multi-process stress test.** Several real processes fighting for one lock.

---

## 6. Testing strategy

Normal tests do not catch races. Use these ideas:

- **Invariant tests.** Define the rule ("never more than N active") and check it after every step.
- **Stress tests.** Hundreds of tasks at once, many repeats. Randomize timing and delays so many orders occur.
- **Controlled timing tests.** Use fake timers to force exact orderings, such as "the timeout fires just as the lock is released".
- **Leak checks.** After a test, the primitive must be back at its starting state: no waiters, all permits free.
- **Failure injection.** Make tasks throw, time out, or get cancelled in the middle. Check the state is still clean.
- **Repeat for flakiness.** Run each test many times. A test that fails once in a thousand runs is a bug report, not noise.
- **Real-process tests** for the Redis lock. In-process fakes are not enough.

---

## 7. Definition of done for `conc`

- Each primitive has a short written contract: what it promises and what it does not.
- All invariants of each primitive pass under stress, repeated many times.
- No leaked waiters or permits after any test, even failing ones.
- Two or more real processes share the Redis lock safely.
- A short README with the API and the known limits.

---

## 8. Known limits (write down early)

- The in-process tools protect only one process.
- The Redis lock depends on one Redis node. If Redis fails over, the guarantees may break.
- Time-based expiry is never perfectly safe. That is why the fencing token exists.
- Fairness is by order of arrival, not by importance.

---

## 9. Next step

Step A: the shared basics plus the Mutex design. That means error types, timeouts and cancellation, then the full Mutex contract and its test list. No code.
