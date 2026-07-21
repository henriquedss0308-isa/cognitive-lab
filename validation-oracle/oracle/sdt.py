"""Teoria de Detecção de Sinal — implementação independente.

Definições (Macmillan & Creelman, 2005, "Detection Theory: A User's Guide"):

    d' = z(H) - z(F)          criterio c = -(z(H) + z(F)) / 2

Correção log-linear de Hautus (1995, Behavior Research Methods 27(1), 46–51),
aplicada SEMPRE (não só em taxas extremas), como recomendado no artigo:

    H = (hits + 0.5) / (n_sinal + 1)
    F = (fa   + 0.5) / (n_ruido + 1)

Normal inversa: statistics.NormalDist().inv_cdf — precisão de máquina,
independente da aproximação de Acklam usada em produção.
"""

from __future__ import annotations

from statistics import NormalDist
from typing import Optional

_PHI_INV = NormalDist().inv_cdf


def sdt_metrics(hits: int, misses: int, false_alarms: int,
                correct_rejections: int) -> dict:
    signal = hits + misses
    noise = false_alarms + correct_rejections

    raw_hit = hits / signal if signal > 0 else 0.0
    raw_fa = false_alarms / noise if noise > 0 else 0.0

    d_prime: Optional[float] = None
    criterion: Optional[float] = None

    if signal > 0 and noise > 0:
        h = (hits + 0.5) / (signal + 1)
        f = (false_alarms + 0.5) / (noise + 1)
        zh = _PHI_INV(h)
        zf = _PHI_INV(f)
        d_prime = zh - zf
        criterion = -0.5 * (zh + zf)

    return {
        "hits": hits,
        "misses": misses,
        "falseAlarms": false_alarms,
        "correctRejections": correct_rejections,
        "hitRate": raw_hit,
        "falseAlarmRate": raw_fa,
        "dPrime": d_prime,
        "criterion": criterion,
    }
