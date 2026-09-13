MW Dynasty Coach V11.20 — Coach MW AI upgrade
Base: approved Coach V11.19. Approved Core / Intelligence / Sprint Performance designs preserved.

Coach MW now uses:
- GPT-5.6 Sol default
- medium reasoning default
- OpenAI Responses API
- web search for current public information
- image/vision attachment
- multi-turn conversational context
- authenticated Supabase coach session
- coach/team context: assignments, athletes, attendance, program state, PRs, flags
- MW Detect -> Analyze -> Recommend -> Coach Approves -> Execute guardrail

Required Vercel env:
OPENAI_API_KEY
SUPABASE_ANON_KEY
SUPABASE_URL=https://keqgunlfwhjgcsurynef.supabase.co

Optional:
OPENAI_MODEL=gpt-5.6-sol
OPENAI_REASONING_EFFORT=medium
