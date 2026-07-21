"""Estatística descritiva — implementação independente a partir das definições.

Definições adotadas (e a fonte da definição):

- mediana: ponto médio dos dois centrais para n par (definição clássica).
- desvio padrão: amostral, denominador n-1 (Bessel); indefinido para n < 2.
- percentil: interpolação linear entre postos, método R-7 (Hyndman & Fan, 1996,
  "Sample Quantiles in Statistical Packages", The American Statistician 50(4)),
  idx = (p/100) * (n-1). É a MESMA convenção declarada pelo código de produção;
  a escolha do método é auditada como decisão interna, não como consenso.
- IQR: P75 - P25 com o mesmo método de percentil.
- MAD: mediana dos desvios absolutos em torno da mediana (crua, sem escala).
- CV: DP amostral / média; indefinido se média = 0 ou n < 2.
- z robusto: direction * (x - mediana_baseline) / (1.4826 * MAD_baseline).
  A constante 1.4826 ≈ 1/Φ⁻¹(3/4) torna o MAD consistente com o desvio padrão
  sob normalidade (Rousseeuw & Croux, 1993, JASA 88(424), 1273–1283).
"""

from __future__ import annotations

import math
from typing import Optional, Sequence

MAD_SCALE = 1.4826


def median(values: Sequence[float]) -> Optional[float]:
    n = len(values)
    if n == 0:
        return None
    s = sorted(values)
    mid = n // 2
    if n % 2 == 1:
        return float(s[mid])
    return (s[mid - 1] + s[mid]) / 2.0


def mean(values: Sequence[float]) -> Optional[float]:
    if not values:
        return None
    return sum(values) / len(values)


def sample_sd(values: Sequence[float]) -> Optional[float]:
    n = len(values)
    if n < 2:
        return None
    m = mean(values)
    assert m is not None
    var = sum((v - m) ** 2 for v in values) / (n - 1)
    return math.sqrt(var)


def percentile_r7(values: Sequence[float], p: float) -> Optional[float]:
    n = len(values)
    if n == 0:
        return None
    s = sorted(values)
    idx = (p / 100.0) * (n - 1)
    lo = math.floor(idx)
    hi = math.ceil(idx)
    if lo == hi:
        return float(s[int(idx)])
    return s[lo] + (s[hi] - s[lo]) * (idx - lo)


def iqr(values: Sequence[float]) -> Optional[float]:
    p25 = percentile_r7(values, 25)
    p75 = percentile_r7(values, 75)
    if p25 is None or p75 is None:
        return None
    return p75 - p25


def mad(values: Sequence[float], center: Optional[float] = None) -> Optional[float]:
    if not values:
        return None
    c = center if center is not None else median(values)
    assert c is not None
    return median([abs(v - c) for v in values])


def coefficient_of_variation(values: Sequence[float]) -> Optional[float]:
    m = mean(values)
    sd = sample_sd(values)
    if m is None or sd is None or m == 0:
        return None
    return sd / m


def robust_z(value: float, baseline_median: Optional[float],
             baseline_mad: Optional[float], direction: int) -> Optional[float]:
    """z robusto com inversão de direção.

    direction = +1: valor maior é melhor (z>0 ⇒ melhor).
    direction = -1: valor menor é melhor (z>0 ⇒ melhor).
    MAD = 0 ou baseline ausente ⇒ indefinido (None), nunca 0.
    """
    if baseline_median is None or baseline_mad is None or baseline_mad == 0:
        return None
    scaled = MAD_SCALE * baseline_mad
    return direction * (value - baseline_median) / scaled
