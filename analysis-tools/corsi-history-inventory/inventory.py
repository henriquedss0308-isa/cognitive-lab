#!/usr/bin/env python3
"""Inventário Corsi local, auditável, somente leitura e sem dependências externas."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


TOOL_VERSION = "1.0.0"
REPORT_SCHEMA_VERSION = "1.0.0"
SUPPORTED_BACKUP_VERSION = "1.0.0"
CORSI_TEST_ID = "corsi"
CORSI_PROTOCOL_VERSION = "corsi.forward.v1.0"
LEGACY_SCORING_VERSION = "sdt-hautus-1"
CURRENT_SCORING_VERSION = "sdt-hautus-1;corsi-replay-1"
CURRENT_SCORING_TOKEN = "corsi-replay-1"
HISTORICAL_BOUNDARY_COMMIT = "478a8fb6e5e5e407160ae29622397733ee43047c"
PRIMARY_METRIC = "confirmedSpan"
ESSENTIAL_METRICS = (
    "confirmedSpan",
    "maxSpan",
    "totalCorrectSequences",
    "partialScore",
    "partialScoreRate",
)
FAMILIARIZATION_SESSIONS = 3
BASELINE_SESSIONS = 8
CONTEXTUAL_REFERENCE_SESSIONS = 8
MIN_BASELINE_N = 6
START_SPAN = 2
MAX_SPAN = 9
ERRORS_TO_END = 2
CORRECT_TO_ADVANCE = 2
VALID_MODES = {"assessment", "training"}
VALID_QUALITIES = {"valid", "valid_with_warnings", "invalid"}
VALID_STATUSES = {"in_progress", "completed", "abandoned", "interrupted"}
REPO_ROOT = Path(__file__).resolve().parents[2]


class InventoryError(Exception):
    """Falha esperada, segura e adequada para exibição ao usuário."""


class DuplicateKeyError(InventoryError):
    pass


def _reject_constant(value: str) -> None:
    raise InventoryError(f"JSON contém constante numérica não finita: {value}")


def _strict_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    obj: dict[str, Any] = {}
    for key, value in pairs:
        if key in obj:
            raise DuplicateKeyError("JSON contém chave duplicada; análise recusada com segurança")
        obj[key] = value
    return obj


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pseudonymize(session_id: str) -> str:
    return hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:12]


def _unavailable_pseudonym(index: int) -> str:
    token = f"missing-session-id:{index}".encode("ascii")
    return hashlib.sha256(token).hexdigest()[:12]


def _timestamp(value: Any) -> float | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
        return datetime.fromisoformat(normalized).timestamp()
    except (ValueError, OverflowError, OSError):
        return None


def _date_only(value: Any) -> str | None:
    if _timestamp(value) is None:
        return None
    if isinstance(value, str) and re.match(r"^\d{4}-\d{2}-\d{2}", value):
        return value[:10]
    return None


def load_backup(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            value = json.load(
                stream,
                object_pairs_hook=_strict_object,
                parse_constant=_reject_constant,
            )
    except UnicodeDecodeError as exc:
        raise InventoryError("backup não está codificado como UTF-8") from exc
    except json.JSONDecodeError as exc:
        raise InventoryError(f"JSON inválido na linha {exc.lineno}, coluna {exc.colno}") from exc

    if not isinstance(value, dict):
        raise InventoryError("schema desconhecido: o backup oficial deve ser um objeto JSON")
    if value.get("version") != SUPPORTED_BACKUP_VERSION:
        raise InventoryError(
            f"schema desconhecido: somente backup version {SUPPORTED_BACKUP_VERSION} é suportado"
        )
    if not isinstance(value.get("sessions"), list):
        raise InventoryError("schema desconhecido: sessions deve ser uma lista")
    if "settings" not in value or not isinstance(value["settings"], dict):
        raise InventoryError("schema desconhecido: settings deve ser um objeto")
    return value


def _path_key(path: Path) -> str:
    return os.path.normcase(str(path.resolve(strict=False)))


def _same_path(left: Path, right: Path) -> bool:
    if _path_key(left) == _path_key(right):
        return True
    if left.exists() and right.exists():
        try:
            return os.path.samefile(left, right)
        except OSError:
            return False
    return False


def _is_within(path: Path, parent: Path) -> bool:
    try:
        common = os.path.commonpath([_path_key(path), _path_key(parent)])
    except ValueError:
        return False
    return common == _path_key(parent)


def default_output_path(input_path: Path) -> Path:
    return input_path.with_name(f"{input_path.stem}.corsi-inventory-report.json")


def validate_paths(input_path: Path, output_path: Path, repo_root: Path = REPO_ROOT) -> None:
    if not input_path.is_absolute():
        raise InventoryError("--input deve ser um caminho absoluto")
    if not input_path.exists() or not input_path.is_file():
        raise InventoryError("--input não existe ou não é um arquivo")
    if not output_path.is_absolute():
        raise InventoryError("--output deve ser um caminho absoluto")
    if _same_path(input_path, output_path):
        raise InventoryError("saída recusada: output não pode ser igual ao input")
    if _is_within(output_path, repo_root):
        raise InventoryError("saída recusada: o relatório não pode ficar dentro do repositório")
    if output_path.exists():
        raise InventoryError("saída recusada: o arquivo de relatório já existe")
    if not output_path.parent.exists() or not output_path.parent.is_dir():
        raise InventoryError("saída recusada: a pasta de destino não existe")


def _session_shape(raw: Any, index: int, duplicate_id: bool) -> dict[str, Any] | None:
    if not isinstance(raw, dict) or raw.get("testId") != CORSI_TEST_ID:
        return None

    errors: list[str] = []
    session_id = raw.get("sessionId")
    if not isinstance(session_id, str) or not session_id:
        errors.append("sessionId")
        pseudo = _unavailable_pseudonym(index)
    else:
        pseudo = pseudonymize(session_id)
    if duplicate_id:
        errors.append("sessionId (duplicado)")

    protocol = raw.get("protocolVersion")
    if not isinstance(protocol, str) or not protocol:
        errors.append("protocolVersion")
        protocol = None

    mode = raw.get("mode")
    if mode not in VALID_MODES:
        errors.append("mode")

    quality = raw.get("quality")
    if quality not in VALID_QUALITIES:
        errors.append("quality")

    status = raw.get("status")
    if status is not None and status not in VALID_STATUSES:
        errors.append("status")

    timestamp = _timestamp(raw.get("startedAt"))
    if timestamp is None:
        errors.append("startedAt")

    completed_at = raw.get("completedAt")
    if completed_at is not None and _timestamp(completed_at) is None:
        errors.append("completedAt")

    trials = raw.get("trials")
    if not isinstance(trials, list):
        errors.append("trials")

    if not isinstance(raw.get("flags"), dict):
        errors.append("flags")
    if not isinstance(raw.get("isDemo"), bool):
        errors.append("isDemo")

    result = raw.get("result")
    if result is not None and not isinstance(result, dict):
        errors.append("result")

    scoring_value: str | None = None
    if isinstance(result, dict) and "scoringVersion" in result:
        candidate = result.get("scoringVersion")
        if candidate is None:
            scoring_value = None
        elif isinstance(candidate, str) and candidate:
            scoring_value = candidate
        else:
            errors.append("result.scoringVersion")

    if errors:
        classification = "malformed"
    elif scoring_value is None:
        classification = "missing_scoring_version"
    elif scoring_value == LEGACY_SCORING_VERSION:
        classification = "legacy"
    elif CURRENT_SCORING_TOKEN in scoring_value.split(";"):
        classification = "current"
    else:
        classification = "unknown"

    return {
        "raw": raw,
        "sourceIndex": index,
        "pseudonymousId": pseudo,
        "sessionId": session_id if isinstance(session_id, str) and session_id else None,
        "timestamp": timestamp,
        "date": _date_only(raw.get("startedAt")),
        "protocolVersion": protocol,
        "mode": mode if mode in VALID_MODES else None,
        "quality": quality if quality in VALID_QUALITIES else None,
        "scoringVersion": scoring_value,
        "classification": classification,
        "structuralErrors": errors,
        "familiarizationStatus": "ineligible",
        "chronologicalOrder": None,
    }


def _parse_js_integer_prefix(value: str) -> int | None:
    match = re.match(r"^\s*([+-]?\d+)", value)
    return int(match.group(1)) if match else None


def parse_click_sequence(response: str) -> list[int]:
    if not response or response == "none":
        return []
    parsed: list[int] = []
    for part in response.split(","):
        value = _parse_js_integer_prefix(part)
        if value is not None:
            parsed.append(value)
    return parsed


def longest_correct_prefix(expected: Sequence[int], actual: Sequence[int]) -> int:
    count = 0
    for expected_value, actual_value in zip(expected, actual):
        if expected_value != actual_value:
            break
        count += 1
    return count


def rescore_completeness(meta: Mapping[str, Any]) -> tuple[list[str], list[str]]:
    raw = meta["raw"]
    missing: list[str] = []
    notes: list[str] = []
    trials = raw.get("trials")
    if not isinstance(trials, list):
        return ["trials"], notes
    if not trials:
        return ["trials (empty)"], notes

    seen_indices: set[int] = set()
    for trial in trials:
        if not isinstance(trial, dict):
            missing.append("trials[] (object)")
            continue
        trial_index = trial.get("trialIndex")
        if not isinstance(trial_index, int) or isinstance(trial_index, bool) or trial_index < 0:
            missing.append("trials[].trialIndex")
        elif trial_index in seen_indices:
            missing.append("trials[].trialIndex (duplicate)")
        else:
            seen_indices.add(trial_index)
        if not isinstance(trial.get("expectedResponse"), str):
            missing.append("trials[].expectedResponse")
        if not isinstance(trial.get("actualResponse"), str):
            missing.append("trials[].actualResponse")
        if not isinstance(trial.get("correct"), bool):
            missing.append("trials[].correct")
        metadata = trial.get("metadata")
        if metadata is None or (isinstance(metadata, dict) and "span" not in metadata):
            notes.append("metadata.span missing; legacy scorer fallback START_SPAN=2 applies")
        elif not isinstance(metadata, dict):
            missing.append("trials[].metadata")
        else:
            span = metadata.get("span")
            if not isinstance(span, int) or isinstance(span, bool) or not START_SPAN <= span <= MAX_SPAN:
                missing.append("trials[].metadata.span")

    return sorted(set(missing)), sorted(set(notes))


def score_legacy(trials: Sequence[Mapping[str, Any]], mode: str) -> dict[str, int | float | None]:
    max_span = START_SPAN
    confirmed_span = START_SPAN - 1
    total_correct_sequences = 0
    partial_score = 0
    trials_by_span: dict[int, list[Mapping[str, Any]]] = defaultdict(list)

    for trial in trials:
        metadata = trial.get("metadata")
        span = metadata.get("span", START_SPAN) if isinstance(metadata, dict) else START_SPAN
        max_span = max(max_span, span)
        trials_by_span[span].append(trial)

    consecutive_correct = 0
    for span in sorted(trials_by_span):
        errors_at_span = 0
        passed_span = False
        for trial in trials_by_span[span]:
            expected = parse_click_sequence(trial["expectedResponse"])
            actual = parse_click_sequence(trial["actualResponse"])
            prefix = longest_correct_prefix(expected, actual)
            partial_score += prefix
            if trial["correct"] and len(expected) == len(actual) and prefix == len(expected):
                total_correct_sequences += 1
                consecutive_correct += 1
                if consecutive_correct >= CORRECT_TO_ADVANCE:
                    confirmed_span = span
                    passed_span = True
            else:
                consecutive_correct = 0
                errors_at_span += 1
        if errors_at_span >= ERRORS_TO_END and mode == "assessment":
            break
        if passed_span and span < MAX_SPAN:
            consecutive_correct = 0

    if total_correct_sequences == 0 and trials:
        confirmed_span = START_SPAN - 1

    total_items = sum(len(parse_click_sequence(trial["expectedResponse"])) for trial in trials)
    return {
        "confirmedSpan": confirmed_span,
        "maxSpan": max_span,
        "totalCorrectSequences": total_correct_sequences,
        "partialScore": partial_score,
        "partialScoreRate": partial_score / total_items if total_items > 0 else None,
    }


def score_current(trials: Sequence[Mapping[str, Any]], mode: str) -> dict[str, int | float | None]:
    state: dict[str, Any] = {
        "currentSpan": START_SPAN,
        "consecutiveCorrect": 0,
        "errorsAtSpan": 0,
        "trialCount": 0,
        "maxSpanReached": START_SPAN,
        "confirmedSpan": 0,
        "totalCorrectSequences": 0,
        "totalCorrectPositions": 0,
        "ended": False,
    }
    total_items = 0
    practice_limit = 30 if mode == "assessment" else 2

    ordered = sorted(enumerate(trials), key=lambda pair: (pair[1]["trialIndex"], pair[0]))
    for _, trial in ordered:
        if state["ended"]:
            break
        expected = parse_click_sequence(trial["expectedResponse"])
        actual = parse_click_sequence(trial["actualResponse"])
        prefix = longest_correct_prefix(expected, actual)
        correct = bool(expected) and len(actual) == len(expected) and prefix == len(expected)
        total_items += len(expected)
        state["trialCount"] += 1
        if correct:
            state["totalCorrectSequences"] += 1
            state["totalCorrectPositions"] += len(expected)
            state["consecutiveCorrect"] += 1
            state["errorsAtSpan"] = 0
            state["confirmedSpan"] = max(state["confirmedSpan"], state["currentSpan"])
            if mode == "assessment" and state["consecutiveCorrect"] >= CORRECT_TO_ADVANCE:
                state["currentSpan"] = min(state["currentSpan"] + 1, MAX_SPAN)
                state["maxSpanReached"] = max(state["maxSpanReached"], state["currentSpan"])
                state["consecutiveCorrect"] = 0
        else:
            state["consecutiveCorrect"] = 0
            state["errorsAtSpan"] += 1
            state["totalCorrectPositions"] += prefix
            if mode == "assessment" and state["errorsAtSpan"] >= ERRORS_TO_END:
                state["ended"] = True
        if mode == "training" and state["trialCount"] >= practice_limit:
            state["ended"] = True

    return {
        "confirmedSpan": state["confirmedSpan"],
        "maxSpan": state["maxSpanReached"],
        "totalCorrectSequences": state["totalCorrectSequences"],
        "partialScore": state["totalCorrectPositions"],
        "partialScoreRate": state["totalCorrectPositions"] / total_items if total_items > 0 else None,
    }


def _persisted_metrics(raw: Mapping[str, Any]) -> dict[str, int | float | None]:
    result = raw.get("result")
    custom = result.get("customMetrics") if isinstance(result, dict) else None
    if not isinstance(custom, dict):
        return {key: None for key in ESSENTIAL_METRICS}
    return {key: custom.get(key) if is_number(custom.get(key)) else None for key in ESSENTIAL_METRICS}


def _different(left: Any, right: Any) -> bool:
    if not is_number(left) or not is_number(right):
        return False
    return not math.isclose(float(left), float(right), rel_tol=1e-12, abs_tol=1e-12)


def _delta(left: Any, right: Any) -> float | int | None:
    if not is_number(left) or not is_number(right):
        return None
    value = left - right
    return int(value) if isinstance(left, int) and isinstance(right, int) else value


def build_rescore(meta: Mapping[str, Any]) -> dict[str, Any]:
    missing, notes = rescore_completeness(meta)
    persisted = _persisted_metrics(meta["raw"])
    if missing or meta["classification"] == "malformed":
        return {
            "complete": False,
            "missingFields": sorted(set(missing + list(meta["structuralErrors"]))),
            "notes": notes,
            "deterministic": False,
            "persisted": persisted,
            "legacy": None,
            "current": None,
            "deltas": None,
            "persistedVsCurrentDivergent": False,
            "legacyVsCurrentDivergent": False,
        }

    trials = meta["raw"]["trials"]
    mode = meta["raw"]["mode"]
    legacy = score_legacy(trials, mode)
    current = score_current(trials, mode)
    persisted_vs_current = [
        key for key in ESSENTIAL_METRICS if _different(persisted[key], current[key])
    ]
    legacy_vs_current = [key for key in ESSENTIAL_METRICS if _different(legacy[key], current[key])]
    return {
        "complete": True,
        "missingFields": [],
        "notes": notes,
        "deterministic": True,
        "persisted": persisted,
        "legacy": legacy,
        "current": current,
        "deltas": {
            "currentMinusLegacy": {key: _delta(current[key], legacy[key]) for key in ESSENTIAL_METRICS},
            "persistedMinusLegacy": {key: _delta(persisted[key], legacy[key]) for key in ESSENTIAL_METRICS},
            "persistedMinusCurrent": {key: _delta(persisted[key], current[key]) for key in ESSENTIAL_METRICS},
        },
        "persistedVsCurrentDifferentFields": persisted_vs_current,
        "legacyVsCurrentDifferentFields": legacy_vs_current,
        "persistedVsCurrentDivergent": bool(persisted_vs_current),
        "legacyVsCurrentDivergent": bool(legacy_vs_current),
    }


def _has_result(meta: Mapping[str, Any]) -> bool:
    return isinstance(meta["raw"].get("result"), dict)


def _is_baseline_eligible(meta: Mapping[str, Any]) -> bool:
    if meta["classification"] == "malformed":
        return False
    raw = meta["raw"]
    flags = raw.get("flags")
    return bool(
        raw.get("mode") == "assessment"
        and raw.get("quality") != "invalid"
        and raw.get("isDemo") is False
        and (not raw.get("status") or raw.get("status") == "completed")
        and raw.get("completedAt")
        and _has_result(meta)
        and isinstance(flags, dict)
        and not flags.get("insufficientPractice")
    )


def _ordered(metas: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(metas, key=lambda meta: (meta["timestamp"], meta["sourceIndex"]))


def _baseline_phase(valid_count: int) -> str:
    if valid_count < FAMILIARIZATION_SESSIONS:
        return "familiarization"
    if valid_count < FAMILIARIZATION_SESSIONS + BASELINE_SESSIONS:
        return "baseline_building"
    return "monitoring"


def _eligible_for_protocol(metas: Iterable[dict[str, Any]], protocol: str) -> list[dict[str, Any]]:
    return _ordered(
        meta for meta in metas if meta["protocolVersion"] == protocol and _is_baseline_eligible(meta)
    )


def _contextual_eligible_for_protocol(
    metas: Iterable[dict[str, Any]], protocol: str
) -> list[dict[str, Any]]:
    eligible = [
        meta for meta in metas if meta["protocolVersion"] == protocol and _is_baseline_eligible(meta)
    ]
    return sorted(
        eligible,
        key=lambda meta: (meta["timestamp"], meta.get("sessionId") or ""),
    )


def _general_window(eligible: Sequence[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    phase = _baseline_phase(len(eligible))
    if phase == "monitoring":
        window = list(eligible[FAMILIARIZATION_SESSIONS:FAMILIARIZATION_SESSIONS + BASELINE_SESSIONS])
    else:
        window = list(eligible[FAMILIARIZATION_SESSIONS:])
    return phase, window


def _metric_value(meta: Mapping[str, Any], key: str = PRIMARY_METRIC) -> int | float | None:
    return _persisted_metrics(meta["raw"]).get(key)


def _rule_counts(metas: Iterable[Mapping[str, Any]], require_metric: bool = False) -> Counter[str]:
    return Counter(
        meta["classification"]
        for meta in metas
        if (not require_metric or is_number(_metric_value(meta)))
    )


def _contains_known_mix(metas: Iterable[Mapping[str, Any]], require_metric: bool = False) -> bool:
    counts = _rule_counts(metas, require_metric=require_metric)
    return counts["legacy"] > 0 and counts["current"] > 0


def _context_status(meta: Mapping[str, Any]) -> str:
    check_in = meta["raw"].get("checkIn")
    if not isinstance(check_in, dict):
        return "unknown"
    medications = check_in.get("medications")
    if not isinstance(medications, dict):
        return "unknown"
    record = medications.get("lisdexamfetamine")
    if not isinstance(record, dict):
        return "unknown"
    status = record.get("status")
    return status if status in {"taken", "not_taken", "unknown"} else "unknown"


def _selected_reference(
    all_metas: Sequence[dict[str, Any]], target: Mapping[str, Any]
) -> tuple[str, list[dict[str, Any]]]:
    session_id = target.get("sessionId")
    pool = [meta for meta in all_metas if meta.get("sessionId") != session_id]
    general_eligible = _eligible_for_protocol(pool, target["protocolVersion"])
    general_phase, general_window = _general_window(general_eligible)
    status = _context_status(target)
    if status in {"taken", "not_taken"}:
        contextual_eligible = _contextual_eligible_for_protocol(pool, target["protocolVersion"])
        candidates = [
            meta
            for meta in contextual_eligible[FAMILIARIZATION_SESSIONS:]
            if _context_status(meta) == status
        ]
        contextual_window = candidates[:CONTEXTUAL_REFERENCE_SESSIONS]
        if len(contextual_window) >= CONTEXTUAL_REFERENCE_SESSIONS:
            return "monitoring", contextual_window
    return general_phase, general_window


def build_baseline_analysis(metas: Sequence[dict[str, Any]]) -> dict[str, Any]:
    protocols = sorted({meta["protocolVersion"] for meta in metas if meta["protocolVersion"]})
    series: list[dict[str, Any]] = []
    any_window_mix = False
    any_primary_mix = False
    any_effective_mix = False

    for protocol in protocols:
        eligible = _eligible_for_protocol(metas, protocol)
        phase, window = _general_window(eligible)
        counts = _rule_counts(window)
        metric_counts = _rule_counts(window, require_metric=True)
        window_mix = counts["legacy"] > 0 and counts["current"] > 0
        primary_mix = metric_counts["legacy"] > 0 and metric_counts["current"] > 0
        primary_n = sum(metric_counts.values())
        effective_mix = phase == "monitoring" and primary_n >= MIN_BASELINE_N and primary_mix
        any_window_mix = any_window_mix or window_mix
        any_primary_mix = any_primary_mix or primary_mix
        any_effective_mix = any_effective_mix or effective_mix
        series.append(
            {
                "testId": CORSI_TEST_ID,
                "protocolVersion": protocol,
                "phase": phase,
                "eligibleSessionCount": len(eligible),
                "familiarizationSessionIds": [m["pseudonymousId"] for m in eligible[:FAMILIARIZATION_SESSIONS]],
                "windowSessionIds": [m["pseudonymousId"] for m in window],
                "windowSessionCount": len(window),
                "primaryMetric": PRIMARY_METRIC,
                "primaryMetricN": primary_n,
                "windowClassifications": dict(sorted(counts.items())),
                "windowContainsKnownRuleMix": window_mix,
                "primaryValuesContainKnownRuleMix": primary_mix,
                "effectiveForComparison": phase == "monitoring" and primary_n >= MIN_BASELINE_N,
            }
        )

        contextual_eligible = _contextual_eligible_for_protocol(metas, protocol)
        for status in ("taken", "not_taken"):
            contextual_window = [
                meta
                for meta in contextual_eligible[FAMILIARIZATION_SESSIONS:]
                if _context_status(meta) == status
            ][:CONTEXTUAL_REFERENCE_SESSIONS]
            contextual_metric_metas = [
                meta for meta in contextual_window if is_number(_metric_value(meta))
            ]
            contextual_window_mix = _contains_known_mix(contextual_window)
            contextual_primary_mix = _contains_known_mix(contextual_metric_metas)
            contextual_effective = bool(
                len(contextual_window) >= CONTEXTUAL_REFERENCE_SESSIONS
                and len(contextual_metric_metas) >= MIN_BASELINE_N
            )
            any_window_mix = any_window_mix or contextual_window_mix
            any_primary_mix = any_primary_mix or contextual_primary_mix
            any_effective_mix = any_effective_mix or (
                contextual_effective and contextual_primary_mix
            )

    comparisons: list[dict[str, Any]] = []
    for target in metas:
        if target["classification"] == "malformed" or not target["protocolVersion"] or not _has_result(target):
            continue
        phase, window = _selected_reference(metas, target)
        metric_metas = [meta for meta in window if is_number(_metric_value(meta))]
        primary_n = len(metric_metas)
        target_value = _metric_value(target)
        performed = bool(
            target["raw"].get("isDemo") is False
            and phase == "monitoring"
            and primary_n >= MIN_BASELINE_N
            and is_number(target_value)
        )
        known_mix = _contains_known_mix(metric_metas)
        incompatible_current = bool(
            performed
            and target["classification"] == "current"
            and any(meta["classification"] == "legacy" for meta in metric_metas)
        )
        any_effective_mix = any_effective_mix or (performed and known_mix)
        comparisons.append(
            {
                "sessionId": target["pseudonymousId"],
                "performed": performed,
                "primaryMetricN": primary_n,
                "referenceContainsKnownRuleMix": known_mix,
                "currentComparedWithLegacyValues": incompatible_current,
            }
        )

    incompatible_ids = [
        item["sessionId"] for item in comparisons if item["currentComparedWithLegacyValues"]
    ]
    return {
        "rules": {
            "testId": CORSI_TEST_ID,
            "familiarizationSessions": FAMILIARIZATION_SESSIONS,
            "frozenWindowSessions": BASELINE_SESSIONS,
            "minimumPrimaryMetricN": MIN_BASELINE_N,
            "eligibility": [
                "matching testId and protocolVersion",
                "mode assessment",
                "quality not invalid",
                "not demo",
                "status missing or completed",
                "completedAt present",
                "result present",
                "flags.insufficientPractice not true",
            ],
            "ordering": "startedAt ascending; stable input order on ties",
        },
        "series": series,
        "sessionComparisons": comparisons,
        "anyWindowContainsKnownRuleMix": any_window_mix,
        "anyPrimaryValuesContainKnownRuleMix": any_primary_mix,
        "anyEffectiveReferenceContainsKnownRuleMix": any_effective_mix,
        "incompatibleCurrentComparisonCount": len(incompatible_ids),
        "incompatibleCurrentSessionIds": incompatible_ids,
        "contextualWindowsEvaluatedPrivately": True,
        "privacyNote": "Contextual reference selection was reproduced, but medication data and labels are omitted.",
    }


def build_trend_analysis(metas: Sequence[dict[str, Any]]) -> dict[str, Any]:
    base = _ordered(
        meta
        for meta in metas
        if meta["classification"] != "malformed"
        and _has_result(meta)
        and meta["raw"].get("mode") == "assessment"
        and meta["raw"].get("isDemo") is False
    )
    valid = [meta for meta in base if meta["raw"].get("quality") != "invalid"]
    hidden_invalid = len(base) - len(valid)
    if not valid:
        return {
            "protocolVersion": None,
            "plottedSessionIds": [],
            "plottedSessionCount": 0,
            "hiddenInvalid": hidden_invalid,
            "hiddenOtherProtocolVersions": 0,
            "containsKnownRuleMix": False,
            "hasIndeterminateScoring": False,
        }

    current_protocol = valid[-1]["protocolVersion"]
    same_version = [meta for meta in valid if meta["protocolVersion"] == current_protocol]
    points = [meta for meta in same_version if is_number(_metric_value(meta))]
    plot_exists = len(points) >= 2
    classes = _rule_counts(points)
    return {
        "protocolVersion": current_protocol,
        "plottedSessionIds": [meta["pseudonymousId"] for meta in points],
        "plottedSessionCount": len(points),
        "hiddenInvalid": hidden_invalid,
        "hiddenOtherProtocolVersions": len(valid) - len(same_version),
        "containsKnownRuleMix": bool(
            plot_exists and classes["legacy"] > 0 and classes["current"] > 0
        ),
        "hasIndeterminateScoring": bool(
            plot_exists and (classes["missing_scoring_version"] > 0 or classes["unknown"] > 0)
        ),
        "classifications": dict(sorted(classes.items())),
    }


def _answer(value: str, explanation: str) -> dict[str, str]:
    return {"answer": value, "explanation": explanation}


def classify_report(
    counts: Counter[str],
    corsi_count: int,
    rescorable_count: int,
    rule_divergence_count: int,
    persisted_incomplete_count: int,
    baseline: Mapping[str, Any],
    trend: Mapping[str, Any],
) -> dict[str, str]:
    confirmed_mixing = bool(
        baseline["anyEffectiveReferenceContainsKnownRuleMix"]
        or baseline["incompatibleCurrentComparisonCount"] > 0
        or trend["containsKnownRuleMix"]
    )
    uncertainty = bool(
        counts["missing_scoring_version"]
        or counts["unknown"]
        or counts["malformed"]
        or (corsi_count > 0 and rescorable_count < corsi_count)
        or persisted_incomplete_count > 0
        or trend.get("hasIndeterminateScoring")
    )
    both_rules = counts["legacy"] > 0 and counts["current"] > 0

    if corsi_count == 0:
        return {
            "code": "NO_REAL_IMPACT_FOUND",
            "justification": "No Corsi sessions were found in the official backup envelope.",
        }
    if confirmed_mixing:
        reasons: list[str] = []
        if baseline["anyEffectiveReferenceContainsKnownRuleMix"]:
            reasons.append("an effective reference contains legacy and current primary values")
        if baseline["incompatibleCurrentComparisonCount"] > 0:
            reasons.append("a current session is compared with legacy reference values")
        if trend["containsKnownRuleMix"]:
            reasons.append("the plotted longitudinal series contains both rules")
        return {"code": "CONFIRMED_HISTORICAL_MIXING", "justification": "; ".join(reasons) + "."}
    if uncertainty:
        return {
            "code": "POTENTIAL_HISTORICAL_RISK",
            "justification": "Missing, unknown, malformed, or insufficient trial data prevents a safe complete determination.",
        }
    if both_rules and rule_divergence_count > 0:
        return {
            "code": "CONFIRMED_DIFFERENCE_WITHOUT_BASELINE_MIXING",
            "justification": "Both scoring cohorts exist and rescoring confirms a difference, but no effective baseline or plotted trend mixes them.",
        }
    return {
        "code": "NO_REAL_IMPACT_FOUND",
        "justification": "No effective baseline, comparison, or plotted longitudinal series mixes incompatible known rules.",
    }


def analyze_backup(backup: Mapping[str, Any]) -> dict[str, Any]:
    sessions = backup["sessions"]
    id_counts = Counter(
        raw.get("sessionId")
        for raw in sessions
        if isinstance(raw, dict) and isinstance(raw.get("sessionId"), str) and raw.get("sessionId")
    )
    metas: list[dict[str, Any]] = []
    for index, raw in enumerate(sessions):
        duplicate = bool(
            isinstance(raw, dict)
            and isinstance(raw.get("sessionId"), str)
            and id_counts[raw.get("sessionId")] > 1
        )
        meta = _session_shape(raw, index, duplicate)
        if meta is not None:
            metas.append(meta)

    chronological = sorted(
        (meta for meta in metas if meta["timestamp"] is not None),
        key=lambda meta: (meta["timestamp"], meta["sourceIndex"]),
    )
    for order, meta in enumerate(chronological, start=1):
        meta["chronologicalOrder"] = order

    protocols = {meta["protocolVersion"] for meta in metas if meta["protocolVersion"]}
    for protocol in protocols:
        eligible = _eligible_for_protocol(metas, protocol)
        for position, meta in enumerate(eligible):
            if position < FAMILIARIZATION_SESSIONS:
                meta["familiarizationStatus"] = "familiarization"
            elif position < FAMILIARIZATION_SESSIONS + BASELINE_SESSIONS:
                meta["familiarizationStatus"] = "frozen_baseline_window"
            else:
                meta["familiarizationStatus"] = "post_baseline"

    for meta in metas:
        meta["rescore"] = build_rescore(meta)

    counts = Counter(meta["classification"] for meta in metas)
    rescorable_count = sum(meta["rescore"]["deterministic"] for meta in metas)
    stored_divergence_count = sum(meta["rescore"]["persistedVsCurrentDivergent"] for meta in metas)
    rule_divergence_count = sum(meta["rescore"]["legacyVsCurrentDivergent"] for meta in metas)
    persisted_incomplete_count = sum(
        any(not is_number(value) for value in meta["rescore"]["persisted"].values())
        for meta in metas
    )
    baseline = build_baseline_analysis(metas)
    trend = build_trend_analysis(metas)

    by_protocol: dict[str, set[str]] = defaultdict(set)
    for meta in metas:
        if meta["protocolVersion"] and meta["classification"] in {"legacy", "current"}:
            by_protocol[meta["protocolVersion"]].add(meta["classification"])
    same_protocol_mixed = any(classes == {"legacy", "current"} for classes in by_protocol.values())

    classification = classify_report(
        counts,
        len(metas),
        rescorable_count,
        rule_divergence_count,
        persisted_incomplete_count,
        baseline,
        trend,
    )

    warnings: list[dict[str, Any]] = []
    for meta in metas:
        if meta["structuralErrors"]:
            warnings.append(
                {
                    "code": "MALFORMED_SESSION",
                    "sessionId": meta["pseudonymousId"],
                    "fields": meta["structuralErrors"],
                }
            )
        if not meta["rescore"]["complete"]:
            warnings.append(
                {
                    "code": "RESCORE_INCOMPLETE",
                    "sessionId": meta["pseudonymousId"],
                    "fields": meta["rescore"]["missingFields"],
                }
            )
        if meta["classification"] in {"missing_scoring_version", "unknown"}:
            warnings.append(
                {
                    "code": "SCORING_VERSION_INDETERMINATE",
                    "sessionId": meta["pseudonymousId"],
                }
            )
        missing_persisted = [
            key
            for key, value in meta["rescore"]["persisted"].items()
            if not is_number(value)
        ]
        if missing_persisted:
            warnings.append(
                {
                    "code": "PERSISTED_METRIC_MISSING",
                    "sessionId": meta["pseudonymousId"],
                    "fields": missing_persisted,
                }
            )

    session_reports: list[dict[str, Any]] = []
    for meta in sorted(metas, key=lambda item: (item["chronologicalOrder"] is None, item["chronologicalOrder"] or 0, item["sourceIndex"])):
        trials = meta["raw"].get("trials")
        session_reports.append(
            {
                "pseudonymousId": meta["pseudonymousId"],
                "chronologicalOrder": meta["chronologicalOrder"],
                "date": meta["date"],
                "testId": CORSI_TEST_ID,
                "protocolVersion": meta["protocolVersion"],
                "scoringVersion": meta["scoringVersion"],
                "trialsFieldPresent": "trials" in meta["raw"],
                "hasTrials": isinstance(trials, list) and len(trials) > 0,
                "trialCount": len(trials) if isinstance(trials, list) else None,
                "quality": meta["quality"],
                "familiarizationStatus": meta["familiarizationStatus"],
                "primaryMetric": {
                    "key": PRIMARY_METRIC,
                    "persistedValue": meta["rescore"]["persisted"][PRIMARY_METRIC],
                },
                "confirmedSpan": meta["rescore"]["persisted"]["confirmedSpan"],
                "maxSpan": meta["rescore"]["persisted"]["maxSpan"],
                "rescoreCompleteness": {
                    "complete": meta["rescore"]["complete"],
                    "missingFields": meta["rescore"]["missingFields"],
                    "notes": meta["rescore"]["notes"],
                },
                "classification": meta["classification"],
                "rescore": {
                    key: value
                    for key, value in meta["rescore"].items()
                    if key not in {"complete", "missingFields", "notes"}
                },
            }
        )

    if not metas:
        trials_answer = _answer("not_applicable", "No Corsi sessions were found.")
        recovery_answer = _answer("not_applicable", "No Corsi history requires recovery.")
        difference_answer = _answer("not_applicable", "No Corsi sessions were found.")
    else:
        all_complete = rescorable_count == len(metas)
        trials_answer = _answer(
            "yes" if all_complete else "no",
            "Every Corsi session has the fields needed by both scorers."
            if all_complete
            else "At least one Corsi session lacks a field needed by one of the scorers.",
        )
        recovery_answer = _answer(
            "yes" if all_complete else "no",
            "All Corsi sessions can be deterministically rescored in memory."
            if all_complete
            else "Complete deterministic recovery is not possible for every Corsi session.",
        )
        difference_answer = _answer(
            "yes"
            if stored_divergence_count > 0
            else ("no" if all_complete and persisted_incomplete_count == 0 else "unknown"),
            f"{stored_divergence_count} persisted result(s) differ from current in-memory rescoring.",
        )

    questions = {
        "1_legacy_sessions_exist": _answer("yes" if counts["legacy"] else "no", f"Count: {counts['legacy']}."),
        "2_current_sessions_exist": _answer("yes" if counts["current"] else "no", f"Count: {counts['current']}."),
        "3_missing_scoring_version_exists": _answer("yes" if counts["missing_scoring_version"] else "no", f"Count: {counts['missing_scoring_version']}."),
        "4_same_protocol_contains_legacy_and_current": _answer("yes" if same_protocol_mixed else "no", "Known cohorts were grouped by exact protocolVersion."),
        "5_real_baseline_window_contains_both_rules": _answer("yes" if baseline["anyWindowContainsKnownRuleMix"] else "no", "General frozen windows were reproduced exactly; contextual selection was also evaluated privately for effective comparisons."),
        "6_current_session_compared_with_incompatible_baseline": _answer("yes" if baseline["incompatibleCurrentComparisonCount"] else "no", f"Count: {baseline['incompatibleCurrentComparisonCount']}."),
        "7_longitudinal_chart_mixes_rules": _answer("yes" if trend["containsKnownRuleMix"] else "no", "The frozen chart selector and primary-metric point filter were reproduced."),
        "8_persisted_result_differs_from_current_rescore": difference_answer,
        "9_all_required_trials_available": trials_answer,
        "10_history_deterministically_recoverable": recovery_answer,
    }

    return {
        "toolVersion": TOOL_VERSION,
        "reportSchemaVersion": REPORT_SCHEMA_VERSION,
        "input": {},
        "historicalModel": {
            "testId": CORSI_TEST_ID,
            "protocolVersion": CORSI_PROTOCOL_VERSION,
            "legacyScoringVersion": LEGACY_SCORING_VERSION,
            "currentScoringVersion": CURRENT_SCORING_VERSION,
            "boundaryCommit": HISTORICAL_BOUNDARY_COMMIT,
            "primaryMetric": PRIMARY_METRIC,
            "essentialMetrics": list(ESSENTIAL_METRICS),
        },
        "summary": {
            "totalSessions": len(sessions),
            "corsiSessions": len(metas),
            "legacy": counts["legacy"],
            "current": counts["current"],
            "missingScoringVersion": counts["missing_scoring_version"],
            "unknown": counts["unknown"],
            "malformed": counts["malformed"],
            "rescorable": rescorable_count,
            "persistedVsCurrentDivergences": stored_divergence_count,
            "legacyVsCurrentRuleDivergences": rule_divergence_count,
            "persistedMetricIncomplete": persisted_incomplete_count,
            "sameProtocolHasLegacyAndCurrent": same_protocol_mixed,
            "baselineMixing": baseline["anyEffectiveReferenceContainsKnownRuleMix"],
            "trendMixing": trend["containsKnownRuleMix"],
        },
        "corsiSessions": session_reports,
        "baselineAnalysis": baseline,
        "trendAnalysis": trend,
        "questions": questions,
        "classification": classification,
        "warnings": warnings,
    }


def write_report(report: Mapping[str, Any], output_path: Path) -> None:
    payload = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False) + "\n"
    try:
        with output_path.open("x", encoding="utf-8", newline="\n") as stream:
            stream.write(payload)
    except FileExistsError as exc:
        raise InventoryError("saída recusada: o arquivo de relatório já existe") from exc


def execute(input_path: Path, output_path: Path, repo_root: Path = REPO_ROOT) -> dict[str, Any]:
    validate_paths(input_path, output_path, repo_root)
    before = sha256_file(input_path)
    backup = load_backup(input_path)
    report = analyze_backup(backup)
    after = sha256_file(input_path)
    unchanged = before == after
    report["input"] = {
        "sha256Before": before,
        "sha256After": after,
        "unchanged": unchanged,
    }
    if not unchanged:
        raise InventoryError("o hash do input mudou durante a análise; relatório não foi gravado")
    write_report(report, output_path)
    return report


def _yes_no(value: bool) -> str:
    return "YES" if value else "NO"


def print_summary(report: Mapping[str, Any], output_path: Path) -> None:
    summary = report["summary"]
    input_info = report["input"]
    print(f"SHA-256 BEFORE: {input_info['sha256Before']}")
    print(f"SHA-256 AFTER: {input_info['sha256After']}")
    print(f"TOTAL SESSIONS: {summary['totalSessions']}")
    print(f"CORSI SESSIONS: {summary['corsiSessions']}")
    print(
        "LEGACY/CURRENT/MISSING/UNKNOWN/MALFORMED: "
        f"{summary['legacy']}/{summary['current']}/{summary['missingScoringVersion']}/"
        f"{summary['unknown']}/{summary['malformed']}"
    )
    print(f"RESCORABLE: {summary['rescorable']}")
    print(f"DIVERGENT: {summary['persistedVsCurrentDivergences']}")
    print(f"BASELINE MIXING: {_yes_no(summary['baselineMixing'])}")
    print(f"TREND MIXING: {_yes_no(summary['trendMixing'])}")
    print(f"CLASSIFICATION: {report['classification']['code']}")
    print(f"REPORT: {output_path}")
    print(f"INPUT UNCHANGED: {_yes_no(input_info['unchanged'])}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Inventaria sessões Corsi de um backup Cognitive Lab sem alterar o input."
    )
    parser.add_argument("--input", required=True, help="caminho absoluto do backup JSON externo")
    parser.add_argument(
        "--output",
        help="caminho absoluto do relatório JSON; padrão: ao lado do input",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    input_path = Path(args.input)
    output_path = Path(args.output) if args.output else default_output_path(input_path)
    before: str | None = None
    after: str | None = None
    try:
        if input_path.is_absolute() and input_path.exists() and input_path.is_file():
            before = sha256_file(input_path)
        report = execute(input_path, output_path)
        print_summary(report, output_path)
        return 0
    except (InventoryError, OSError) as exc:
        if before is not None and input_path.exists() and input_path.is_file():
            try:
                after = sha256_file(input_path)
            except OSError:
                after = None
        print(f"ERROR: {exc}", file=sys.stderr)
        print(f"INPUT UNCHANGED: {_yes_no(before is not None and before == after)}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
