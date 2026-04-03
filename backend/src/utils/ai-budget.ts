import type { OpenAiBudgetState } from "../../../shared/src/index.js";

export function buildOpenAiBudgetState(input: { aiTokenLimit?: number; aiTokenWarningPercent?: number }, totalTokensUsed: number): OpenAiBudgetState {
  const limitTokens = Math.max(0, Number(input.aiTokenLimit ?? 1000000));
  const warningPercent = Math.min(100, Math.max(1, Number(input.aiTokenWarningPercent ?? 80)));
  const remainingTokens = Math.max(0, limitTokens - totalTokensUsed);
  const warningPoint = limitTokens > 0 ? Math.floor((limitTokens * warningPercent) / 100) : 0;
  const status = limitTokens > 0 && totalTokensUsed >= limitTokens ? "exceeded" : limitTokens > 0 && totalTokensUsed >= warningPoint ? "warning" : "ok";
  const warningMessage = status === "exceeded"
    ? "Da vuot gioi han token AI da cau hinh."
    : status === "warning"
      ? "Dang gan cham gioi han token AI da cau hinh."
      : "Ngan sach token AI van con an toan.";

  return {
    limitTokens,
    warningPercent,
    usedTokens: totalTokensUsed,
    remainingTokens,
    status,
    warningMessage
  };
}

export function aiBudgetNeedsConfirmation(budget: OpenAiBudgetState) {
  return budget.status === "warning" || budget.status === "exceeded";
}

export function ensureAiBudgetAvailable(budget: OpenAiBudgetState, confirmedOverride?: boolean) {
  if (!aiBudgetNeedsConfirmation(budget)) {
    return;
  }
  if (confirmedOverride) {
    return;
  }

  const message = budget.status === "exceeded"
    ? "AI token budget exceeded. Confirmation required to continue using AI."
    : "AI token budget warning threshold reached. Confirmation required to continue using AI.";

  const error = new Error(message) as Error & { code?: string; budget?: OpenAiBudgetState; requiresConfirmation?: boolean };
  error.code = "AI_BUDGET_CONFIRMATION_REQUIRED";
  error.budget = budget;
  error.requiresConfirmation = true;
  throw error;
}
