-- The Science tab's inputs. Four optional things, one deploy.

-- Year of birth and sex, for the formulas that need them: US Navy body-fat,
-- strength standards, DOTS, Mifflin-St Jeor calories. A year rather than a
-- date of birth: none of those formulas care about the month, and a year is
-- less to hold about someone. Both nullable — unset simply hides those cards.
alter table profiles
  add column if not exists birth_year integer;

alter table profiles
  add column if not exists sex text
    check (sex in ('male', 'female', 'other'));

-- Reps in reserve after a set, 0–5, as the lifter judged it. NULL is "not
-- asked", which every row before this migration is; 0 is a real answer
-- (nothing left), so the two must stay distinct.
alter table set_logs
  add column if not exists rir smallint
    check (rir between 0 and 5);

-- The neck as a tape site. The US Navy body-fat estimate is the one formula
-- that needs it. The check list is rebuilt rather than dropped: it still
-- mirrors BodyMetric in lib/types.ts, and a typo in a metric name must still
-- fail here rather than become a series nothing can read.
alter table body_measurements
  drop constraint if exists body_measurements_metric_check;

alter table body_measurements
  add constraint body_measurements_metric_check check (metric in (
    'weight', 'neck', 'shoulders', 'chest', 'waist', 'hips',
    'armL', 'armR', 'thighL', 'thighR', 'calfL', 'calfR'
  ));
