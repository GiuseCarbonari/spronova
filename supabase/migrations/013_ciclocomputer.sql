-- Aggiunge il campo ciclocomputer al dossier atleta.
-- Valori ammessi: garmin | wahoo | karoo | coros | polar | altro | NULL (non specificato).
alter table athlete_profiles
  add column if not exists ciclocomputer text
    check (ciclocomputer in ('garmin', 'wahoo', 'karoo', 'coros', 'polar', 'altro'));
