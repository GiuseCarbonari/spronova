-- ============================================================================
-- Coach IA Endurance — Migration 015: profilo corsa (Modulo Corsa)
--
-- runner_profile_data ospita l'oggetto del Modulo Corsa: CS/D′ (letti da
-- Intervals pace-curves), fit power-law dei regimi <3min e >15min, Record
-- Pace Profile, fenotipo runner, predizioni gara e zone su %CS. Colonna
-- separata da profile_data (che resta il profilo BICI): un atleta può avere
-- entrambi gli sport, e i due profili hanno schema e fonte dati diversi
-- (power-curves vs pace-curves). JSONB perché lo schema evolverà.
-- ============================================================================

alter table public.athlete_profiles
  add column if not exists runner_profile_data jsonb;
