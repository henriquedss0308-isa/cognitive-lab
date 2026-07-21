"""Fábricas de backups sintéticos; nenhum valor vem de dados reais."""

from __future__ import annotations

from copy import deepcopy
from typing import Any


PROTOCOL = "corsi.forward.v1.0"
LEGACY = "sdt-hautus-1"
CURRENT = "sdt-hautus-1;corsi-replay-1"


def trial(index: int, span: int, expected: str, actual: str) -> dict[str, Any]:
    return {
        "trialId": f"synthetic-trial-{index}",
        "sessionId": "synthetic-session",
        "testId": "corsi",
        "protocolVersion": PROTOCOL,
        "mode": "assessment",
        "blockIndex": 0,
        "trialIndex": index,
        "condition": "forward",
        "stimulus": expected,
        "expectedResponse": expected,
        "actualResponse": actual,
        "correct": expected == actual,
        "reactionTimeMs": 1000,
        "stimulusOnsetTimestamp": index * 2000,
        "responseTimestamp": index * 2000 + 1000,
        "windowFocused": True,
        "visibilityState": "visible",
        "deviceType": "desktop",
        "inputMethod": "mouse",
        "metadata": {"span": span},
    }


def multi_span_trials() -> list[dict[str, Any]]:
    return [
        trial(0, 2, "1,2", "1,2"),
        trial(1, 2, "3,4", "3,4"),
        trial(2, 3, "1,2,3", "1,2,3"),
        trial(3, 3, "4,5,6", "4,5,6"),
        trial(4, 4, "1,2,3,4", "1,2,3,4"),
        trial(5, 4, "5,6,7,8", "9,9,9,9"),
        trial(6, 4, "1,3,5,7", "9,9,9,9"),
    ]


def two_correct_trials() -> list[dict[str, Any]]:
    return [trial(0, 2, "1,2", "1,2"), trial(1, 2, "3,4", "3,4")]


LEGACY_MULTI = {
    "confirmedSpan": 3,
    "maxSpan": 4,
    "totalCorrectSequences": 5,
    "partialScore": 14,
    "partialScoreRate": 14 / 22,
}
CURRENT_MULTI = {**LEGACY_MULTI, "confirmedSpan": 4}
LEGACY_TWO_CORRECT = {
    "confirmedSpan": 2,
    "maxSpan": 2,
    "totalCorrectSequences": 2,
    "partialScore": 4,
    "partialScoreRate": 1.0,
}
CURRENT_TWO_CORRECT = {**LEGACY_TWO_CORRECT, "maxSpan": 3}


def session(
    session_id: str,
    day: int,
    cohort: str = "current",
    *,
    quality: str = "valid",
    is_demo: bool = False,
    protocol: str = PROTOCOL,
    trials: list[dict[str, Any]] | None = None,
    scoring_version: str | None = "default",
    metrics: dict[str, Any] | None = None,
    insufficient_practice: bool = False,
    context_status: str | None = None,
) -> dict[str, Any]:
    trial_rows = deepcopy(trials if trials is not None else multi_span_trials())
    for row in trial_rows:
        row["sessionId"] = session_id
        row["protocolVersion"] = protocol

    if metrics is None:
        metrics = deepcopy(LEGACY_MULTI if cohort == "legacy" else CURRENT_MULTI)
    if scoring_version == "default":
        scoring_version = LEGACY if cohort == "legacy" else CURRENT

    result: dict[str, Any] = {
        "sessionId": session_id,
        "testId": "corsi",
        "protocolVersion": protocol,
        "mode": "assessment",
        "startedAt": f"2026-07-{day:02d}T12:00:00.000Z",
        "completedAt": f"2026-07-{day:02d}T12:05:00.000Z",
        "quality": quality,
        "flags": {},
        "flagMessages": [],
        "rtMetrics": {"medianCorrectRT": 1000},
        "accuracyMetrics": {"accuracy": 0.7},
        "conditionMetrics": {},
        "blockMetrics": [],
        "customMetrics": deepcopy(metrics),
        "deviceInfo": {},
        "isDemo": is_demo,
    }
    if scoring_version is not None:
        result["scoringVersion"] = scoring_version

    record: dict[str, Any] = {
        "sessionId": session_id,
        "testId": "corsi",
        "protocolVersion": protocol,
        "mode": "assessment",
        "status": "completed",
        "startedAt": f"2026-07-{day:02d}T12:00:00.000Z",
        "completedAt": f"2026-07-{day:02d}T12:05:00.000Z",
        "quality": quality,
        "flags": {"insufficientPractice": insufficient_practice} if insufficient_practice else {},
        "flagMessages": [],
        "result": result,
        "trials": trial_rows,
        "deviceInfo": {},
        "isDemo": is_demo,
        "practiceCompleted": not insufficient_practice,
        "randomizationSeed": 1,
    }
    if context_status is not None:
        record["checkIn"] = {
            "medications": {"lisdexamfetamine": {"status": context_status, "dose": "synthetic"}},
            "notes": "synthetic private note that must never be reported",
        }
    return record


def backup(sessions: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "version": "1.0.0",
        "exportedAt": "2026-07-21T12:00:00.000Z",
        "sessions": deepcopy(sessions),
        "settings": {"theme": "dark", "relationshipLabel": "synthetic private name"},
    }


def no_corsi() -> dict[str, Any]:
    return backup([{"sessionId": "synthetic-other", "testId": "simple_rt"}])


def only_legacy() -> dict[str, Any]:
    return backup([session("synthetic-legacy-01", 1, "legacy")])


def only_current() -> dict[str, Any]:
    return backup([session("synthetic-current-01", 1, "current")])


def legacy_current_outside_frozen_window() -> dict[str, Any]:
    rows = [session(f"synthetic-legacy-{i:02d}", i, "legacy") for i in range(1, 12)]
    rows.append(session("synthetic-current-12", 12, "current"))
    return backup(rows)


def legacy_current_inside_frozen_window() -> dict[str, Any]:
    rows = [session(f"synthetic-familiarization-{i:02d}", i, "legacy") for i in range(1, 4)]
    rows.extend(session(f"synthetic-legacy-window-{i:02d}", i, "legacy") for i in range(4, 8))
    rows.extend(session(f"synthetic-current-window-{i:02d}", i, "current") for i in range(8, 12))
    return backup(rows)


def missing_scoring_version() -> dict[str, Any]:
    return backup([session("synthetic-missing-version", 1, scoring_version=None)])


def incomplete_trials() -> dict[str, Any]:
    row = session("synthetic-incomplete", 1)
    del row["trials"][0]["actualResponse"]
    return backup([row])


def malformed_session() -> dict[str, Any]:
    row = session("synthetic-malformed", 1)
    row["quality"] = "not-a-quality"
    return backup([row])


def persisted_divergent() -> dict[str, Any]:
    wrong = deepcopy(CURRENT_MULTI)
    wrong["confirmedSpan"] = 99
    wrong["maxSpan"] = 98
    return backup([session("synthetic-divergent", 1, metrics=wrong)])
