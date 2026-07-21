"""Replay independente das regras adaptativas do Corsi.

Regras declaradas (instruções do teste + spec §13):
- começa em span 2; sobe 1 após 2 acertos consecutivos NO MESMO span (máx. 9);
- termina após 2 erros seguidos (sem acerto entre eles) no mesmo span;
- confirmedSpan = maior span com >= 1 sequência correta;
- maxSpanReached = maior span APRESENTÁVEL alcançado (inclui o span para o
  qual se avançou, mesmo que nunca acertado — semântica auditada como achado);
- pontuação parcial = soma do prefixo correto de cada tentativa
  (acerto integral conta o comprimento inteiro);
- correção de uma tentativa: resposta com o MESMO comprimento e prefixo
  integral igual à sequência esperada.
"""

from __future__ import annotations

from typing import Sequence

START_SPAN = 2
MAX_SPAN = 9
CORRECT_TO_ADVANCE = 2
ERRORS_TO_END = 2


def parse_seq(text: str) -> list:
    if not text or text == "none":
        return []
    out = []
    for part in text.split(","):
        part = part.strip()
        try:
            out.append(int(part))
        except ValueError:
            continue
    return out


def longest_correct_prefix(expected: Sequence[int], actual: Sequence[int]) -> int:
    n = 0
    for e, a in zip(expected, actual):
        if e != a:
            break
        n += 1
    return n


def replay(trials: Sequence[dict], mode: str = "assessment",
           practice_limit: int = 30) -> dict:
    """trials: [{trialIndex, expectedResponse, actualResponse}] em qualquer ordem."""
    ordered = sorted(trials, key=lambda t: t["trialIndex"])
    span = START_SPAN
    consecutive_correct = 0
    errors_at_span = 0
    trial_count = 0
    max_span_reached = START_SPAN
    confirmed_span = 0
    total_correct_sequences = 0
    total_correct_positions = 0
    total_items = 0
    ended = False

    for t in ordered:
        if ended:
            break
        expected = parse_seq(t["expectedResponse"])
        actual = parse_seq(t["actualResponse"])
        prefix = longest_correct_prefix(expected, actual)
        correct = (len(expected) > 0 and len(actual) == len(expected)
                   and prefix == len(expected))
        total_items += len(expected)
        trial_count += 1

        if correct:
            total_correct_sequences += 1
            total_correct_positions += len(expected)
            consecutive_correct += 1
            errors_at_span = 0
            confirmed_span = max(confirmed_span, span)
            if mode == "assessment" and consecutive_correct >= CORRECT_TO_ADVANCE:
                span = min(span + 1, MAX_SPAN)
                max_span_reached = max(max_span_reached, span)
                consecutive_correct = 0
        else:
            consecutive_correct = 0
            errors_at_span += 1
            total_correct_positions += prefix
            if mode == "assessment" and errors_at_span >= ERRORS_TO_END:
                ended = True

        if mode == "training" and trial_count >= practice_limit:
            ended = True

    return {
        "maxSpan": max_span_reached,
        "confirmedSpan": confirmed_span,
        "totalCorrectSequences": total_correct_sequences,
        "partialScore": total_correct_positions,
        "partialScoreRate": (total_correct_positions / total_items)
                            if total_items > 0 else None,
        "totalItems": total_items,
    }
