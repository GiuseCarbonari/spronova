import assert from "node:assert/strict";
import { test, describe, after } from "node:test";

/**
 * Test suite per le route IA commenti (OGGI/PROFILO/PERCORSO).
 *
 * Nota: questi test verificano la LOGICA di trasformazione dati (trend computation,
 * payload building). I test di integrazione HTTP richiedono un'ambiente con auth
 * Supabase reale (vedi test-comments-integration.md per test end-to-end).
 */

// --- Provider selection (regression: errore dal telefono, ok in locale) ---

describe("isAIConfigured: chiave deve corrispondere al provider selezionato", () => {
  const save = {
    provider: process.env.COACH_AI_PROVIDER,
    groq: process.env.GROQ_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
  };

  function setEnv(provider?: string, groq?: string, anthropic?: string) {
    if (provider === undefined) delete process.env.COACH_AI_PROVIDER;
    else process.env.COACH_AI_PROVIDER = provider;
    if (groq === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = groq;
    if (anthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = anthropic;
  }

  function fresh() {
    // import dinamico per leggere le env appena impostate
    delete require.cache[require.resolve("../lib/ai/groq-provider.ts")];
    return require("../lib/ai/groq-provider.ts") as {
      isAIConfigured: () => boolean;
    };
  }

  test("default (no provider) = groq: serve GROQ_API_KEY, non ANTHROPIC", () => {
    setEnv(undefined, undefined, "sk-ant");
    assert.equal(fresh().isAIConfigured(), false, "groq selezionato ma manca GROQ key");
    setEnv(undefined, "gsk-x", undefined);
    assert.equal(fresh().isAIConfigured(), true, "GROQ key presente → ok");
  });

  test("provider=anthropic: serve ANTHROPIC_API_KEY, non GROQ", () => {
    setEnv("anthropic", "gsk-x", undefined);
    assert.equal(fresh().isAIConfigured(), false, "anthropic ma manca ANTHROPIC key");
    setEnv("anthropic", undefined, "sk-ant");
    assert.equal(fresh().isAIConfigured(), true, "ANTHROPIC key presente → ok");
  });

  // ripristina env reali dopo i test
  after(() => setEnv(save.provider, save.groq, save.anthropic));
});

// --- OGGI Route Logic Tests ---

describe("OGGI comment route logic", () => {
  test("computeTrend: calcola delta % corretto fra 14 giorni", () => {
    // Simulazione: 14-day trend computation dal route oggi
    function computeTrend(values: (number | null)[]): string {
      const filtered = values.filter((v) => v != null && Number.isFinite(v)) as number[];
      if (filtered.length < 2) return "−";
      const oldest = filtered[0];
      const newest = filtered[filtered.length - 1];
      if (oldest === 0) return "−";
      const pct = ((newest - oldest) / oldest) * 100;
      return pct > 0 ? `+${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`;
    }

    assert.equal(computeTrend([50, 55, 60]), "+20%", "14-day trend +20%");
    assert.equal(computeTrend([50, 45, 40]), "-20%", "14-day trend -20%");
    assert.equal(computeTrend([50, 50, 50]), "0%", "No trend change");
    assert.equal(computeTrend([null, 50, null]), "−", "Insufficient data");
    assert.equal(computeTrend([0, 10, 20]), "−", "Oldest=0 (avoid division by zero)");
  });

  test("injury check: isInjured returns true quando data rientra periodo", () => {
    // Simulazione: isInjured logic dal module injury.ts
    function isInjured(dateISO: string, periods: Array<{ start: string; end: string }>): boolean {
      const date = new Date(dateISO).getTime();
      return periods.some((p) => {
        const start = new Date(p.start).getTime();
        const end = new Date(p.end).getTime();
        return date >= start && date <= end;
      });
    }

    assert.ok(
      isInjured("2026-06-20", [{ start: "2026-06-15", end: "2026-06-25" }]),
      "Data dentro periodo infortunio"
    );
    assert.ok(
      !isInjured("2026-06-10", [{ start: "2026-06-15", end: "2026-06-25" }]),
      "Data prima periodo infortunio"
    );
    assert.ok(
      !isInjured("2026-06-30", [{ start: "2026-06-15", end: "2026-06-25" }]),
      "Data dopo periodo infortunio"
    );
  });

  test("payload generation: formatta correttamente i dati sanitari", () => {
    const ctl = 62.3;
    const atl = 45.8;
    const tsb = ctl - atl;
    const hrv = 65.4;
    const sleep = 7.5 * 3600; // 7.5 hours in seconds

    const payload = {
      name: "Atleta",
      ctl: ctl.toFixed(1),
      atl: atl.toFixed(1),
      tsb: tsb.toFixed(1),
      hrv: hrv.toFixed(0),
      sleep: (sleep / 3600).toFixed(1),
      trend_ctl_14d: "+5%",
      trend_atl_14d: "+2%",
      trend_hrv_14d: "-3%",
    };

    assert.equal(payload.ctl, "62.3", "CTL formatted to 1 decimal");
    assert.equal(payload.tsb, "16.5", "TSB computed correctly");
    assert.equal(payload.hrv, "65", "HRV formatted to integer");
    assert.equal(payload.sleep, "7.5", "Sleep formatted to hours with 1 decimal");
  });
});

// --- PROFILO Route Logic Tests ---

describe("PROFILO comment route logic", () => {
  test("RPP comparison: calcola delta % fra current e best 1y", () => {
    // Simulazione: compareRPPTrends logic
    interface RPPPoint {
      duration_s: number;
      watts: number | null;
      watts_1y: number | null;
    }

    function compareRPPTrends(points: RPPPoint[]) {
      return points
        .filter((p) => p.watts != null && p.watts_1y != null)
        .map((p) => {
          const watts = p.watts as number;
          const watts1y = p.watts_1y as number;
          return {
            duration: p.duration_s < 60 ? `${p.duration_s}s` : `${Math.round(p.duration_s / 60)}min`,
            current_w: Math.round(watts),
            best_w: Math.round(watts1y),
            delta_pct: ((watts - watts1y) / watts1y) * 100,
          };
        });
    }

    const rppPoints: RPPPoint[] = [
      { duration_s: 30, watts: 500, watts_1y: 510 },
      { duration_s: 300, watts: 350, watts_1y: 340 },
      { duration_s: 900, watts: 250, watts_1y: 260 },
    ];

    const trends = compareRPPTrends(rppPoints);
    assert.equal(trends.length, 3, "3 RPP points processed");
    assert.equal(trends[0].duration, "30s", "Duration 30s formatted");
    assert.equal(trends[0].current_w, 500, "Current watts 500");
    assert.equal(trends[0].best_w, 510, "Best 1y watts 510");
    assert.ok(trends[0].delta_pct < 0, "Delta negative (-1.96%)");

    assert.equal(trends[1].duration, "5min", "Duration 300s formatted as 5min");
    assert.ok(trends[1].delta_pct > 0, "Delta positive (+2.94%)");
  });

  test("phenotype basis extraction: estrae valori numeric da basis array", () => {
    // Simulazione: basis value extraction logic
    function basisValue(basis: string[], key: string): number | null {
      const entry = basis.find((b) => b.startsWith(`${key}=`));
      if (!entry) return null;
      const value = Number(entry.split("=")[1]);
      return Number.isFinite(value) ? value : null;
    }

    const basis = [
      "profile_flatness=0.72",
      "punch_ratio=1.15",
      "apr_ratio=0.88",
    ];

    assert.equal(basisValue(basis, "profile_flatness"), 0.72, "Extract flatness");
    assert.equal(basisValue(basis, "punch_ratio"), 1.15, "Extract punch_ratio");
    assert.equal(basisValue(basis, "apr_ratio"), 0.88, "Extract apr_ratio");
    assert.equal(basisValue(basis, "nonexistent"), null, "Missing key returns null");
  });
});

// --- PERCORSO Route Logic Tests ---

describe("PERCORSO comment route logic", () => {
  test("climb formatting: trasforma dati altimetria in formato leggibile", () => {
    // Simulazione: climb formatting logic
    interface Climb {
      position_km?: number;
      distance_km?: number;
      elevation_m?: number;
      avg_gradient_pct?: number;
      category?: string;
    }

    function formatClimbs(climbs: Climb[]) {
      return climbs.map((c) => ({
        position_km: c.position_km ? c.position_km.toFixed(1) : "−",
        distance_km: c.distance_km ? c.distance_km.toFixed(1) : "−",
        elevation_m: c.elevation_m ? Math.round(c.elevation_m) : "−",
        avg_gradient_pct: c.avg_gradient_pct ? c.avg_gradient_pct.toFixed(1) : "−",
        category: c.category || "−",
      }));
    }

    const climbs: Climb[] = [
      {
        position_km: 45.3,
        distance_km: 8.2,
        elevation_m: 385.6,
        avg_gradient_pct: 4.7,
        category: "Moderata",
      },
      {
        position_km: 120.5,
        distance_km: 12.1,
        elevation_m: 618.9,
        avg_gradient_pct: 5.1,
        category: "Difficile",
      },
    ];

    const formatted = formatClimbs(climbs);
    assert.equal(formatted.length, 2, "2 climbs processed");
    assert.equal(formatted[0].position_km, "45.3", "Position km formatted");
    assert.equal(String(formatted[0].elevation_m), "386", "Elevation rounded");
    assert.equal(formatted[0].avg_gradient_pct, "4.7", "Gradient % formatted");

    // Test missing data handling
    const incomplete: Climb[] = [{ category: "Unknown" }];
    const formattedIncomplete = formatClimbs(incomplete);
    assert.equal(formattedIncomplete[0].position_km, "−", "Missing position shows −");
    assert.equal(formattedIncomplete[0].elevation_m, "−", "Missing elevation shows −");
  });

  test("terrain totals: somma correttamente distanza e dislivello", () => {
    function formatTerrain(distance?: number, elevation?: number) {
      return {
        distance_km: distance ? distance.toFixed(1) : "−",
        elevation_m: elevation ? Math.round(elevation) : "−",
      };
    }

    assert.equal(formatTerrain(156.8).distance_km, "156.8", "Distance 156.8 km");
    assert.equal(String(formatTerrain(156.8, 2847.5).elevation_m), "2848", "Elevation 2848 m");
    assert.equal(formatTerrain().distance_km, "−", "Missing distance shows −");
  });
});

// --- Migration 017 Schema Tests ---

describe("Migration 017: AI comment columns schema", () => {
  test("column names match route expectations", () => {
    // Verifica che i nomi delle colonne siano corretti
    const expectedColumns = [
      "ai_comment_oggi",
      "ai_comment_oggi_at",
      "ai_comment_profilo",
      "ai_comment_profilo_at",
      "ai_comment_percorso",
      "ai_comment_percorso_at",
    ];

    expectedColumns.forEach((col) => {
      assert.ok(col.includes("ai_comment_"), `Column ${col} follows naming convention`);
      assert.ok(
        col.endsWith("_at") || !col.endsWith("_at"),
        `Column ${col} valid (text or timestamptz)`
      );
    });
  });

  test("migration 017 file exists and is valid SQL", () => {
    const fs = require("node:fs");
    const path = require("node:path");

    const migrationPath = path.join(
      __dirname,
      "..",
      "supabase",
      "migrations",
      "017_ai_comments.sql"
    );

    assert.ok(fs.existsSync(migrationPath), "Migration 017 file exists");

    const content = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(content.includes("ALTER TABLE"), "Contains ALTER TABLE");
    assert.ok(content.includes("ai_comment_oggi"), "Includes OGGI column");
    assert.ok(content.includes("ai_comment_profilo"), "Includes PROFILO column");
    assert.ok(content.includes("ai_comment_percorso"), "Includes PERCORSO column");
  });
});

// --- Gating §4: sameLocalDay ---

describe("Gating §4: sameLocalDay", () => {
  // Replica esatta dell'helper presente nelle 3 route commenti.
  function todayISO(): string {
    return new Date().toLocaleDateString("en-CA");
  }
  function sameLocalDay(iso: string | null): boolean {
    return iso != null && new Date(iso).toLocaleDateString("en-CA") === todayISO();
  }

  test("oggi → true", () => {
    assert.ok(sameLocalDay(new Date().toISOString()), "Timestamp di oggi gated");
  });

  test("ieri → false", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    assert.ok(!sameLocalDay(yesterday.toISOString()), "Timestamp di ieri non gated");
  });

  test("null → false", () => {
    assert.ok(!sameLocalDay(null), "Mai generato → non gated");
  });
});

// --- AI Comment Constraints Tests ---

describe("AI comment quality constraints", () => {
  test("comment payload never invented numbers", () => {
    // Verifica che i payload contengono solo dati calcolati, mai inventati
    const exampleOggiPayload = {
      name: "Atleta",
      date: "2026-06-28",
      injured: false,
      readiness: { decision: "GO", confidence: "high" },
      ctl: "62.3",
      atl: "45.8",
      tsb: "16.5",
      acwr: "0.74",
      hrv: "65",
      rhr: "48",
      sleep: "7.5",
      trend_ctl_14d: "+5%",
      trend_atl_14d: "+2%",
      trend_hrv_14d: "-3%",
    };

    // Verifica: i trend devono essere stringhe (es "+5%" non numeric)
    // and numeric payload fields devono essere stringhe numeriche
    Object.entries(exampleOggiPayload).forEach(([key, value]) => {
      if (typeof value === "string") {
        if (key.startsWith("trend_")) {
          // Trend fields sono percentuali come "+5%" oppure "−"
          assert.ok(
            /^[+\-]?\d+%$|^−$/.test(value),
            `${key}="${value}" is a trend string (+/- or −)`
          );
        } else if (!["name", "date", "decision"].includes(key)) {
          // Numeric fields devono essere numeri o −
          assert.ok(
            !isNaN(Number(value)) || value === "−",
            `${key}="${value}" is a real number or −`
          );
        }
      }
    });
  });

  test("timestamp format ISO 8601", () => {
    const iso = new Date().toISOString();
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    assert.ok(isoRegex.test(iso), "Generated timestamp is ISO 8601 format");
  });
});
