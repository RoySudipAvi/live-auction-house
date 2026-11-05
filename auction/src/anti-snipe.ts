export const MAX_ANTI_SNIPE_SECONDS = 3600;

export type AntiSnipeSettings = {
  windowSec: number;
  extendBySec: number;
};

export type AntiSnipeProblem =
  | "INVALID_ANTI_SNIPE_WINDOW"
  | "ANTI_SNIPE_WINDOW_TOO_LONG"
  | "INVALID_ANTI_SNIPE_EXTENSION"
  | "ANTI_SNIPE_EXTENSION_TOO_LONG";

function isValidSeconds(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function validateAntiSnipeSettings(
  settings: AntiSnipeSettings,
): AntiSnipeProblem[] {
  const problems: AntiSnipeProblem[] = [];

  if (!isValidSeconds(settings.windowSec)) {
    problems.push("INVALID_ANTI_SNIPE_WINDOW");
  } else if (settings.windowSec > MAX_ANTI_SNIPE_SECONDS) {
    problems.push("ANTI_SNIPE_WINDOW_TOO_LONG");
  }

  if (!isValidSeconds(settings.extendBySec)) {
    problems.push("INVALID_ANTI_SNIPE_EXTENSION");
  } else if (settings.extendBySec > MAX_ANTI_SNIPE_SECONDS) {
    problems.push("ANTI_SNIPE_EXTENSION_TOO_LONG");
  }

  return problems;
}
