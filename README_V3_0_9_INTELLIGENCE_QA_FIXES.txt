MW Dynasty V3.0.9 — Intelligence QA + Athlete Messaging

Changes
- Platform-wide dark-theme contrast pass: white primary text, readable light secondary text, MW gold accents.
- Coach MW: removed male/female portrait selector from the Intelligence chat screen. Preference now lives in Account Settings.
- Coach MW: added natural Read Aloud using the existing /api/speak endpoint.
- Coach MW: added microphone voice input when the browser supports SpeechRecognition.
- Coach Intelligence: MW Sprint rep tracking is now a compact locked upgrade teaser instead of looking like an inactive feature.
- Athlete app: added a visible Messages card on Home, unread badge, live coach inbox, read-state sync, and replies to coach.
- Athlete messages use existing secured Supabase RPC/RLS flows.
- App version bumped to 3.0.9.

QA notes
- Test Coach Intelligence first.
- Confirm Coach MW Read Aloud and microphone.
- Confirm athlete sees the existing unread coach message and can reply.
- Rep tracking must remain unavailable to Coach Intelligence and available only to MW Sprint Performance.
