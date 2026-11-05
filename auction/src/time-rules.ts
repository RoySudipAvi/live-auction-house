import { isValidTime } from "./time.js";

export const MIN_AUCTION_DURATION_MS = 60_000;

export type TimeRulesInput = {
  startTime: number;
  endTime: number;
};

export type TimeRuleProblem =
  | "INVALID_START_TIME"
  | "INVALID_END_TIME"
  | "END_NOT_AFTER_START"
  | "AUCTION_TOO_SHORT";

export type StartTimeProblem = "START_NOT_AFTER_NOW";

export function validateTimeRules(input: TimeRulesInput): TimeRuleProblem[] {
  const problems: TimeRuleProblem[] = [];

  const startOk = isValidTime(input.startTime);
  const endOk = isValidTime(input.endTime);

  if (!startOk) {
    problems.push("INVALID_START_TIME");
  }

  if (!endOk) {
    problems.push("INVALID_END_TIME");
  }

  if (startOk && endOk) {
    const duration = input.endTime - input.startTime;

    if (duration <= 0) {
      problems.push("END_NOT_AFTER_START");
    } else if (duration < MIN_AUCTION_DURATION_MS) {
      problems.push("AUCTION_TOO_SHORT");
    }
  }

  return problems;
}

export function validateStartNotInPast(
  startTime: number,
  now: number,
): StartTimeProblem[] {
  if (!isValidTime(startTime)) {
    return [];
  }

  if (startTime <= now) {
    return ["START_NOT_AFTER_NOW"];
  }

  return [];
}
