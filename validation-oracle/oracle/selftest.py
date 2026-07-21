"""Auto-teste do oráculo: casos calculáveis à mão + fronteiras.

Executar de validation-oracle/:  python -m oracle.selftest
Falha em qualquer caso => exit code != 0.
"""

from __future__ import annotations

import math
import sys

from . import baseline, corsi, costs, rt, sdt, stats

FAIL = []


def check(name: str, cond: bool, detail: str = "") -> None:
    if not cond:
        FAIL.append(f"{name}: {detail}")


def approx(a, b, tol=1e-12) -> bool:
    if a is None or b is None:
        return a is None and b is None
    return abs(a - b) <= tol


# ---------- estatística básica (mão) ----------
check("median odd", stats.median([3, 1, 2]) == 2)
check("median even", stats.median([1, 2, 3, 4]) == 2.5)
check("median empty", stats.median([]) is None)
check("mean", approx(stats.mean([1, 2, 3]), 2.0))
check("sd n<2", stats.sample_sd([5]) is None)
# 2,4,4,4,5,5,7,9: soma dos quadrados dos desvios = 32; var amostral = 32/7
check("sd hand", approx(stats.sample_sd([2, 4, 4, 4, 5, 5, 7, 9]),
                        math.sqrt(32 / 7)))
# percentil R-7 de [1,2,3,4]: p25 -> idx 0.75 -> 1.75 ; p75 -> idx 2.25 -> 3.25
check("p25 R-7", approx(stats.percentile_r7([1, 2, 3, 4], 25), 1.75))
check("p75 R-7", approx(stats.percentile_r7([1, 2, 3, 4], 75), 3.25))
check("iqr R-7", approx(stats.iqr([1, 2, 3, 4]), 1.5))
check("mad hand", stats.mad([1, 2, 3, 4, 100]) == 1)  # med=3, desvios {2,1,0,1,97}
check("cv", approx(stats.coefficient_of_variation([2, 4, 4, 4, 5, 5, 7, 9]),
                   math.sqrt(32 / 7) / 5))
check("cv mean 0", stats.coefficient_of_variation([-1, 1]) is None)
# z robusto: (120-100)/(1.4826*10) com direção -1 => -1.348940...
check("robust z", approx(stats.robust_z(120, 100, 10, -1),
                         -(20 / 14.826), 1e-12))
check("robust z mad0", stats.robust_z(1, 0, 0, 1) is None)

# ---------- SDT ----------
r = sdt.sdt_metrics(10, 10, 5, 5)  # taxas corrigidas = 0.5 -> d'=0, c=0
check("sdt zero", approx(r["dPrime"], 0.0) and approx(r["criterion"], 0.0))
check("sdt raw rates", approx(r["hitRate"], 0.5) and approx(r["falseAlarmRate"], 0.5))
r = sdt.sdt_metrics(0, 0, 3, 7)  # sem trials de sinal -> d' indefinido
check("sdt no signal", r["dPrime"] is None and r["criterion"] is None)
r = sdt.sdt_metrics(25, 0, 0, 25)  # perfeito: correção evita infinito
check("sdt perfect finite", r["dPrime"] is not None and math.isfinite(r["dPrime"]))
check("sdt perfect symmetric c", approx(r["criterion"], 0.0, 1e-12))
# z(0.75) tabelado = 0.674489750196
from statistics import NormalDist
check("invnorm 0.75", approx(NormalDist().inv_cdf(0.75), 0.6744897501960817, 1e-12))

# ---------- limpeza de RT / acurácia ----------
def _t(cond, exp, act, correct, rt_ms, reason=None, focused=True):
    return {"condition": cond, "expectedResponse": exp, "actualResponse": act,
            "correct": correct, "reactionTimeMs": rt_ms,
            "invalidReason": reason, "windowFocused": focused,
            "visibilityState": "visible"}

trials = [
    _t("go", "space", "space", True, 300),
    _t("go", "space", "space", True, 100),            # antecipação (limiar 150)
    _t("go", "space", "space", True, 2500),           # lapso (limiar 2000)
    _t("go", "space", "", False, None, "omission"),   # omissão
    _t("go", "space", "space", False, 400),           # incorreto (hipotético)
    _t("nogo", "none", "none", True, None),           # rejeição correta
    _t("go", "space", "space", True, 500, None, False),  # sem foco
    _t("go", "space", "space", True, 320),
]
m = rt.rt_metrics(trials, 150, 2000)
check("rt valid count", m["validTrialCount"] == 2, str(m["validTrialCount"]))
check("rt median", approx(m["medianCorrectRT"], (300 + 320) / 2))
check("rt anticipation rate", approx(m["anticipationRate"], 1 / 8))
check("rt lapse rate", approx(m["lapseRate"], 1 / 8))
a = rt.accuracy_metrics(trials)
# corretos = 5 (300,100,2500,nogo,500-sem-foco,320) -> na verdade 6? contar:
# correct=True em: 300, 100, 2500, nogo, 500(sem foco), 320 = 6
check("acc correct", a["correctCount"] == 6, str(a["correctCount"]))
check("acc omissions", a["omissionCount"] == 1, str(a["omissionCount"]))
check("acc errors", a["errorCount"] == 1, str(a["errorCount"]))
check("acc value", approx(a["accuracy"], 6 / 8))

# PES: sequência correta-erro-correta
pes_trials = [
    _t("x", "f", "f", True, 400),
    _t("x", "f", "j", False, 380),
    _t("x", "f", "f", True, 500),
    _t("x", "f", "f", True, 420),
]
check("pes", approx(rt.post_error_slowing(pes_trials), 500 - 420))

# ---------- custos ----------
check("stroop cost", approx(costs.stroop_cost_rt([500, 520, 510], [600, 640, 620]),
                            620 - 510))
check("switch cost", approx(costs.switch_cost_rt([700, 720], [600, 610]),
                            710 - 605))
check("mixing cost", approx(costs.mixing_cost_rt([600, 610], [500, 510]),
                            605 - 505))
check("mixing acc sign", costs.mixing_cost_accuracy_consistent(0.98, 0.90) ==
      -costs.mixing_cost_accuracy_as_production(0.98, 0.90))

# ---------- Corsi ----------
def _c(i, exp, act):
    return {"trialIndex": i, "expectedResponse": exp, "actualResponse": act}

# span2: C,C -> avança 3; span3: C,C -> avança 4; span4: W, C, W, W -> fim
corsi_trials = [
    _c(0, "1,2", "1,2"),
    _c(1, "3,4", "3,4"),
    _c(2, "1,2,3", "1,2,3"),
    _c(3, "4,5,6", "4,5,6"),
    _c(4, "1,2,3,4", "1,9,9,9"),   # prefixo 1
    _c(5, "5,6,7,8", "5,6,7,8"),
    _c(6, "1,3,5,7", "1,3,9,9"),   # prefixo 2
    _c(7, "2,4,6,8", "9,9,9,9"),   # prefixo 0 -> 2 erros seguidos -> fim
]
res = corsi.replay(corsi_trials)
check("corsi confirmed", res["confirmedSpan"] == 4, str(res))
check("corsi max", res["maxSpan"] == 4, str(res))
check("corsi seqs", res["totalCorrectSequences"] == 5)
check("corsi partial", res["partialScore"] == 2 + 2 + 3 + 3 + 1 + 4 + 2 + 0,
      str(res["partialScore"]))
check("corsi items", res["totalItems"] == 2 + 2 + 3 + 3 + 4 + 4 + 4 + 4)
# resposta mais curta correta em prefixo NÃO é acerto
res2 = corsi.replay([_c(0, "1,2", "1")])
check("corsi short not correct", res2["totalCorrectSequences"] == 0
      and res2["partialScore"] == 1)

# ---------- baseline ----------
def _s(i, quality="valid", status="completed", lisdex="unknown", value=None,
       mode="assessment", demo=False, insuff=False):
    return {"sessionId": f"s{i:02d}", "testId": "t", "protocolVersion": "v1",
            "mode": mode, "quality": quality, "isDemo": demo, "status": status,
            "completedAt": f"2026-01-{i + 1:02d}T13:00:00Z",
            "startedAt": f"2026-01-{i + 1:02d}T12:00:00Z",
            "flags": {"insufficientPractice": insuff},
            "lisdexStatus": lisdex,
            "result": {"m": value}}

sessions = [_s(i, value=100 + i) for i in range(12)]
elig = baseline.eligible(sessions, "t", "v1")
check("phase monitoring", baseline.phase_for_count(len(elig)) == "monitoring")
w = baseline.general_window(elig)
check("window ids", [s["sessionId"] for s in w] ==
      [f"s{i:02d}" for i in range(3, 11)], str([s['sessionId'] for s in w]))
ms = baseline.metric_stats(w, "m")
# valores 103..110 -> mediana 106.5, MAD = mediana(|x-106.5|)= mediana{3.5,2.5,1.5,.5,.5,1.5,2.5,3.5}=2.0
check("window median", approx(ms["median"], 106.5))
check("window mad", approx(ms["mad"], 2.0))
z = baseline.primary_z(110.5, "monitoring", ms, -1)
check("z ok", z["kind"] == "ok" and approx(z["z"], -(4.0 / (1.4826 * 2))), str(z))
# direção +1 inverte o sinal
z2 = baseline.primary_z(110.5, "monitoring", ms, 1)
check("z direction", approx(z2["z"], -z["z"]))
# fases anteriores suprimem
check("z not monitoring",
      baseline.primary_z(1, "baseline_building", ms, 1)["kind"] == "not_monitoring")
# n insuficiente
check("z insufficient", baseline.primary_z(
    1, "monitoring", {"median": 1, "mad": 1, "n": 5}, 1)["kind"] == "insufficient_n")
# MAD zero
zm = baseline.primary_z(3, "monitoring", {"median": 2, "mad": 0, "n": 8}, 1)
check("z zero mad", zm["kind"] == "zero_mad" and zm["delta"] == 1)
# janela contextual: só status explícito, após familiarização global
sess_ctx = [_s(i, lisdex=("taken" if i % 2 == 0 else "unknown"), value=i)
            for i in range(12)]
cw = baseline.contextual_window(baseline.eligible(sess_ctx, "t", "v1"), "taken")
check("ctx window excludes unknown/familiarization",
      [s["sessionId"] for s in cw] == ["s04", "s06", "s08", "s10"],
      str([s["sessionId"] for s in cw]))
# inelegíveis nunca entram
sessions_bad = sessions + [_s(20, quality="invalid", value=999),
                           _s(21, demo=True, value=999),
                           _s(22, mode="training", value=999),
                           _s(23, insuff=True, value=999),
                           _s(24, status="interrupted", value=999)]
check("eligibility filters", len(baseline.eligible(sessions_bad, "t", "v1")) == 12)

# ---------- resultado ----------
if FAIL:
    print("SELFTEST FALHOU:")
    for f in FAIL:
        print(" -", f)
    sys.exit(1)
print(f"selftest OK — {0} falhas (todas as verificações passaram)")
