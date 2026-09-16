MW Dynasty V3.0.11 – Communication + Billing QA

Changes included:
- Coach Messages redesigned as phone-style inbox + 1:1 thread. Athlete replies now appear in the same coach thread.
- Coach unread athlete replies show a blue unread dot and mark read when the thread opens.
- Team / group announcements are separated from 1:1 messaging.
- Athlete Messages redesigned as inbox + coach conversation thread with replies.
- Message polling refreshes conversations automatically without manual reload.
- Removed the unexplained top-right coach avatar from the dashboard header.
- Coach search remains directly beside the notification bell.
- Added a working athlete search bar and Messages shortcut/badge.
- Global dark-theme readability overrides: primary text white, secondary text light gray, MW accents gold.
- Coach MW Read Aloud + microphone remain enabled; Coach MW visual/voice choice remains in Settings.
- Coach Intelligence rep tracking remains a locked MW Sprint Performance upgrade card.
- V3.0.10 coach invitation email trial flow is preserved.
- Coach billing UI now explains the prorated upgrade amount returned by the live Supabase billing transition function. Upgrades charge only the remaining-period difference; downgrades wait until period end.

Vercel environment variable:
OPENAI_API_KEY only.
