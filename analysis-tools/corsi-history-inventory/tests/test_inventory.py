from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from synthetic_fixtures import (
    CURRENT,
    CURRENT_MULTI,
    CURRENT_TWO_CORRECT,
    LEGACY_MULTI,
    LEGACY_TWO_CORRECT,
    backup,
    incomplete_trials,
    legacy_current_inside_frozen_window,
    legacy_current_outside_frozen_window,
    malformed_session,
    missing_scoring_version,
    no_corsi,
    only_current,
    only_legacy,
    persisted_divergent,
    session,
    trial,
    two_correct_trials,
)


MODULE_PATH = Path(__file__).resolve().parents[1] / "inventory.py"
SPEC = importlib.util.spec_from_file_location("corsi_inventory", MODULE_PATH)
assert SPEC and SPEC.loader
inventory = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = inventory
SPEC.loader.exec_module(inventory)


class InventoryAnalysisTests(unittest.TestCase):
    def test_no_corsi(self) -> None:
        report = inventory.analyze_backup(no_corsi())
        self.assertEqual(report["summary"]["corsiSessions"], 0)
        self.assertEqual(report["classification"]["code"], "NO_REAL_IMPACT_FOUND")

    def test_only_legacy(self) -> None:
        report = inventory.analyze_backup(only_legacy())
        self.assertEqual(report["summary"]["legacy"], 1)
        self.assertEqual(report["summary"]["current"], 0)

    def test_only_current(self) -> None:
        report = inventory.analyze_backup(only_current())
        self.assertEqual(report["summary"]["current"], 1)
        self.assertEqual(report["classification"]["code"], "NO_REAL_IMPACT_FOUND")

    def test_legacy_current_outside_frozen_baseline_window(self) -> None:
        report = inventory.analyze_backup(legacy_current_outside_frozen_window())
        self.assertFalse(report["baselineAnalysis"]["anyWindowContainsKnownRuleMix"])
        self.assertTrue(report["trendAnalysis"]["containsKnownRuleMix"])

    def test_legacy_current_inside_frozen_window(self) -> None:
        report = inventory.analyze_backup(legacy_current_inside_frozen_window())
        self.assertTrue(report["summary"]["baselineMixing"])
        self.assertEqual(report["classification"]["code"], "CONFIRMED_HISTORICAL_MIXING")

    def test_missing_scoring_version(self) -> None:
        report = inventory.analyze_backup(missing_scoring_version())
        self.assertEqual(report["summary"]["missingScoringVersion"], 1)
        self.assertEqual(report["classification"]["code"], "POTENTIAL_HISTORICAL_RISK")

    def test_incomplete_trials(self) -> None:
        report = inventory.analyze_backup(incomplete_trials())
        self.assertEqual(report["summary"]["rescorable"], 0)
        fields = report["corsiSessions"][0]["rescoreCompleteness"]["missingFields"]
        self.assertIn("trials[].actualResponse", fields)

    def test_malformed_session(self) -> None:
        report = inventory.analyze_backup(malformed_session())
        self.assertEqual(report["summary"]["malformed"], 1)
        self.assertEqual(report["corsiSessions"][0]["classification"], "malformed")

    def test_persisted_result_divergence(self) -> None:
        report = inventory.analyze_backup(persisted_divergent())
        self.assertEqual(report["summary"]["persistedVsCurrentDivergences"], 1)
        fields = report["corsiSessions"][0]["rescore"]["persistedVsCurrentDifferentFields"]
        self.assertEqual(fields, ["confirmedSpan", "maxSpan"])

    def test_same_protocol_different_scoring_versions(self) -> None:
        report = inventory.analyze_backup(
            backup([session("synthetic-old", 1, "legacy"), session("synthetic-new", 2, "current")])
        )
        self.assertTrue(report["summary"]["sameProtocolHasLegacyAndCurrent"])

    def test_confirmed_span_rule_diverges(self) -> None:
        report = inventory.analyze_backup(only_current())
        rescore = report["corsiSessions"][0]["rescore"]
        self.assertEqual(rescore["legacy"], LEGACY_MULTI)
        self.assertEqual(rescore["current"], CURRENT_MULTI)
        self.assertIn("confirmedSpan", rescore["legacyVsCurrentDifferentFields"])

    def test_max_span_rule_diverges(self) -> None:
        row = session(
            "synthetic-two-correct",
            1,
            trials=two_correct_trials(),
            metrics=CURRENT_TWO_CORRECT,
        )
        report = inventory.analyze_backup(backup([row]))
        rescore = report["corsiSessions"][0]["rescore"]
        self.assertEqual(rescore["legacy"], LEGACY_TWO_CORRECT)
        self.assertEqual(rescore["current"], CURRENT_TWO_CORRECT)
        self.assertIn("maxSpan", rescore["legacyVsCurrentDifferentFields"])

    def test_familiarization_and_frozen_window_positions(self) -> None:
        rows = [session(f"synthetic-order-{i}", i) for i in range(1, 5)]
        report = inventory.analyze_backup(backup(rows))
        statuses = [item["familiarizationStatus"] for item in report["corsiSessions"]]
        self.assertEqual(statuses, ["familiarization"] * 3 + ["frozen_baseline_window"])

    def test_invalid_session_is_not_in_baseline_or_trend(self) -> None:
        rows = [session(f"synthetic-valid-{i}", i) for i in range(1, 4)]
        rows.append(session("synthetic-invalid", 4, quality="invalid"))
        report = inventory.analyze_backup(backup(rows))
        self.assertEqual(report["baselineAnalysis"]["series"][0]["eligibleSessionCount"], 3)
        self.assertEqual(report["trendAnalysis"]["hiddenInvalid"], 1)

    def test_window_below_min_baseline_n_is_not_effective(self) -> None:
        rows = [session(f"synthetic-min-n-{i}", i) for i in range(1, 12)]
        for row in rows[8:]:
            row["result"]["customMetrics"]["confirmedSpan"] = None
        report = inventory.analyze_backup(backup(rows))
        series = report["baselineAnalysis"]["series"][0]
        self.assertEqual(series["phase"], "monitoring")
        self.assertEqual(series["primaryMetricN"], 5)
        self.assertFalse(series["effectiveForComparison"])

    def test_contextual_selection_is_reproduced_without_context_leak(self) -> None:
        rows = [session(f"synthetic-context-fam-{i}", i) for i in range(1, 4)]
        rows.extend(
            session(f"synthetic-context-ref-{i}", i, context_status="taken")
            for i in range(4, 12)
        )
        rows.append(session("synthetic-context-target", 12, context_status="taken"))
        report = inventory.analyze_backup(backup(rows))
        serialized = json.dumps(report, ensure_ascii=False)
        self.assertNotIn("lisdexamfetamine", serialized)
        self.assertNotIn("synthetic private note", serialized)
        target_hash = hashlib.sha256(b"synthetic-context-target").hexdigest()[:12]
        comparison = next(
            item for item in report["baselineAnalysis"]["sessionComparisons"]
            if item["sessionId"] == target_hash
        )
        self.assertTrue(comparison["performed"])

    def test_report_never_contains_original_session_id_or_private_settings(self) -> None:
        original = "synthetic-secret-original-id"
        report = inventory.analyze_backup(backup([session(original, 1, context_status="taken")]))
        serialized = json.dumps(report, ensure_ascii=False)
        self.assertNotIn(original, serialized)
        self.assertNotIn("synthetic private name", serialized)
        self.assertNotIn("synthetic private note", serialized)

    def test_malformed_non_corsi_record_is_not_textually_guessed(self) -> None:
        data = backup([{"sessionId": "mentions-corsi-in-notes", "notes": "corsi"}])
        report = inventory.analyze_backup(data)
        self.assertEqual(report["summary"]["corsiSessions"], 0)

    def test_unknown_scoring_version(self) -> None:
        row = session("synthetic-unknown-version", 1, scoring_version="future-scorer")
        report = inventory.analyze_backup(backup([row]))
        self.assertEqual(report["summary"]["unknown"], 1)

    def test_missing_span_uses_documented_legacy_fallback(self) -> None:
        row = session("synthetic-missing-span", 1)
        del row["trials"][0]["metadata"]["span"]
        report = inventory.analyze_backup(backup([row]))
        completeness = report["corsiSessions"][0]["rescoreCompleteness"]
        self.assertTrue(completeness["complete"])
        self.assertIn("metadata.span missing; legacy scorer fallback START_SPAN=2 applies", completeness["notes"])

    def test_confirmed_difference_without_effective_mixing(self) -> None:
        rows = [
            session("synthetic-visible-legacy", 1, "legacy"),
            session("synthetic-hidden-current", 2, "current", is_demo=True),
        ]
        report = inventory.analyze_backup(backup(rows))
        self.assertFalse(report["summary"]["baselineMixing"])
        self.assertFalse(report["summary"]["trendMixing"])
        self.assertEqual(
            report["classification"]["code"],
            "CONFIRMED_DIFFERENCE_WITHOUT_BASELINE_MIXING",
        )

    def test_real_oracle_confirmed_span_scenarios(self) -> None:
        scenarios = {
            "correct_wrong_wrong": (
                [
                    trial(0, 2, "1,2", "1,2"),
                    trial(1, 2, "3,4", "9,9"),
                    trial(2, 2, "5,6", "9,9"),
                ],
                1,
                2,
            ),
            "two_correct": (two_correct_trials(), 2, 2),
            "correct_wrong_correct": (
                [
                    trial(0, 2, "1,2", "1,2"),
                    trial(1, 2, "3,4", "9,9"),
                    trial(2, 2, "5,6", "5,6"),
                ],
                1,
                2,
            ),
            "two_wrong": (
                [trial(0, 2, "1,2", "9,9"), trial(1, 2, "3,4", "9,9")],
                1,
                0,
            ),
            "interrupted": ([trial(0, 2, "1,2", "1,2")], 1, 2),
        }
        for name, (rows, expected_legacy, expected_current) in scenarios.items():
            with self.subTest(name=name):
                self.assertEqual(inventory.score_legacy(rows, "assessment")["confirmedSpan"], expected_legacy)
                self.assertEqual(inventory.score_current(rows, "assessment")["confirmedSpan"], expected_current)

    def test_missing_persisted_metric_is_explicit_risk(self) -> None:
        row = session("synthetic-missing-persisted", 1, "current")
        del row["result"]["customMetrics"]["confirmedSpan"]
        report = inventory.analyze_backup(backup([row]))
        self.assertEqual(report["summary"]["persistedMetricIncomplete"], 1)
        self.assertEqual(report["classification"]["code"], "POTENTIAL_HISTORICAL_RISK")
        self.assertEqual(
            report["questions"]["8_persisted_result_differs_from_current_rescore"]["answer"],
            "unknown",
        )


class InventoryFileSafetyTests(unittest.TestCase):
    def _write_backup(self, directory: Path, data: dict | None = None) -> Path:
        path = directory / "backup.json"
        path.write_text(json.dumps(data or only_current()), encoding="utf-8")
        return path

    def test_input_and_output_equal_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            path = self._write_backup(Path(name))
            with self.assertRaisesRegex(inventory.InventoryError, "igual ao input"):
                inventory.validate_paths(path, path, inventory.REPO_ROOT)

    def test_output_inside_repository_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            input_path = self._write_backup(Path(name))
            output = inventory.REPO_ROOT / "forbidden-corsi-report.json"
            with self.assertRaisesRegex(inventory.InventoryError, "dentro do repositório"):
                inventory.validate_paths(input_path, output, inventory.REPO_ROOT)

    def test_hash_is_identical_before_and_after(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            directory = Path(name)
            input_path = self._write_backup(directory)
            output_path = directory / "report.json"
            before = inventory.sha256_file(input_path)
            modified_before = input_path.stat().st_mtime_ns
            report = inventory.execute(input_path, output_path, inventory.REPO_ROOT)
            after = inventory.sha256_file(input_path)
            self.assertEqual(before, after)
            self.assertEqual(modified_before, input_path.stat().st_mtime_ns)
            self.assertTrue(report["input"]["unchanged"])
            self.assertEqual(report["input"]["sha256Before"], report["input"]["sha256After"])

    def test_existing_output_is_not_overwritten(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            directory = Path(name)
            input_path = self._write_backup(directory)
            output_path = directory / "report.json"
            output_path.write_text("keep", encoding="utf-8")
            with self.assertRaisesRegex(inventory.InventoryError, "já existe"):
                inventory.validate_paths(input_path, output_path, inventory.REPO_ROOT)
            self.assertEqual(output_path.read_text(encoding="utf-8"), "keep")

    def test_relative_input_is_refused(self) -> None:
        with self.assertRaisesRegex(inventory.InventoryError, "caminho absoluto"):
            inventory.validate_paths(Path("relative.json"), Path("C:/outside/report.json"))

    def test_unknown_backup_schema_fails_safely(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            path = Path(name) / "unknown.json"
            path.write_text(json.dumps({"sessions": []}), encoding="utf-8")
            with self.assertRaisesRegex(inventory.InventoryError, "schema desconhecido"):
                inventory.load_backup(path)

    def test_report_is_deterministic(self) -> None:
        first = inventory.analyze_backup(legacy_current_inside_frozen_window())
        second = inventory.analyze_backup(legacy_current_inside_frozen_window())
        self.assertEqual(first, second)

    def test_cli_emits_only_short_summary_and_final_unchanged_line(self) -> None:
        with tempfile.TemporaryDirectory() as name:
            directory = Path(name)
            input_path = self._write_backup(directory)
            output_path = directory / "report.json"
            completed = subprocess.run(
                [
                    sys.executable,
                    str(MODULE_PATH),
                    "--input",
                    str(input_path),
                    "--output",
                    str(output_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            lines = completed.stdout.strip().splitlines()
            self.assertEqual(len(lines), 12)
            self.assertEqual(lines[-1], "INPUT UNCHANGED: YES")
            self.assertTrue(output_path.exists())


if __name__ == "__main__":
    unittest.main()
