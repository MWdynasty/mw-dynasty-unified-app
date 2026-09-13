MW Dynasty Coach V11.24 — Live Assigned Athlete Roster + Secure Athlete Workspaces

Built from V11.23.

Coach-to-athlete connection upgrades:
- Coach roster is now live from Supabase and explicitly scoped to active public.coach_assignments for the authenticated coach.
- Founder/Admin roster view remains global for oversight; normal coaches receive assigned athletes only.
- Removed demo athlete fallback from the real Athletes workspace. Zero assignments now shows an honest empty state.
- Dashboard athlete count hydrates from the live authorized roster instead of leaving the demo count as the source of truth.
- Athlete profile workspace now loads the selected athlete's live events, experience level, program week/day/status, starting week, last workout, and PRs.
- Private coach notes now persist to public.coach_notes instead of localStorage.
- Pending athlete invitations are shown in the Athletes workspace for the signed-in coach.
- Attendance now uses the live authorized roster and writes actual athlete IDs through /api/attendance.
- Added /api/athlete for authorization-checked athlete detail and private-note writes.
- Rebuilt /api/roster to resolve explicit active coach assignments first and batch-load live athlete data.
- Fixed Coach MW assignment lookup from coach_id to the real coach_user_id column and limited it to active assignments.

Supabase security/back-end changes applied with this release:
- Added one-active-assignment-per-coach/athlete protection.
- Added authenticated public.mw_accept_coach_invitation(token) RPC. The athlete email, login, expiration, and athlete record are verified before creating an active coach_assignment.
- Direct authenticated UPDATE on coach_invitations was revoked so invitation acceptance goes through the guarded RPC.
- Coach invitation creation is now restricted to active Coach/Admin/Founder accounts creating invitations under their own user ID.

Production boundary:
- The coach roster/profile/PR/note/attendance connection is now backend-backed.
- The athlete app still needs a small UI hook to call mw_accept_coach_invitation when an athlete enters/opens an invitation token. The secure acceptance backend is already live.
- Teams/groups remain a later shared-backend integration and are not used as the roster authorization source in this release.
