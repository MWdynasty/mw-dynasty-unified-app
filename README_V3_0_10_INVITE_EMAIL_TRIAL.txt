MW Dynasty V3.0.10 – Invite Email Trial

- Coach invitation endpoint now sends a Supabase Auth magic-link email after creating/reusing the secure MW invitation.
- Email link returns to the athlete app with the MW invite token.
- Athlete app captures the Supabase Auth session from the email redirect and then automatically accepts the coach invitation.
- Coach-sponsored invites activate athlete access without external payment during QA; future provider billing remains separate.
- Backup invite link and code remain available.

QA: use a new email address and choose Coach Sponsored. The invited athlete should receive email, click it, land in MW Athlete, and become connected/active.
