# MW Dynasty — App Store Submission Packet

Prepared for MW Dynasty 3.0.16 (Build 13)
Bundle ID: `com.mwdynasty.app`

## Product Page

**App Name**  
MW Dynasty

**Subtitle**  
Sprint Training & Coach Tools

**Primary Category**  
Sports

**Secondary Category**  
Health & Fitness

**Promotional Text**  
Sprint training, strength development, individualized pacing, athlete progress, Coach MW, and professional coaching tools in one performance system.

**Keywords**  
speed,sprinting,track,100m,200m,400m,strength,pacing,athlete,workout,performance

**Marketing URL**  
https://mwdynasty.com/

**Support URL**  
https://mwdynasty.com/support.html

**Privacy Policy URL**  
https://mwdynasty.com/privacy.html

**Terms of Use URL**  
https://mwdynasty.com/terms.html

## App Description

MW Dynasty is a sprint-performance ecosystem built for athletes and coaches.

Athletes can follow structured sprint and strength training, understand the purpose behind the work, track progress, use individualized pacing tools, measure training distances, and ask Coach MW for help understanding technique, recovery, race strategy, strength, and training execution.

Coaches can organize athletes, manage teams and programs, track attendance and athlete activity, communicate with athletes, review performance signals, and use Coach MW to support coaching decisions. Higher Coach tiers add roster intelligence and the complete MW Sprint Performance System.

ATHLETE EXPERIENCE
• Progressive sprint-performance training
• Synchronized Strength & Power work
• Athlete profile, personal records, goals, and progress
• Pace targets based on athlete performance data
• Distance measurement tools
• Workout completion and pace check-ins
• Sprint School education
• Coach MW guidance
• Coach messaging and sponsored-athlete access

COACH EXPERIENCE
• Athlete and team management
• Program and assignment tools
• Attendance, meets, and communication
• Coach-sponsored athlete access
• Athlete-status monitoring
• Coach MW coaching intelligence
• AI-supported prioritization on eligible plans
• Full 41-week MW sprint system on Sprint Performance

MW Dynasty is designed for athletes age 13 and older. Training guidance is educational sports-performance information and is not medical diagnosis or treatment.

Subscriptions are available for individual athletes and coaches. Features available to a coach-sponsored athlete depend on the sponsoring Coach membership.

## Auto-Renewable Subscriptions

### Athlete subscription group
**Group Reference Name:** Athlete Membership  
**Suggested Group Display Name:** Athlete Performance Membership

**Product**
- Reference Name: MW Athlete Monthly
- Product ID: `com.mwdynasty.app.athlete.monthly`
- Display Name: Athlete Membership
- Duration: 1 month
- U.S. launch price: $19/month
- IAP Description: Complete MW sprint-performance training.

### Coach subscription group
**Group Reference Name:** Coach Membership  
**Suggested Group Display Name:** Coach Memberships

Rank from highest service level to lowest:

**Level 1**
- Reference Name: MW Sprint Performance Monthly
- Product ID: `com.mwdynasty.app.coach.sprintperformance.monthly`
- Display Name: Sprint Performance
- Duration: 1 month
- U.S. launch price: $109/month
- IAP Description: Complete MW sprint, strength, and coaching.

**Level 2**
- Reference Name: Coach Intelligence Monthly
- Product ID: `com.mwdynasty.app.coach.intelligence.monthly`
- Display Name: Coach Intelligence
- Duration: 1 month
- U.S. launch price: $79/month
- IAP Description: Coach tools with roster intelligence and AI.

**Level 3**
- Reference Name: Coach Core Monthly
- Product ID: `com.mwdynasty.app.coach.core.monthly`
- Display Name: Coach Core
- Duration: 1 month
- U.S. launch price: $49/month
- IAP Description: Roster, program, and communication tools.

For all four subscriptions:
- Auto-renewable subscription.
- Disable Apple's multiseat purchase option for the initial MW launch.
- Do not enable Family Sharing for launch.
- No introductory offer for initial launch unless intentionally added later.

## App Store Server Configuration

**Production Server Notification URL**  
https://keqgunlfwhjgcsurynef.supabase.co/functions/v1/mw-apple-server-notifications

**Sandbox Server Notification URL**  
https://keqgunlfwhjgcsurynef.supabase.co/functions/v1/mw-apple-server-notifications

Use App Store Server Notifications **Version 2**.

The server also requires:
- `APPLE_IAP_ISSUER_ID`
- `APPLE_IAP_KEY_ID`
- `APPLE_IAP_PRIVATE_KEY`
- `APPLE_BUNDLE_ID=com.mwdynasty.app`

## App Review Notes — Draft

MW Dynasty has two authenticated experiences: Athlete and Coach.

Athlete:
1. Sign in with the Athlete review account.
2. Athlete membership can be purchased with Apple's In-App Purchase.
3. The Athlete app includes training, strength, pacing, progress, Coach MW, messages, account settings, and in-app account deletion.

Coach:
1. Sign in with the pre-approved Coach review account.
2. Coach membership can be purchased with Apple's In-App Purchase.
3. Coach subscription upgrades/downgrades are managed by Apple's subscription-management UI.
4. Coach-sponsored athlete billing is not offered as an external checkout inside the iPhone app.

Permissions:
- Location is requested only when the user starts GPS distance measurement.
- Microphone/speech recognition are requested only when the user starts voice input.
- Camera/photo access is requested only when the user chooses an image.
- Normal app use does not require background location.

Account deletion is available inside both Athlete and Coach account/settings areas. Apple-billed subscriptions can be managed through Apple's subscription-management UI.

**App Review credentials still required before submission**
- Athlete review email: TO ADD
- Athlete review password: TO ADD
- Coach review email: TO ADD
- Coach review password: TO ADD

## App Privacy Questionnaire — Working Draft

Confirm every item in App Store Connect against production behavior before submission.

Likely data linked to the user's account:
- Name
- Email address
- User/account identifier
- Purchase/subscription status
- Athlete profile and fitness/training information
- Workout completion and performance information
- Coach/athlete messages
- Support requests
- User-submitted text and images sent to Coach MW

Primary purposes:
- App functionality
- Account authentication
- Personalization of training/coaching features
- Customer support
- Security and fraud prevention

Precise GPS coordinates used by the Distance Marker are processed for active distance measurement and, according to the production privacy policy, are not stored on MW servers. Do not mark precise location as collected unless production behavior changes.

MW states that it does not sell personal information and does not use app data for cross-company advertising tracking.

## Final Manual App Store Connect Gates

Before Submit for Review:
- Apple Developer agreements/tax/banking accepted and active.
- Build 13 uploaded and processing successfully.
- All four subscriptions show Ready to Submit/Approved as applicable.
- Subscription review screenshots uploaded.
- App screenshots uploaded for required iPhone display sizes.
- App Privacy questionnaire completed.
- Age Rating questionnaire completed.
- Content Rights completed.
- Export Compliance completed.
- U.S. availability selected for the initial launch unless a wider launch is intentionally chosen.
- Billing Grace Period tested in Sandbox before Production.
- Review credentials entered.
- Review contact entered.
- Support page contains an actual reachable support contact method.
- No placeholder text remains.
