import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenAiBudgetState, ensureAiBudgetAvailable } from "../ai-budget.js";

test("buildOpenAiBudgetState returns ok below warning threshold", () => {
  const budget = buildOpenAiBudgetState({ aiTokenLimit: 1000, aiTokenWarningPercent: 80 }, 200);
  assert.equal(budget.status, "ok");
  assert.equal(budget.remainingTokens, 800);
});

test("buildOpenAiBudgetState returns warning at warning threshold", () => {
  const budget = buildOpenAiBudgetState({ aiTokenLimit: 1000, aiTokenWarningPercent: 80 }, 800);
  assert.equal(budget.status, "warning");
});

test("buildOpenAiBudgetState returns exceeded at limit", () => {
  const budget = buildOpenAiBudgetState({ aiTokenLimit: 1000, aiTokenWarningPercent: 80 }, 1000);
  assert.equal(budget.status, "exceeded");
});

test("ensureAiBudgetAvailable requires confirmation for warning budgets", () => {
  const budget = buildOpenAiBudgetState({ aiTokenLimit: 1000, aiTokenWarningPercent: 80 }, 900);
  assert.throws(() => ensureAiBudgetAvailable(budget));
  assert.doesNotThrow(() => ensureAiBudgetAvailable(budget, true));
});
