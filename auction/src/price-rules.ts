import { isValidAmount } from "./money.js";

export type PriceRulesInput = {
  startingPrice: number;
  minIncrement: number;
  reservePrice?: number;
};

export type PriceRuleProblem =
  | "INVALID_STARTING_PRICE"
  | "INVALID_MIN_INCREMENT"
  | "INVALID_RESERVE_PRICE"
  | "RESERVE_BELOW_STARTING_PRICE";

export function validatePriceRules(input: PriceRulesInput): PriceRuleProblem[] {
  const problems: PriceRuleProblem[] = [];
  const startingPriceOk = isValidAmount(input.startingPrice);
  if (!startingPriceOk) {
    problems.push("INVALID_STARTING_PRICE");
  }
  if (!isValidAmount(input.minIncrement)) {
    problems.push("INVALID_MIN_INCREMENT");
  }
  if (input.reservePrice !== undefined) {
    const reserveOk = isValidAmount(input.reservePrice);
    if (!reserveOk) {
      problems.push("INVALID_RESERVE_PRICE");
    } else if (startingPriceOk && input.reservePrice < input.startingPrice) {
      problems.push("RESERVE_BELOW_STARTING_PRICE");
    }
  }

  return problems;
}
