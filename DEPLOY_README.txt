MW DYNASTY — UNIFIED APP V1.2 DEPLOY PREVIEW

LOCKED EXPERIENCE
- ONE MW Dynasty app.
- Opening screen uses the approved Athlete / Coach entry design.
- Public choices: I'M AN ATHLETE and I'M A COACH only.
- No "I'm Both" feature in this release.
- Athlete choice -> Athlete account creation -> Athlete experience.
- Coach choice -> vetted Coach application -> approved Coach sign-in -> Coach experience.

APP ICON
- Approved MW gold/blue shield crest is the app icon / home-screen icon only.

V1.2 DEPLOY HARDENING
- Consolidates all public Node API endpoints behind one Vercel Function gateway.
- Keeps the existing public API URLs unchanged using Vercel rewrites.
- Converts the Coach MW handler to CommonJS so all server handlers use one module format.
- Keeps the Athlete and Coach UI/logic separate while packaging them in one project.
- No destructive database migration is included.

ENVIRONMENT VARIABLES
- OPENAI_API_KEY
- SUPABASE_URL (optional because the production URL is already known by the build)
- SUPABASE_PUBLISHABLE_KEY (recommended)
- Optional OPENAI_MODEL / voice variables remain supported.

DEPLOYMENT
- Upload this ZIP as a new deployment/project.
- Root / is the approved Athlete/Coach role-selection screen.
- /athlete/ is the Athlete experience.
- /coach/ is the Coach experience.
