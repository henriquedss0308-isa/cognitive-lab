"""Gera fixtures sintéticas determinísticas + valores esperados do oráculo.

Executar de validation-oracle/:  python make_fixtures.py
Saída: fixtures/*.json e comparisons/expected/*.json

Nenhum dado pessoal: tudo aqui é sintético, com seed fixa (2026).
"""

from __future__ import annotations

import json
import os
import random

from oracle import baseline, corsi, costs, rt, sdt, stats

SEED = 2026
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures")
EXP = os.path.join(HERE, "comparisons", "expected")
os.makedirs(FIX, exist_ok=True)
os.makedirs(EXP, exist_ok=True)


def dump(folder: str, name: str, data) -> None:
    with open(os.path.join(folder, name), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, sort_keys=True)


# ---------------------------------------------------------------- 1. básica
rng = random.Random(SEED)
arrays = {
    "hand_small": [3.0, 1.0, 2.0],
    "hand_even": [1.0, 2.0, 3.0, 4.0],
    "single": [42.0],
    "pair": [10.0, 30.0],
    "ties": [5.0, 5.0, 5.0, 5.0, 5.0],
    "with_outlier": [1.0, 2.0, 3.0, 4.0, 100.0],
    "negatives": [-3.0, -1.0, 0.0, 2.0, 7.0],
    "rt_like": sorted(round(rng.gauss(420, 60), 3) for _ in range(31)),
    "rt_like_even": sorted(round(rng.gauss(380, 45), 3) for _ in range(40)),
    "empty": [],
}
dump(FIX, "basic_stats.json", arrays)
dump(EXP, "basic_stats.json", {
    name: {
        "median": stats.median(v),
        "mean": stats.mean(v),
        "sd": stats.sample_sd(v),
        "iqr": stats.iqr(v),
        "mad": stats.mad(v),
        "cv": stats.coefficient_of_variation(v),
        "p10": stats.percentile_r7(v, 10),
        "p90": stats.percentile_r7(v, 90),
    } for name, v in arrays.items()
})

# ---------------------------------------------------------------- 2. SDT
sdt_cases = [
    {"hits": 20, "misses": 5, "falseAlarms": 2, "correctRejections": 23},
    {"hits": 10, "misses": 10, "falseAlarms": 5, "correctRejections": 5},
    {"hits": 25, "misses": 0, "falseAlarms": 0, "correctRejections": 25},   # perfeito
    {"hits": 0, "misses": 25, "falseAlarms": 25, "correctRejections": 0},   # invertido
    {"hits": 0, "misses": 0, "falseAlarms": 3, "correctRejections": 7},     # sem sinal
    {"hits": 3, "misses": 7, "falseAlarms": 0, "correctRejections": 0},     # sem ruído
    {"hits": 111, "misses": 9, "falseAlarms": 4, "correctRejections": 24},  # SART-like
    {"hits": 1, "misses": 0, "falseAlarms": 0, "correctRejections": 1},     # mínimo
]
dump(FIX, "sdt_cases.json", sdt_cases)
dump(EXP, "sdt_cases.json", [
    sdt.sdt_metrics(c["hits"], c["misses"], c["falseAlarms"],
                    c["correctRejections"]) for c in sdt_cases])

# ---------------------------------------------------------------- 3. RT/acc
def trial(i, cond, exp, act, correct, rt_ms, reason=None, focused=True,
          block=0, stim="s", meta=None):
    t = {
        "trialId": f"t{i:04d}", "sessionId": "fx", "testId": "gonogo",
        "protocolVersion": "fx.v1", "mode": "assessment",
        "blockIndex": block, "trialIndex": i, "condition": cond,
        "stimulus": stim, "expectedResponse": exp, "actualResponse": act,
        "correct": correct, "reactionTimeMs": rt_ms,
        "stimulusOnsetTimestamp": 1000.0 + i * 2000,
        "responseTimestamp": (1000.0 + i * 2000 + rt_ms) if rt_ms is not None else None,
        "windowFocused": focused, "visibilityState": "visible",
        "deviceType": "desktop", "inputMethod": "keyboard",
    }
    if reason:
        t["invalidReason"] = reason
    if meta:
        t["metadata"] = meta
    return t


rng = random.Random(SEED + 1)
messy = []
i = 0
for _ in range(30):
    r = round(rng.gauss(400, 70), 3)
    messy.append(trial(i, "go", "space", "space", True, max(160.0, r)))
    i += 1
messy.append(trial(i, "go", "space", "space", True, 90.0)); i += 1            # antecipação
messy.append(trial(i, "go", "space", "space", False, None, "anticipation")); i += 1
messy.append(trial(i, "go", "space", "space", True, 2400.0)); i += 1          # lapso
messy.append(trial(i, "go", "space", "", False, None, "omission")); i += 1
messy.append(trial(i, "go", "space", "space", True, 500.0, None, False)); i += 1  # sem foco
messy.append(trial(i, "nogo", "none", "none", True, None)); i += 1
messy.append(trial(i, "nogo", "none", "space", False, 350.0, "commission")); i += 1

rt_sets = {
    "messy": {"trials": messy,
              "cleaning": {"anticipationThresholdMs": 150, "lapseThresholdMs": 2000}},
    "empty": {"trials": [],
              "cleaning": {"anticipationThresholdMs": 150, "lapseThresholdMs": 2000}},
    "all_invalid": {"trials": [trial(0, "go", "space", "space", True, 50.0),
                               trial(1, "go", "space", "", False, None, "omission")],
                    "cleaning": {"anticipationThresholdMs": 150,
                                 "lapseThresholdMs": 2000}},
}
dump(FIX, "rt_trials.json", rt_sets)
exp_rt = {}
for name, s in rt_sets.items():
    m = rt.rt_metrics(s["trials"], s["cleaning"]["anticipationThresholdMs"],
                      s["cleaning"]["lapseThresholdMs"])
    m.pop("validRTs")
    exp_rt[name] = {"rt": m, "accuracy": rt.accuracy_metrics(s["trials"]),
                    "postErrorSlowing": rt.post_error_slowing(s["trials"])}
dump(EXP, "rt_trials.json", exp_rt)

# ---------------------------------------------------------------- 4. custos
rng = random.Random(SEED + 2)
cost_cases = {
    "stroop": {
        "congruent": [round(rng.gauss(520, 40), 3) for _ in range(20)],
        "incongruent": [round(rng.gauss(610, 55), 3) for _ in range(20)],
        "neutral": [round(rng.gauss(545, 45), 3) for _ in range(20)],
    },
    "taskswitch": {
        "switch": [round(rng.gauss(760, 80), 3) for _ in range(19)],
        "repeat": [round(rng.gauss(640, 60), 3) for _ in range(21)],
        "pure": [round(rng.gauss(520, 45), 3) for _ in range(40)],
    },
    "degenerate": {"congruent": [], "incongruent": [500.0]},
}
dump(FIX, "costs.json", cost_cases)
dump(EXP, "costs.json", {
    "stroopCostRT": costs.stroop_cost_rt(cost_cases["stroop"]["congruent"],
                                         cost_cases["stroop"]["incongruent"]),
    "incongruentNeutralCostRT": costs.stroop_cost_rt(
        cost_cases["stroop"]["neutral"], cost_cases["stroop"]["incongruent"]),
    "switchCostRT": costs.switch_cost_rt(cost_cases["taskswitch"]["switch"],
                                         cost_cases["taskswitch"]["repeat"]),
    "mixingCostRT": costs.mixing_cost_rt(cost_cases["taskswitch"]["repeat"],
                                         cost_cases["taskswitch"]["pure"]),
    "degenerateStroop": costs.stroop_cost_rt(cost_cases["degenerate"]["congruent"],
                                             cost_cases["degenerate"]["incongruent"]),
})

# ---------------------------------------------------------------- 5. Corsi
def cst(i, exp_seq, act_seq):
    return {"trialIndex": i, "expectedResponse": exp_seq, "actualResponse": act_seq}


corsi_cases = {
    "hand_case": [
        cst(0, "1,2", "1,2"), cst(1, "3,4", "3,4"),
        cst(2, "1,2,3", "1,2,3"), cst(3, "4,5,6", "4,5,6"),
        cst(4, "1,2,3,4", "1,9,9,9"), cst(5, "5,6,7,8", "5,6,7,8"),
        cst(6, "1,3,5,7", "1,3,9,9"), cst(7, "2,4,6,8", "9,9,9,9"),
    ],
    "immediate_fail": [
        cst(0, "1,2", "3,4"), cst(1, "5,6", "7,8"),
    ],
    "short_response_is_error": [
        cst(0, "1,2", "1"), cst(1, "3,4", "3,4"), cst(2, "5,6", "5"),
        cst(3, "7,8", "0,0"),
    ],
    "empty": [],
}
dump(FIX, "corsi_replay.json", corsi_cases)
dump(EXP, "corsi_replay.json",
     {name: corsi.replay(ts) for name, ts in corsi_cases.items()})

# ---------------------------------------------------------------- 6. baseline
def sess(i, value, quality="valid", status="completed", lisdex="unknown",
         proto="fx.v1", mode="assessment", demo=False, insuff=False,
         started=None):
    return {
        "sessionId": f"s{i:02d}", "testId": "fx", "protocolVersion": proto,
        "mode": mode, "quality": quality, "isDemo": demo, "status": status,
        "startedAt": started or f"2026-02-{i + 1:02d}T12:00:00.000Z",
        "completedAt": f"2026-02-{i + 1:02d}T12:10:00.000Z",
        "flags": {"insufficientPractice": insuff},
        "flagMessages": [], "trials": [], "practiceCompleted": True,
        "randomizationSeed": 1, "isDemoData": False,
        "deviceInfo": {"deviceType": "desktop", "inputMethod": "keyboard",
                       "screenWidth": 1920, "screenHeight": 1080,
                       "browser": "Chrome", "userAgent": "fx"},
        "checkIn": ({"medications": {"lisdexamfetamine": {"status": lisdex}}}
                    if lisdex != "unknown" else None),
        "result": {"customMetrics": {"m": value},
                   "rtMetrics": {"medianCorrectRT": value,
                                 "rtCoefficientOfVariation": None,
                                 "anticipationRate": 0, "lapseRate": 0},
                   "accuracyMetrics": {"accuracy": 0.9},
                   "conditionMetrics": {}},
    }


rng = random.Random(SEED + 3)
values = [round(rng.gauss(430, 25), 3) for _ in range(14)]

scenarios = {
    # 12 elegíveis -> monitoring; janela = posições 3..10
    "monitoring": [sess(i, values[i]) for i in range(12)],
    # protocolo misto: 6 antigas fx.v0 + 12 novas fx.v1 -> só fx.v1 conta
    "mixed_protocol": ([sess(i, 999.0, proto="fx.v0") for i in range(6)]
                       + [sess(i + 6, values[i]) for i in range(12)]),
    # inelegíveis intercaladas
    "with_ineligible": ([sess(i, values[i]) for i in range(12)]
                        + [sess(20, 999.0, quality="invalid"),
                           sess(21, 999.0, demo=True),
                           sess(22, 999.0, mode="training"),
                           sess(23, 999.0, insuff=True),
                           sess(24, 999.0, status="interrupted")]),
    # MAD zero: janela com valores idênticos
    "zero_mad": [sess(i, 400.0) for i in range(12)],
    # construção: só 7 elegíveis
    "building": [sess(i, values[i]) for i in range(7)],
    # contextual: 3 familiarização + alternância taken/not_taken/unknown
    "contextual": ([sess(i, values[i]) for i in range(3)]
                   + [sess(i + 3, values[i + 3],
                           lisdex=["taken", "not_taken", "unknown"][i % 3])
                      for i in range(11)]),
}
dump(FIX, "baseline_sessions.json", scenarios)

expected_baseline = {}
for name, ss in scenarios.items():
    proto = "fx.v1"
    elig = baseline.eligible(
        [dict(s, lisdexStatus=(s["checkIn"]["medications"]["lisdexamfetamine"]["status"]
                               if s.get("checkIn") else "unknown"),
              result={"m": s["result"]["customMetrics"]["m"]})
         for s in ss], "fx", proto)
    window = baseline.general_window(elig)
    stats_m = baseline.metric_stats(window, "m")
    phase = baseline.phase_for_count(len(elig))
    probe = 480.0
    expected_baseline[name] = {
        "eligibleCount": len(elig),
        "phase": phase,
        "windowIds": [s["sessionId"] for s in window],
        "metric": stats_m,
        "zProbeDirectionMinus": baseline.primary_z(probe, phase, stats_m, -1),
        "zProbeDirectionPlus": baseline.primary_z(probe, phase, stats_m, 1),
        "contextualTaken": [s["sessionId"] for s in
                            baseline.contextual_window(elig, "taken")],
        "contextualNotTaken": [s["sessionId"] for s in
                               baseline.contextual_window(elig, "not_taken")],
    }
dump(EXP, "baseline_sessions.json", expected_baseline)

# ------------------------------------------------- 7. fronteira do LCG (JS)
# Semente cujo PRÓXIMO estado do LCG é 0xffffffff -> random() retorna 1.0
M = 1 << 32
A = 1664525
C = 1013904223
target = 0xFFFFFFFF
seed_boundary = ((target - C) * pow(A, -1, M)) % M
assert (seed_boundary * A + C) % M == target
dump(FIX, "lcg_boundary.json", {"seed": seed_boundary,
                                "expectedNext": 1.0,
                                "note": "randomInt(0, 3) com este estado deve "
                                        "sair do intervalo se random()==1.0"})

# ------------------------------------------------- 8. sessões completas
# Go/No-Go sintético com contagens conhecidas
rng = random.Random(SEED + 4)
gonogo_trials = []
i = 0
# 40 go corretos, 4 misses, 2 antecipações; 12 nogo: 9 CR, 3 FA
for _ in range(40):
    gonogo_trials.append(trial(i, "go", "space", "space", True,
                               round(rng.gauss(380, 55), 3),
                               block=i // 20)); i += 1
for _ in range(4):
    gonogo_trials.append(trial(i, "go", "space", "", False, None, "omission",
                               block=i // 20)); i += 1
for _ in range(2):
    gonogo_trials.append(trial(i, "go", "space", "space", False, None,
                               "anticipation", block=i // 20)); i += 1
for _ in range(9):
    gonogo_trials.append(trial(i, "nogo", "none", "none", True, None,
                               block=i // 20)); i += 1
for _ in range(3):
    gonogo_trials.append(trial(i, "nogo", "none", "space", False,
                               round(rng.gauss(300, 40), 3), "commission",
                               block=i // 20)); i += 1
# RTs válidos (go corretos dentro dos limiares)
go_valid = [t["reactionTimeMs"] for t in gonogo_trials
            if t["condition"] == "go" and t["correct"]
            and t["reactionTimeMs"] is not None
            and 150 <= t["reactionTimeMs"] <= 2000]
# contagens SDT segundo as definições do protocolo
hits = sum(1 for t in gonogo_trials if t["condition"] == "go" and t["correct"]
           and t["actualResponse"] not in ("", "none"))
misses = sum(1 for t in gonogo_trials if t["condition"] == "go"
             and t["actualResponse"] in ("", "none"))
fas = sum(1 for t in gonogo_trials if t["condition"] == "nogo"
          and t["actualResponse"] not in ("", "none"))
crs = sum(1 for t in gonogo_trials if t["condition"] == "nogo"
          and t["actualResponse"] in ("", "none") and t["correct"])
nogo_n = sum(1 for t in gonogo_trials if t["condition"] == "nogo")
sdt_go = sdt.sdt_metrics(hits, misses, fas, crs)
dump(FIX, "session_gonogo.json", gonogo_trials)
dump(EXP, "session_gonogo.json", {
    "sdt": sdt_go,
    "commissionErrorRate": fas / nogo_n,
    "commissionErrors": fas,
    "medianCorrectRT": stats.median(go_valid),
    "accuracy": rt.accuracy_metrics(gonogo_trials)["accuracy"],
    "counts": {"hits": hits, "misses": misses, "falseAlarms": fas,
               "correctRejections": crs},
})

# Task switching sintético
rng = random.Random(SEED + 5)
ts_trials = []
i = 0
def ts_trial(cond, rt_ms, correct=True, block=0):
    global i
    t = trial(i, cond, "f", "f" if correct else "j", correct, rt_ms,
              block=block)
    i += 1
    return t

for _ in range(38):
    ts_trials.append(ts_trial("pure_odd_even", round(rng.gauss(520, 45), 3),
                              block=0))
ts_trials.append(ts_trial("pure_odd_even", round(rng.gauss(520, 45), 3),
                          correct=False, block=0))
for _ in range(39):
    ts_trials.append(ts_trial("pure_magnitude", round(rng.gauss(535, 50), 3),
                              block=1))
for _ in range(36):
    ts_trials.append(ts_trial("mixed_repeat", round(rng.gauss(640, 60), 3),
                              block=2))
for _ in range(4):
    ts_trials.append(ts_trial("mixed_repeat", round(rng.gauss(640, 60), 3),
                              correct=False, block=2))
for _ in range(30):
    ts_trials.append(ts_trial("mixed_switch", round(rng.gauss(760, 85), 3),
                              block=3))
for _ in range(8):
    ts_trials.append(ts_trial("mixed_switch", round(rng.gauss(760, 85), 3),
                              correct=False, block=3))


def valid_rts(cond):
    return [t["reactionTimeMs"] for t in ts_trials
            if t["condition"] == cond and t["correct"]
            and t["reactionTimeMs"] is not None
            and 150 <= t["reactionTimeMs"] <= 2000]


def acc(conds):
    sub = [t for t in ts_trials if t["condition"] in conds]
    return rt.accuracy_metrics(sub)["accuracy"]


pure_rts = valid_rts("pure_odd_even") + valid_rts("pure_magnitude")
acc_repeat = acc(["mixed_repeat"])
acc_switch = acc(["mixed_switch"])
acc_pure_mean = (acc(["pure_odd_even"]) + acc(["pure_magnitude"])) / 2
dump(FIX, "session_taskswitch.json", ts_trials)
dump(EXP, "session_taskswitch.json", {
    "switchCostRT": costs.switch_cost_rt(valid_rts("mixed_switch"),
                                         valid_rts("mixed_repeat")),
    "mixingCostRT": costs.mixing_cost_rt(valid_rts("mixed_repeat"), pure_rts),
    "switchCostAccuracy": costs.switch_cost_accuracy(acc_repeat, acc_switch),
    "mixingCostAccuracyConsistent": costs.mixing_cost_accuracy_consistent(
        acc_pure_mean, acc_repeat),
    "mixingCostAccuracyAsProduction": costs.mixing_cost_accuracy_as_production(
        acc_pure_mean, acc_repeat),
})

# Stroop sintético
rng = random.Random(SEED + 6)
st_trials = []
i = 0
def st_trial(cond, rt_ms, correct=True):
    global i
    t = trial(i, cond, "f", "f" if correct else "g", correct, rt_ms,
              block=i // 30)
    i += 1
    return t

for _ in range(38):
    st_trials.append(st_trial("congruent", round(rng.gauss(540, 45), 3)))
for _ in range(2):
    st_trials.append(st_trial("congruent", round(rng.gauss(540, 45), 3), False))
for _ in range(34):
    st_trials.append(st_trial("incongruent", round(rng.gauss(650, 65), 3)))
for _ in range(6):
    st_trials.append(st_trial("incongruent", round(rng.gauss(650, 65), 3), False))
for _ in range(39):
    st_trials.append(st_trial("neutral", round(rng.gauss(560, 50), 3)))
st_trials.append(st_trial("neutral", round(rng.gauss(560, 50), 3), False))


def st_valid(cond):
    return [t["reactionTimeMs"] for t in st_trials
            if t["condition"] == cond and t["correct"]
            and 150 <= t["reactionTimeMs"] <= 2000]


def st_acc(cond):
    return rt.accuracy_metrics([t for t in st_trials
                                if t["condition"] == cond])["accuracy"]


dump(FIX, "session_stroop.json", st_trials)
dump(EXP, "session_stroop.json", {
    "stroopCostRT": costs.stroop_cost_rt(st_valid("congruent"),
                                         st_valid("incongruent")),
    "stroopCostAccuracy": costs.stroop_cost_accuracy(st_acc("congruent"),
                                                     st_acc("incongruent")),
    "incongruentNeutralCostRT": costs.stroop_cost_rt(st_valid("neutral"),
                                                     st_valid("incongruent")),
})

print("fixtures e expected gerados com seed", SEED)
