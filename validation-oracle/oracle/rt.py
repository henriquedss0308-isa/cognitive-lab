"""Limpeza de RT e métricas de acurácia — implementação independente.

Regras auditadas (declaradas na especificação do projeto e nos protocolos):

Um trial contribui com RT válido quando, nesta ordem de precedência:
  1. não foi marcado inválido na gravação (anticipation/omission/lapse/unfocused);
  2. foi correto;
  3. tem RT não nulo;
  4. estava com janela focada e visível;
  5. RT >= limiar de antecipação do protocolo;
  6. RT <= limiar de lapso do protocolo.

Taxas:
  anticipationRate = antecipações / total de trials
  lapseRate        = lapsos / total de trials

Acurácia:
  omissão  = trial que EXIGE resposta (expected != none/'') e não recebeu
             resposta válida (actual em {'', 'none'})
  erros    = total - corretos - omissões
  accuracy = corretos / total
"""

from __future__ import annotations

from typing import Optional, Sequence

from .stats import (coefficient_of_variation, iqr, mean, median,
                    percentile_r7, sample_sd)

NO_RESPONSE = ("", "none")


def requires_response(expected: str) -> bool:
    return expected not in ("", "none", "nogo", "no_go")


def classify_rt(trial: dict, anticipation_ms: float, lapse_ms: float) -> str:
    """Retorna o status do RT de um trial, segundo as regras acima."""
    reason = trial.get("invalidReason")
    if reason == "anticipation":
        return "anticipation"
    if reason == "omission":
        return "no_response"
    if reason == "lapse":
        return "lapse"
    if reason == "unfocused":
        return "unfocused"
    if not trial["correct"]:
        return "incorrect"
    rt = trial.get("reactionTimeMs")
    if rt is None:
        return "no_response"
    if not trial.get("windowFocused", True) or trial.get("visibilityState") == "hidden":
        return "unfocused"
    if rt < anticipation_ms:
        return "anticipation"
    if rt > lapse_ms:
        return "lapse"
    return "valid"


def rt_metrics(trials: Sequence[dict], anticipation_ms: float,
               lapse_ms: float) -> dict:
    statuses = [classify_rt(t, anticipation_ms, lapse_ms) for t in trials]
    valid_rts = [float(t["reactionTimeMs"]) for t, s in zip(trials, statuses)
                 if s == "valid"]
    total = len(trials)
    anticipations = statuses.count("anticipation")
    lapses = statuses.count("lapse")

    return {
        "medianCorrectRT": median(valid_rts),
        "meanCorrectRT": mean(valid_rts),
        "rtStandardDeviation": sample_sd(valid_rts),
        "rtIQR": iqr(valid_rts),
        "rtCoefficientOfVariation": coefficient_of_variation(valid_rts),
        "p10RT": percentile_r7(valid_rts, 10),
        "p90RT": percentile_r7(valid_rts, 90),
        "anticipationRate": anticipations / total if total else 0.0,
        "lapseRate": lapses / total if total else 0.0,
        "validTrialCount": len(valid_rts),
        "validRTs": valid_rts,
    }


def is_omission(trial: dict) -> bool:
    if not requires_response(trial["expectedResponse"]):
        return False
    return trial["actualResponse"] in NO_RESPONSE


def accuracy_metrics(trials: Sequence[dict]) -> dict:
    total = len(trials)
    correct = sum(1 for t in trials if t["correct"])
    omissions = sum(1 for t in trials if is_omission(t))
    errors = total - correct - omissions
    return {
        "accuracy": correct / total if total else 0.0,
        "correctCount": correct,
        "errorCount": errors,
        "omissionCount": omissions,
        "totalTrials": total,
    }


def condition_subset(trials: Sequence[dict], condition: str) -> list:
    return [t for t in trials if t["condition"] == condition]


def post_error_slowing(trials: Sequence[dict]) -> Optional[float]:
    """PES = mediana(RT corretos pós-erro) - mediana(RT corretos pós-acerto).

    Réplica da regra declarada: só RTs corretos, >= 150 ms (limiar fixo do
    código de produção — ver achado sobre limiar fixo), o trial anterior
    define o grupo.
    """
    after_error: list = []
    after_correct: list = []
    for prev, curr in zip(trials, list(trials)[1:]):
        rt = curr.get("reactionTimeMs")
        if not curr["correct"] or rt is None or rt < 150:
            continue
        (after_error if not prev["correct"] else after_correct).append(float(rt))
    me = median(after_error)
    mc = median(after_correct)
    if me is None or mc is None:
        return None
    return me - mc
