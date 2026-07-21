"""Baseline, janelas e z primário — implementação independente.

Regras declaradas (spec §1–§3 e docs/CONTEXT_AWARE_BASELINE.md):

- Elegibilidade: assessment, mesma (testId, protocolVersion), quality != invalid,
  não-demo, status completed, com result, sem insufficientPractice; ordem
  cronológica por startedAt.
- Fases por CONTAGEM de sessões elegíveis: <3 familiarização; 3..10 construção;
  >= 11 monitoramento (3 familiarização + 8 baseline).
- Janela GERAL congelada: posições [3, 11) das elegíveis (posicional).
- Janela CONTEXTUAL: as PRIMEIRAS 8 elegíveis com status explícito do contexto
  ('taken' | 'not_taken') APÓS a familiarização global; 'unknown' nunca entra.
- Mediana e MAD por métrica sobre valores não nulos; n = contagem usada.
- z primário: exige fase monitoring, n >= 6 (MIN_BASELINE_N), MAD != 0,
  direção declarada; nada é inventado quando falta dado.
"""

from __future__ import annotations

from typing import Optional, Sequence

from .stats import mad, median, robust_z

FAMILIARIZATION = 3
BASELINE_WINDOW = 8
MIN_BASELINE_N = 6
CONTEXTUAL_WINDOW = 8


def phase_for_count(n: int) -> str:
    if n < FAMILIARIZATION:
        return "familiarization"
    if n < FAMILIARIZATION + BASELINE_WINDOW:
        return "baseline_building"
    return "monitoring"


def eligible(sessions: Sequence[dict], test_id: str, protocol: str) -> list:
    ok = [s for s in sessions
          if s["testId"] == test_id
          and s["protocolVersion"] == protocol
          and s["mode"] == "assessment"
          and s["quality"] != "invalid"
          and not s.get("isDemo", False)
          and s.get("status", "completed") == "completed"
          and s.get("completedAt")
          and s.get("result") is not None
          and not s.get("flags", {}).get("insufficientPractice", False)]
    return sorted(ok, key=lambda s: (s["startedAt"], s["sessionId"]))


def general_window(elig: Sequence[dict]) -> list:
    phase = phase_for_count(len(elig))
    if phase == "monitoring":
        return list(elig[FAMILIARIZATION:FAMILIARIZATION + BASELINE_WINDOW])
    return list(elig[FAMILIARIZATION:])


def contextual_window(elig: Sequence[dict], status: str) -> list:
    after = list(elig[FAMILIARIZATION:])
    candidates = [s for s in after if s.get("lisdexStatus", "unknown") == status]
    return candidates[:CONTEXTUAL_WINDOW]


def metric_stats(window: Sequence[dict], key: str) -> dict:
    values = []
    for s in window:
        v = s["result"].get(key)
        if v is not None and v == v:  # exclui NaN
            values.append(float(v))
    return {"median": median(values), "mad": mad(values), "n": len(values)}


def primary_z(value: Optional[float], phase: str, stats: Optional[dict],
              direction: Optional[int]) -> dict:
    """Réplica das regras declaradas de evaluatePrimaryZ (spec §3.2)."""
    if phase != "monitoring":
        return {"kind": "not_monitoring"}
    if stats is None:
        return {"kind": "no_baseline_metric"}
    if direction not in (1, -1):
        return {"kind": "no_direction"}
    if value is None or value != value or value in (float("inf"), float("-inf")):
        return {"kind": "value_missing"}
    if stats["n"] < MIN_BASELINE_N:
        return {"kind": "insufficient_n", "n": stats["n"]}
    if stats["mad"] == 0 and stats["median"] is not None:
        return {"kind": "zero_mad", "median": stats["median"],
                "delta": value - stats["median"], "n": stats["n"]}
    z = robust_z(value, stats["median"], stats["mad"], direction)
    if z is None:
        return {"kind": "value_missing"}
    return {"kind": "ok", "z": z, "n": stats["n"]}
