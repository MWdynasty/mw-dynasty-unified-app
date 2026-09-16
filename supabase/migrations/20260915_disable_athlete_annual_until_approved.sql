-- MW Dynasty pricing source-of-truth correction.
-- Athlete annual billing is intentionally disabled until the Founder explicitly approves an annual price.
update public.membership_plans
set annual_enabled = false,
    annual_price_cents = null,
    updated_at = now()
where plan_code = 'mw_athlete';
