"""Custos entre condições — definições clássicas.

- Custo Stroop (RT): mediana(incongruente) - mediana(congruente).
  (Stroop, 1935; MacLeod, 1991, Psychological Bulletin 109(2).)
- Custo Stroop (acurácia): acc(congruente) - acc(incongruente) — positivo
  quando a interferência prejudica.
- Switch cost (RT): mediana(mixed_switch) - mediana(mixed_repeat).
- Mixing cost (RT): mediana(mixed_repeat) - mediana(puros).
  (Monsell, 2003, TiCS 7(3); Kiesel et al., 2010, Psych. Bulletin 136(5).)
- Custos de acurácia para task switching, na MESMA convenção "positivo = pior":
  switch cost acc  = acc(repeat) - acc(switch)
  mixing cost acc  = acc(pure)   - acc(repeat)   <-- ATENÇÃO: a produção
  calcula acc(repeat) - acc(pure), com sinal INVERTIDO em relação à própria
  convenção do switchCostAccuracy. O oráculo implementa a definição
  consistente; a comparação registra a divergência de sinal como achado.
"""

from __future__ import annotations

from typing import Optional, Sequence

from .stats import median


def _median_diff(a: Sequence[float], b: Sequence[float]) -> Optional[float]:
    ma = median(a)
    mb = median(b)
    if ma is None or mb is None:
        return None
    return mb - ma


def stroop_cost_rt(congruent_rts, incongruent_rts) -> Optional[float]:
    return _median_diff(congruent_rts, incongruent_rts)


def stroop_cost_accuracy(acc_congruent: float, acc_incongruent: float) -> float:
    return acc_congruent - acc_incongruent


def switch_cost_rt(switch_rts, repeat_rts) -> Optional[float]:
    return _median_diff(repeat_rts, switch_rts)


def mixing_cost_rt(repeat_mixed_rts, pure_rts) -> Optional[float]:
    return _median_diff(pure_rts, repeat_mixed_rts)


def switch_cost_accuracy(acc_repeat: float, acc_switch: float) -> float:
    return acc_repeat - acc_switch


def mixing_cost_accuracy_consistent(acc_pure: float, acc_repeat: float) -> float:
    """Definição consistente (positivo = pior): pure - repeat."""
    return acc_pure - acc_repeat


def mixing_cost_accuracy_as_production(acc_pure: float, acc_repeat: float) -> float:
    """O que a produção calcula: repeat - pure (sinal oposto)."""
    return acc_repeat - acc_pure
