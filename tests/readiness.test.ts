import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeReadiness,
  computeReadinessScore,
  computeRecoveryIndex,
  riConsecutiveDaysBelow,
  type ReadinessInputDay,
} from "../lib/readiness";

/**
 * Test della priority ladder P0–P3 (PRD §14.5).
 * computeReadiness è pura: questi test fissano il comportamento atteso
 * della decisione per ogni gradino della ladder.
 */

/** Giorno wellness "sano" di default; i test sovrascrivono solo ciò che serve. */
function day(overrides: Partial<ReadinessInputDay> = {}): ReadinessInputDay {
  return {
    date: "2026-06-12",
    ctl: 60,
    atl: 60, // TSB 0, ACWR 1.0
    restingHR: 48,
    hrv: 70,
    sleepSecs: 8 * 3600,
    ...overrides,
  };
}

/** Baseline 7g identica al giorno corrente (nessuna deviazione). */
function history(overrides: Partial<ReadinessInputDay> = {}): ReadinessInputDay[] {
  return Array.from({ length: 7 }, (_, i) =>
    day({ date: `2026-06-0${i + 1}`, ...overrides })
  );
}

test("P3: tutto verde → GO", () => {
  const result = computeReadiness(day(), history());
  assert.equal(result.decision, "GO");
  assert.equal(result.priority, 3);
  assert.equal(result.confidence, "high");
});

test("P0: Recovery Index < 0.6 → SKIP non negoziabile", () => {
  const result = computeReadiness(day(), history(), { recoveryIndex: 0.55 });
  assert.equal(result.decision, "SKIP");
  assert.equal(result.priority, 0);
});

test("P0: alarm tier-1 attivo → SKIP", () => {
  const result = computeReadiness(day(), history(), { tier1AlarmActive: true });
  assert.equal(result.decision, "SKIP");
  assert.equal(result.priority, 0);
});

test("P1 skip: ACWR ≥ 1.5 → SKIP", () => {
  // atl 90 / ctl 58 ≈ 1.55
  const result = computeReadiness(day({ ctl: 58, atl: 90 }), history());
  assert.equal(result.decision, "SKIP");
  assert.equal(result.priority, 1);
});

test("P1 skip: TSB < −30 con HRV ↓ > 10% → SKIP", () => {
  // ctl 60, atl 92 → TSB −32; HRV 60 vs baseline 70 → ↓14%.
  // ACWR 1.53 farebbe già scattare P1: si abbassa atl mantenendo TSB < −30
  // alzando ctl. ctl 100, atl 132 → TSB −32, ACWR 1.32 (sotto 1.5)…
  // ACWR 1.32 ≥ 1.3 scatterebbe comunque P1-modify DOPO il check skip:
  // l'ordine first-match della ladder rende il caso valido per lo skip.
  const result = computeReadiness(
    day({ ctl: 100, atl: 132, hrv: 60 }),
    history()
  );
  assert.equal(result.decision, "SKIP");
  assert.equal(result.priority, 1);
});

test("P1 modify: ACWR ≥ 1.3 → MODIFY", () => {
  // atl 80 / ctl 60 ≈ 1.33, TSB −20 (zona normale, non è lui a decidere)
  const result = computeReadiness(day({ ctl: 60, atl: 80 }), history());
  assert.equal(result.decision, "MODIFY");
  assert.equal(result.priority, 1);
});

test("Regola TSB: −20 da solo NON genera MODIFY/SKIP", () => {
  // TSB −20 ma ACWR sotto 1.3: ctl 100, atl 120 → TSB −20, ACWR 1.2.
  // Un solo segnale ambra (TSB) non basta per P2 → GO.
  const result = computeReadiness(day({ ctl: 100, atl: 120 }), history());
  assert.equal(result.decision, "GO");
  assert.equal(result.priority, 3);
});

test("P2: 2 segnali rossi → SKIP", () => {
  // Sonno 4h (rosso) + RHR +6 bpm (rosso); carico neutro.
  const result = computeReadiness(
    day({ sleepSecs: 4 * 3600, restingHR: 54 }),
    history({ restingHR: 48 })
  );
  assert.equal(result.decision, "SKIP");
  assert.equal(result.priority, 2);
});

test("P2: 2 segnali ambra → MODIFY", () => {
  // Sonno 6h (ambra) + RHR +3 bpm (ambra); carico neutro.
  const result = computeReadiness(
    day({ sleepSecs: 6 * 3600, restingHR: 51 }),
    history({ restingHR: 48 })
  );
  assert.equal(result.decision, "MODIFY");
  assert.equal(result.priority, 2);
});

test("Dati assenti: GO con confidence low e segnali unavailable", () => {
  const result = computeReadiness(null, []);
  assert.equal(result.decision, "GO");
  assert.equal(result.priority, 3);
  assert.equal(result.confidence, "low");
  assert.ok(result.signals.every((s) => s.status === "unavailable"));
});

test("Fallback HRV: senza baseline il segnale HRV è unavailable", () => {
  // Storico senza HRV → niente baseline → segnale non classificabile.
  const result = computeReadiness(day(), history({ hrv: null }));
  const hrvSignal = result.signals.find((s) => s.name === "hrv");
  assert.equal(hrvSignal?.status, "unavailable");
});

test("Readiness usa SDNN quando è il protocollo selezionato", () => {
  const today = day({ hrv: null, hrvSDNN: 50 });
  const baseline = history({ hrv: null, hrvSDNN: 70 });
  const result = computeReadiness(today, baseline, { hrvProtocol: "sdnn" });
  const hrvSignal = result.signals.find((signal) => signal.name === "hrv");

  assert.equal(hrvSignal?.status, "red");
  assert.match(hrvSignal?.detail ?? "", /HRV SDNN/);
});

test("Readiness score: GO, MODIFY e SKIP restano nelle bande operative", () => {
  const go = computeReadiness(day(), history());
  const modify = computeReadiness(day({ ctl: 60, atl: 80 }), history());
  const skip = computeReadiness(day(), history(), { recoveryIndex: 0.55 });

  assert.ok(computeReadinessScore(go) >= 70);
  assert.ok(computeReadinessScore(modify) >= 40);
  assert.ok(computeReadinessScore(modify) <= 69);
  assert.ok(computeReadinessScore(skip) <= 39);
});

test("Readiness score: pochi dati abbassano un GO senza cambiare decisione", () => {
  const result = computeReadiness(null, []);

  assert.equal(result.decision, "GO");
  assert.equal(computeReadinessScore(result), 70);
});

// --- Recovery Index calcolato internamente -----------------------------------

test("computeRecoveryIndex: formula corretta (HRV↑ RHR↓ → RI > 1)", () => {
  // HRV oggi 77 vs baseline 70 (+10%), RHR oggi 46 vs baseline 48 (−4%):
  // RI = (77/70) / (46/48) ≈ 1.1 / 0.958 ≈ 1.15
  const ri = computeRecoveryIndex(77, 46, 70, 48);
  assert.ok(ri != null && ri > 1.0, `atteso RI > 1, ottenuto ${ri}`);
});

test("computeRecoveryIndex: HRV↓ RHR↑ → RI < 1", () => {
  // HRV oggi 60 vs baseline 70 (↓14%), RHR oggi 52 vs baseline 48 (+8%):
  // RI = (60/70) / (52/48) ≈ 0.857 / 1.083 ≈ 0.79
  const ri = computeRecoveryIndex(60, 52, 70, 48);
  assert.ok(ri != null && ri < 1.0, `atteso RI < 1, ottenuto ${ri}`);
});

test("computeRecoveryIndex: null se mancano dati", () => {
  assert.equal(computeRecoveryIndex(null, 48, 70, 48), null);
  assert.equal(computeRecoveryIndex(70, null, 70, 48), null);
  assert.equal(computeRecoveryIndex(70, 48, null, 48), null);
  assert.equal(computeRecoveryIndex(70, 48, 70, null), null);
  assert.equal(computeRecoveryIndex(70, 48, 0, 48), null); // baseline 0
});

test("riConsecutiveDaysBelow: conta giorni consecutivi finali", () => {
  // storico [0.75, 0.65, 0.68] + oggi 0.66 → 3 giorni sotto 0.7
  assert.equal(riConsecutiveDaysBelow(0.66, [0.75, 0.65, 0.68]), 3);
  // storico [0.65, 0.80, 0.65] + oggi 0.66 → solo 2 giorni finali
  assert.equal(riConsecutiveDaysBelow(0.66, [0.65, 0.80, 0.65]), 2);
  // oggi 0.80 → 0 giorni
  assert.equal(riConsecutiveDaysBelow(0.80, [0.65, 0.65]), 0);
});

test("RI interno: calcolato da HRV+RHR quando extras.recoveryIndex è assente", () => {
  // HRV oggi 60 vs baseline 70 (↓14%), RHR +4 bpm → RI < 1 ma > 0.6
  const today = day({ hrv: 60, restingHR: 52 });
  const base = history({ hrv: 70, restingHR: 48 });
  const result = computeReadiness(today, base);
  const riSignal = result.signals.find((s) => s.name === "ri");
  assert.ok(riSignal?.value != null, "RI deve essere calcolato internamente");
  assert.match(riSignal?.detail ?? "", /da HRV\+RHR/);
});

test("RI interno: primo giorno < 0.7 NON triggera P1 (Section 11 persistence rule)", () => {
  // HRV −10% (amber, non red), RHR +2 bpm (green): RI ≈ 0.85/1.04 ≈ 0.82
  // Un solo giorno con RI < 0.7 non basta per P1; usiamo valori che portino
  // RI sotto 0.7 senza innescare altri segnali rossi.
  // HRV oggi 63 vs baseline 70 (↓10% = amber), RHR oggi 57 vs baseline 48 (+9 = red)
  // → 1 red solo (RHR): P2 non scatta (serve 2 red). RI = (63/70)/(57/48) ≈ 0.9/1.19 ≈ 0.76.
  // RI ≥ 0.7 in questo caso → segnale green. Usiamo valori che abbassano RI < 0.7
  // senza aggiungere un secondo red: HRV 63 vs 70 (amber), RHR 53 vs 48 (+5 = red) → 1 red.
  // RI = (63/70)/(53/48) = 0.9/1.104 ≈ 0.815 → ancora > 0.7.
  // Per avere RI < 0.7 senza 2 red: usiamo carico normale (TSB/ACWR ok),
  // HRV amber, RHR amber: HRV 63 (amber), RHR 51 (+3 amber).
  // RI = (63/70)/(51/48) = 0.9/1.0625 ≈ 0.847 → ancora > 0.7.
  // Ci vuole un drop più marcato mantenendo RHR sotto red:
  // HRV 56 (↓20% → rosso!), RHR 50 (+2 green): RI = (56/70)/(50/48) = 0.8/1.04 ≈ 0.77.
  // Questo ci dà RI < 0.8 ma > 0.7: solo green per RI, 1 red per HRV → P2 no.
  // Ma HRV ↓20% = esattamente al confine red (>20% = red). Usiamo ↓19%: HRV 57.
  // RI = (57/70)/(50/48) = 0.814/1.042 ≈ 0.78 → green RI. Testiamo la persistenza rule
  // con un RI esplicitamente < 0.7 passato via extras.recoveryIndex per isolare il caso.
  const result = computeReadiness(day(), history(), { recoveryIndex: 0.68 }); // RI < 0.7
  // Senza riHistory → 1 solo giorno → NON deve triggerare P1
  const riSignal = result.signals.find((s) => s.name === "ri");
  assert.equal(riSignal?.status, "green"); // primo giorno sotto 0.7: monitorare, non amber
  assert.notEqual(result.priority, 1); // non P1
});

test("RI interno: 2+ giorni consecutivi < 0.7 → P1 SKIP", () => {
  // RI 0.68 oggi + 2 giorni storici < 0.7 → P1 SKIP.
  // Usiamo recoveryIndex esterno per isolare il test dal calcolo interno.
  const result = computeReadiness(day(), history(), {
    recoveryIndex: 0.68,
    riHistory: [0.65, 0.66], // 2 giorni precedenti sotto 0.7
  });
  assert.equal(result.decision, "SKIP");
  assert.equal(result.priority, 1);
});
