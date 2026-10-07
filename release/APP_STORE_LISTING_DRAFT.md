# MW Dynasty App Store listing — draft, not submitted

Name: MW Dynasty

Subtitle: Train. Track. Coach.

Primary category proposal: Health & Fitness. Secondary category proposal: Sports.

Promotional text: Keep track workouts, strength training and practice results connected. Organize groups and heats, record reps, and review progress with your coach.

Description:

MW Dynasty brings athletes and coaches together around their training. MW Velocity is the proprietary sprint training methodology inside the MW Dynasty ecosystem.

Athletes can use MW Velocity — Athlete to follow track and strength workouts, view the season schedule, and record practice results. Coaches can create named groups, choose athletes, navigate heats, and keep rep timing and recovery separate for each heat. Saved results connect the athlete's profile and coach's dashboard.

Review completed workouts and available performance measures, including timed results when a workout has no pace target. Optional Coach MW helps with training questions and planning. You control whether your content and training context are shared with OpenAI; athletes separately control inclusion of their records in their coach's AI requests.

MW Dynasty is intended for eligible users age 13 and older. Some features require MW Velocity — Athlete, Coach Core, Coach Intelligence, or Coach Velocity membership. Training information supports coaching decisions and is not medical diagnosis or treatment.

Support: https://app.mwdynasty.com/support.html

Privacy: https://app.mwdynasty.com/privacy.html

Terms: https://app.mwdynasty.com/terms.html

Keywords proposal: sprint,track,athlete,coach,practice,strength,training,relay,workout

Icon: use the actual 1024px AppIcon from the native source archive. Confirm opacity and appearance in the signed release build.

Screenshots: not supplied yet. Capture the actual selected iPhone binary with isolated demo data: Athlete Home, Today workout, Coach group/heat timing, saved targetless results, season calendar, and AI sharing choices. Do not substitute website screenshots or generated mockups. Check screenshot dimensions against the device families enabled in App Store Connect.

## Privacy questionnaire working answers

These are source-audit draft answers, not final App Store Connect submissions. Confirm provider retention, enabled production integrations, actual-device behavior and purposes before submission. Optional AI consent does not automatically exempt an ongoing data type from disclosure.

| Apple data type | Current evidence | Draft purpose / identity |
| --- | --- | --- |
| Name, Email Address | Account/profile and authentication | App functionality; linked to user |
| User ID | Account IDs, athlete/coach association, authenticated diagnostics | App functionality; linked to user |
| Fitness | Track times, workouts, weights, strength check-ins, completion, performance | App functionality and product personalization; linked to user |
| Health | User-entered readiness/pain responses | App functionality and product personalization; linked to user; no HealthKit integration identified |
| Emails or Text Messages / Other User Content | Coach messages, AI questions, notes, imported programs | App functionality; linked to user; classify each actual text flow under the correct Apple category |
| Photos or Videos | Optional chosen images sent in AI requests | App functionality; review OpenAI retention and linkage before final answer |
| Customer Support | Issue/support submissions | App functionality; linked when authenticated |
| Purchase History | Provider subscription/transaction/access records | App functionality; linked to user |
| Other Data Types | Date of birth / age eligibility and profile fields not covered above | App functionality; linked to user |
| Performance Data / Other Diagnostic Data | Authenticated launch/sync/network/API event records | App functionality and reliability; linked to user, despite content redaction |
| Product Interaction | App-area/event categories in technical diagnostics | Confirm whether collected events meet this category; native website analytics disabled |
| Precise Location | Distance Marker computes coordinates on device; no coordinate upload identified | Not collected under current source behavior; verify actual build/network |
| Audio Data | Speech/voice paths require actual-device and provider-retention audit | Unfinished; do not select an unsupported final answer |
| Payment Info | Card entry handled by payment providers, not MW | No MW card-number collection identified; purchase history remains disclosed |
| Tracking / Advertising | No cross-company advertising linkage or ad SDK identified; web analytics disabled native | Draft No; validate all native/provider integrations and final binary |

## Rating and review

Complete Apple's current age-rating questionnaire from the actual feature set. Answer messaging/user-generated content and AI features accurately; do not claim parental controls, unrestricted browsing, medical treatment, or a Kids Category app. The 13+ eligibility policy is separate from Apple's calculated regional rating. Review the resulting rating before publishing.

Review notes and acceptance matrix are in APPLE_RELEASE_20261006.md. Supply working isolated coach/athlete credentials securely in App Store Connect, with stable review access and synthetic results. Do not commit credentials. Verify both accounts in the exact release binary before submission.

Official definitions checked October 6, 2026: https://developer.apple.com/app-store/app-privacy-details/ and https://developer.apple.com/app-store/review/guidelines/.
