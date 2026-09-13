MW DYNASTY UNIFIED APP V1.0

LOCKED PRODUCT DIRECTION
- One public MW Dynasty app.
- First screen is the approved Athlete / Coach role-selection design.
- No "I'm Both" option.
- Athlete selection -> Athlete account creation.
- Coach selection -> vetted Coach application flow.
- Existing users can sign in as Athlete or Coach from the entry screen.
- Existing Athlete and Coach experiences remain separate after entry.
- One shared Supabase backend; no destructive backend migration is required for this package.
- Coach APIs are namespaced under /api/coach/* so Athlete APIs remain unchanged.

APP ICON
- Uses the approved MW shield/crest crop from the provided source artwork.

ATHLETE SIGNUP
- POSTs directly to Supabase Auth signup.
- Production mw_on_auth_user_created / mw_provision_new_athlete trigger provisions the athlete profile/state.
- Requires 13+ acknowledgement consistent with the current Privacy/Terms.

COACH ONBOARDING
- /coach/?apply=1 opens the existing vetted Coach application.
- Application does not create Coach access. Founder/Admin approval and entitlement remain required.

DEPLOYMENT
- Deploy the contents of this ZIP as one Vercel project.
- Preserve the existing environment variables used by the Athlete and Coach server functions.

QA COMPLETED IN BUILD
- JavaScript syntax checks
- ZIP integrity
- Coach API client paths verified as /api/coach/*
- Root launcher has only Athlete and Coach public role choices
