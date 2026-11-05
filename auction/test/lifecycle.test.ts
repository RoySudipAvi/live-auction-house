import { describe, it, expect } from "vitest";
import { canTransition } from "../src/lifecycle.js";
import type { AuctionStatus } from "../src/lifecycle.js";

type Move = [AuctionStatus, AuctionStatus];

const ALL_STATES: AuctionStatus[] = [
  "DRAFT",
  "SCHEDULED",
  "OPEN",
  "CLOSED",
  "CANCELLED",
];

const ALLOWED_MOVES: Move[] = [
  ["DRAFT", "SCHEDULED"],
  ["SCHEDULED", "OPEN"],
  ["OPEN", "CLOSED"],
  ["SCHEDULED", "CANCELLED"],
  ["OPEN", "CANCELLED"],
];

function isAllowed(from: AuctionStatus, to: AuctionStatus): boolean {
  return ALLOWED_MOVES.some(([f, t]) => f === from && t === to);
}

// Every pair of states, minus the allowed ones.
const REFUSED_MOVES: Move[] = ALL_STATES.flatMap((from) =>
  ALL_STATES.map((to): Move => [from, to]),
).filter(([from, to]) => !isAllowed(from, to));

describe("canTransition", () => {
  it("test setup: 25 pairs, 5 allowed, 20 refused", () => {
    expect(ALL_STATES.length * ALL_STATES.length).toBe(25);
    expect(ALLOWED_MOVES.length).toBe(5);
    expect(REFUSED_MOVES.length).toBe(20);
  });

  it.each(ALLOWED_MOVES)("allows %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each(REFUSED_MOVES)("refuses %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});
