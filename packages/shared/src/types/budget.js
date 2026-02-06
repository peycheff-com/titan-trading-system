/**
 * Budget Types for Titan Allocator
 * Defines the contract for Risk Budgets issued by Brain to Phases.
 */
export var BudgetState;
(function (BudgetState) {
    BudgetState["ACTIVE"] = "ACTIVE";
    BudgetState["THROTTLED"] = "THROTTLED";
    BudgetState["HALTED"] = "HALTED";
    BudgetState["CLOSE_ONLY"] = "CLOSE_ONLY";
})(BudgetState || (BudgetState = {}));
//# sourceMappingURL=budget.js.map