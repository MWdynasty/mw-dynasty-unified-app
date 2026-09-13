MW Dynasty Coach V11.21 — Full Interactive Interfaces

Built from V11.20. V11.19/V11.20 remain untouched.

What changed:
- Replaced toast-only placeholder actions with real interactive workspaces/modals.
- + Add Athlete now opens a secure coach invitation form and writes to public.coach_invitations using the authenticated coach session and RLS.
- Invitation records include coach_user_id, athlete_email, invite_type, pending status, unique token, and 7-day expiration.
- Athletes open profile/note workspaces; live roster is attempted via /api/roster when available.
- Teams open roster/message/attendance workspaces.
- Program editor now saves and previews coach program content.
- Calendar opens event details and supports adding events.
- Meets open editable registration/readiness workspaces.
- Attendance now has a full session form and persistent coach-side record; live athlete-ID sync still depends on connected roster assignments.
- Messages, Help & Support, AI Task Board, AI Season Planner, AI Season Adjustment, and AI Insights now have interactive workflows rather than toast placeholders.
- MW Track Program and Strength & Power expose all 41 week entry points with real detail workspaces; full coach-authored week/session dataset hookup remains a later data-integration step.
- Sprint School and Race Strategy open coach-facing lesson/blueprint workspaces.
- Existing Coach MW AI remains intact.
- Preserves three-program visual identities: Core, Intelligence, Sprint Performance.

Important production boundary:
This build makes every current coach navigation/action interface real and interactive. Some modules persist locally until their dedicated shared-backend tables/workflows are connected. Coach invitations are the first new interface wired directly to Supabase RLS.
