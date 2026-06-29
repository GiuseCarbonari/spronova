-- Migration 018: snapshot del piano al momento del push, per il diff "cosa è cambiato".
alter table public.weekly_plans
  add column pushed_snapshot jsonb;

comment on column public.weekly_plans.pushed_snapshot is
  'Copia di sessions (BuiltSession[]) inviata l''ultima volta su Intervals. Base del diff con il piano corrente. NULL = mai inviato.';
