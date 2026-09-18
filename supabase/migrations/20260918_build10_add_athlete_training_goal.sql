alter table public.athletes
  add column if not exists training_goal text;

alter table public.athletes
  drop constraint if exists athletes_training_goal_length_check;

alter table public.athletes
  add constraint athletes_training_goal_length_check
  check (training_goal is null or char_length(training_goal) <= 500);
