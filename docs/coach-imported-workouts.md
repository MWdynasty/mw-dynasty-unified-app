# Reviewed coach programs

Coach Core and Coach Intelligence use coach-authored programs for daily training and Practice Mode. Existing text-only imports remain editable drafts until the coach builds workout days, checks the prescription, confirms non-timed days, and activates the program.

1. Open My Program and the imported program.
2. Build Workout Days. Review sets, reps, distance, intensity and recovery. Fill missing values; explicitly confirm rest/recovery/lifting days as non-timed.
3. Confirm review. Save Program retains the selected status; Save & Assign saves reviewed days as Active and opens assignment directly.
4. Choose connected athletes or an owned group, with a calendar start date. Missing review items and save/loading failures remain visible beside the actions.
5. Open Train and Practice Mode. Select the assigned timed block, run heats and finish every prescribed rep before saving. Non-timed days remain visible for athlete check-ins.

Week 1 uses the Monday of the chosen start-date week. A Wednesday start begins on Week 1 Wednesday. Future dates, ended programs and unscheduled days do not invent sessions. Timing saves do not rewrite the original prescription or the MW Velocity workout system.

Saved custom times appear in the coach's athlete workspace and the athlete's coach-assigned training/history. Each result preserves the reviewed prescription and revision. A coach's successful save adds a completed coach-program check-in after all timed blocks in that day have been saved. An athlete can separately add their perceived effort and notes.

## Storage and access

Assignments reuse existing ownership and connection policies. Custom results use a separate RLS table with no anonymous access or direct authenticated writes. The save RPC checks the active coach, assignment ownership, athlete connection and target, active reviewed revision, calendar day, block and complete rep set. It saves all rows atomically, serializes retries, and rejects changed retries or completed-result overwrites.

`mw_save_custom_coach_practice` intentionally uses SECURITY DEFINER so one validated transaction can write immutable timing records and the existing RPC-only athlete check-in table. Authenticated execution is intentional; anonymous execution is revoked, the search path is empty, and authorization is checked inside the function. The Supabase advisory for authenticated SECURITY DEFINER execution is expected for this narrowly scoped entry point; see [the advisory guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Verification

`npm test` includes parsing, conservative unknown-format handling, scheduling and custom workout identities. `npm run test:workout-identity-db` includes disposable PostgreSQL and actual Practice UI tests covering assignments, permissions, 16 athletes across four groups with 96 reps, 800-row large blocks, rep/set recovery, draft review, failed saves, immutable retries, athlete history isolation, later-block refresh recovery and completed-workout locks. The existing Velocity, billing, access and shared client tests remain in the regression suite.
