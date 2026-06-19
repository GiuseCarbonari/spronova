-- Estende il dossier atleta con i nuovi campi del template Section 11.
-- Tutti opzionali (nullable), nessuna migration distruttiva.

alter table athlete_profiles
  add column if not exists peso_target_kg        numeric,
  add column if not exists fase_corrente         text
    check (fase_corrente in ('aerobic_build','threshold','peak','recovery','maintenance')),
  add column if not exists stile_allenamento     text
    check (stile_allenamento in ('polarized','pyramidal','threshold','mixed')),
  add column if not exists ftp_outdoor_w         integer,
  add column if not exists ftp_indoor_w          integer,
  add column if not exists max_hr               integer,
  add column if not exists threshold_hr          integer,
  add column if not exists lt1_w                 integer,
  add column if not exists lt1_hr                integer,
  add column if not exists lt2_w                 integer,
  add column if not exists lt2_hr                integer,
  add column if not exists bici_outdoor          text,
  add column if not exists piattaforma_indoor    text
    check (piattaforma_indoor in ('zwift','trainerroad','wahoo_systm','rouvy','altro')),
  add column if not exists farmaci_integratori   text;
