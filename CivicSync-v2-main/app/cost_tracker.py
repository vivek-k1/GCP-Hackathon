from datetime import datetime
from typing import Dict, List


# Pricing per token (USD) as of April 2026
_PRICING: Dict[str, Dict[str, float]] = {
    "claude-sonnet-4-6": {"input": 3.0 / 1_000_000, "output": 15.0 / 1_000_000},
    "claude-haiku-4-5-20251001": {"input": 0.25 / 1_000_000, "output": 1.25 / 1_000_000},
}


class CostTracker:
    def __init__(self, budget_usd: float = 20.0):
        self.budget = budget_usd
        self.calls: List[Dict] = []

    def log_call(self, model: str, input_tokens: int, output_tokens: int) -> Dict:
        rate = _PRICING.get(model, _PRICING["claude-sonnet-4-6"])
        cost = input_tokens * rate["input"] + output_tokens * rate["output"]

        self.calls.append({
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost,
            "timestamp": datetime.utcnow().isoformat(),
        })

        total = self.total_cost()
        if total > self.budget * 0.8:
            print(f"[WARN] Budget warning: ${total:.4f} spent ({total/self.budget*100:.0f}% of ${self.budget})")

        return {
            "cost_usd": cost,
            "total_spent_usd": total,
            "budget_remaining_usd": self.budget - total,
        }

    def total_cost(self) -> float:
        return sum(c["cost_usd"] for c in self.calls)

    def summary(self) -> Dict:
        total = self.total_cost()
        return {
            "total_calls": len(self.calls),
            "total_cost_usd": round(total, 6),
            "budget_remaining_usd": round(self.budget - total, 6),
            "sonnet_calls": sum(1 for c in self.calls if "sonnet" in c["model"]),
            "haiku_calls": sum(1 for c in self.calls if "haiku" in c["model"]),
        }


# Singleton shared across the FastAPI app
tracker = CostTracker(budget_usd=20.0)
