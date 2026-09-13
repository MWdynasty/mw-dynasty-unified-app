MW Dynasty Unified App V2.2 — Profile + Coach MW Reliability Fix

Changes from V2.1:
- Athlete Home hero now uses the clean MW sprint athlete artwork rather than a cropped role-selection card.
- Coach MW AI uses a real <img> element with absolute asset paths and fallbacks for reliable rendering on mobile browsers.
- Male and Female Coach MW portraits remain selectable from Athlete Profile.
- Athlete Profile save now uses the protected Supabase RPC mw_update_athlete_profile.
- 60m and 300m PRs now hydrate alongside 100m/200m/400m.
- Profile save shows an explicit success/error status directly beneath the Save button.
- Existing V2.1 stadium-luxe design and backend/auth routing preserved.

Production backend migration applied: athlete_profile_safe_update_rpc
