export type AuctionStatus =
  "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED" | "CANCELLED";

const ALLOWED_NEXT: Record<AuctionStatus, readonly AuctionStatus[]> = {
  DRAFT: ["SCHEDULED"],
  SCHEDULED: ["OPEN", "CANCELLED"],
  OPEN: ["CLOSED", "CANCELLED"],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransition(from: AuctionStatus, to: AuctionStatus): boolean {
  return ALLOWED_NEXT[from].includes(to);
}
