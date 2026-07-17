# IEMA.ai v2 — Product Requirements Document

## Original Problem Statement
Build IEMA.ai v2 as a complete, production-ready AI Super Platform from scratch supporting millions of users across Web, Android, and iOS. Must look and feel comparable to ChatGPT, Claude, Cursor, Perplexity, Linear, Notion, and Vercel.

## Stack (as adapted)
- **Web**: React + Redux Toolkit + Tailwind + shadcn — `/app/frontend/`
- **Backend**: FastAPI + MongoDB (motor) — `/app/backend/`
- **Mobile**: React Native (Expo SDK 52) — `/app/mobile/` (`com.iemaai.app`)
- **AI**: Claude Haiku 4.5 (default) → GPT-5-mini (fallback) via Emergent Universal LLM Key
- **Payments**: Stripe (test) + Razorpay (test)
- **Email**: Resend (dev-mode fallback when RESEND_API_KEY empty)
- **Storage**: S3 bucket `iema-ai-uploads` for chat image uploads
- **OAuth**: Google + Microsoft fully wired (redirect flow), Apple + Facebook deferred

## What's Implemented

### Phase 1 (2026-02-15)
- Auth: JWT (access 60m / refresh 30d) + bcrypt + delete-account with DELETE-typed confirm
- Wallet: 6-bucket credits (welcome/daily/bonus/referral/promotional/purchased), priority deduction, auto daily refill, 100 welcome + 20 daily on signup
- Chat: SSE streaming with Claude→GPT failover, multi-turn history, markdown, code highlighting
- Usage analytics (5 periods, line + bar charts), Wallet page, Billing (Stripe USD + Razorpay INR), Notifications, Profile, Settings, Admin dashboard
- Landing + ChatGPT/Cursor-style collapsible sidebar + mobile drawer + theme toggle (light/dark/system)
- Admin seeded (`siddharth.bose@iemlabs.com` / `Admin@12345`), 8 credit packs seeded
- **Iteration 1 tests**: 37/37 backend + all frontend flows passing

### Phase 2 (2026-02-15)
- **UI refactor**: Landing now shows 12 user-facing intelligence modules from the architecture (AI Workspace live, 11 coming soon). Sidebar coming-soon section updated with same names.
- **OAuth frontend**: Google + Microsoft — full authorization-code redirect flow with `/auth/callback` handler. Apple + Facebook UI disabled with reason.
- **Password reset**: `/forgot-password` + `/reset-password` pages, backend endpoints with token TTL 1h + prior-token invalidation + all-sessions revocation on reset.
- **Email verification**: `POST /api/auth/send-verify-email` + `POST /api/auth/verify-email` with 6-digit code TTL 15 min, profile banner + verification dialog.
- **Multimodal chat**: `POST /api/uploads/image` (8MB limit, PNG/JPEG/WEBP/GIF) → S3 → signed URL. Chat message accepts `attachments`, backend fetches images to base64 and passes to Claude/GPT vision. Cost: 1 base + 3 per image.
- **Email service**: Resend with **dev-mode fallback** — code sends real emails when `RESEND_API_KEY` set, logs to console otherwise. Templates: welcome/verify/reset.
- **Production hardening**: Rotated `JWT_SECRET` to secure random, tightened `CORS_ORIGINS` to specific hosts.
- **Mobile app**: Full React Native (Expo SDK 52) app in `/app/mobile/` with bundle ID `com.iemaai.app`. 10 screens: Login, Register, ForgotPassword, Conversations, Chat (streaming + image attach via expo-image-picker), Wallet, Usage, Billing, Notifications, Profile, Settings. Drawer nav with same modules as web. JWT stored in expo-secure-store. Same REST APIs.
- **Iteration 2 tests**: 19/19 phase-2 backend tests + all UI flows passing

### Phase 3 — P0 Batch (2026-02-17)
- **Data Lake Middleware**: Global FastAPI middleware `middleware/data_lake_middleware.py` logs every `/api/*` request (method, path, status, latency, user_id, IP, UA) to Mongo `events` collection. Helper `services/data_lake.py` also lets any route log custom event types (studio_summarize, studio_image, career_job_search, career_learning_path, builder_create/refine/share/github_push). Indexes on (event_type, created_at) and (user_id, created_at).
- **AI Studio** (`/studio` web + AI Studio drawer on mobile):
  - `POST /api/studio/summarize` — Claude Haiku 4.5 summarizer, 3 styles (default/eli5/executive), cost 2 credits
  - `POST /api/studio/image` — GPT-Image-1 via `emergentintegrations.OpenAIImageGeneration`, saved to S3 with 7-day signed URL. Cost 10 (low) / 20 (medium) / 40 (high) per image
- **Career Intelligence** (`/career` web + drawer on mobile):
  - `POST /api/career/jobs` — Adzuna India (`ADZUNA_COUNTRY=in`) w/ 6-hour Mongo cache; mock fallback when keys absent. **LIVE Adzuna keys plugged in 2026-02-17.**
  - `POST /api/career/learning-path` — Claude-generated 90-day roadmap, **cached in `career_cache` by (role+skills) hash** — free on repeat calls (major credit saver)
- **Iteration 8 tests**: 21/21 backend + 10/10 UI passing.

### Phase 4 — Code Builder (2026-02-17)
- **Endpoints** under `/api/builder/*`:
  - `POST /projects` — LLM generates full multi-file project JSON in a single call (Claude Haiku 4.5). Cost **15 credits**, cached by (user_id + prompt hash).
  - `GET /projects` + `GET /projects/{id}` — list + full detail
  - `PATCH /projects/{id}/files` — manual edit, **FREE**
  - `POST /projects/{id}/refine` — apply an AI edit to the full file set. Cost **8 credits**.
  - `GET /projects/{id}/preview` — server-composed self-contained HTML (inlines sibling CSS/JS)
  - `POST /projects/{id}/share` — publishes to S3 with 7-day signed URL; overwrites existing share_key on each call
  - `POST /projects/{id}/github/push` — pushes every file to `owner/repo` via GitHub Contents API. PAT stored **encrypted (Fernet)** in `users.github_pat` and validated pre-save.
- **Frontend `/builder`** — 3-pane layout (projects list | file tabs + editor | live iframe preview via `srcDoc`).
- **Mobile `BuilderScreen.js`** — list + create + refine + open-share-URL.
- **Iteration 9 tests**: 25/25 backend + 8/8 UI passing.

### Phase 6 — Batch B: Central Pricing Engine + Admin v2 + Continuous KB (2026-02-17)
- **Pricing Engine** (`services/pricing_engine.py`) — dynamic, Mongo-driven:
  - `pricing_col` — 13 seed services with per-call credit costs (admin-editable)
  - `plans_col` — 3 tiers: Free (one-time, 25 credits total, 4h window, 15/window) · Pro (500/mo, 5h, 80/window, ₹299) · Team (2000/mo, 6h, 300/window, ₹999). Admin-editable.
  - `usage_col` — per-call spend record (drives all analytics dashboards)
  - `spend()` — one atomic call for: resolve price → window check → wallet deduct → provider tracking + KB-hit awareness (skip_charge=True)
- **Rolling usage windows** — every AI call enforces plan.window_credits within plan.window_hours. On exhaustion returns 429 with `{message, resets_at, resets_in_ms, cap, used}`.
- **Capability Manifest** (`services/capability_manifest.py`) — injected into every LLM system prompt (chat, counseling, studio, career). AI now recommends IEMA's `/studio`, `/builder`, `/career`, `/counseling` instead of external competitors.
- **Multi-social account linking** — `GET /api/auth/me/linked`, `POST /api/auth/me/link`, `DELETE /api/auth/me/link/{provider}`. Supports google/microsoft/apple/github/linkedin. Prevents disconnecting last sign-in method.
- **Continuous Knowledge Engine** (`services/knowledge_engine.py`) — APScheduler runs every 4h, samples top prompts from KB, harvests summaries from Wikipedia REST + DuckDuckGo Instant Answer (both **free**, no keys), stores as `public_knowledge:{source}` in the retriever. Admin `POST /admin/kb/engine/run` to force a pass.
- **Admin Dashboard v2** — 6 new tabs: Finance (P&L, expense timeline chart), Providers (pie + table by anthropic/openai/emergent/…), Queries (paginated event log with prompt search + JSON view), Pricing (13 rows, inline editable), Plans (3 cards, all fields editable). Existing Users / Packs / Transactions / Data Lake kept.
- **UI cleanup** — All per-task credit costs REMOVED from Studio/Career/Builder/Counseling. Usage page adds `usage-window-widget` (progress bar + "resets in Xh Ym").
- **Free tier semantics** — `.env`: WELCOME_CREDITS 100→50 (one-time on signup), DAILY_CREDITS 20→0 (no auto-refresh). Free plan is one-time only.
- **Register endpoint** now auto-assigns `plan='free'` on new users.
- **Iteration 11 tests**: 24/24 backend + all 5 new admin tabs + usage window + credit-hint removal passing. Testing agent fixed one critical bug (misplaced return in admin_routes) in-place.

### Phase 5 — Batch A: Data-Lake-First AI (2026-02-17)
- **Knowledge Retriever** (`services/knowledge_retriever.py`) — zero-third-party, Mongo-only. Flow: exact hash → Mongo `$text` search → Jaccard-similarity against admin-configurable threshold. Fires on every AI-generating call (counseling/studio/career/builder). Hit_count + last_used_at tracked per entry.
- **Settings service** (`services/settings_service.py`) — `app_settings` collection, key/value. Defaults: `kb_similarity_threshold=0.85`, `kb_enabled=true`.
- **Wired retrieve-first flow into:** Studio Summarize, Career Learning Path, Builder Create — each now returns `source: 'kb' | 'llm'` and skips credit deduction on cache hits.
- **Counseling module** (`/api/counseling` + `/counseling` web + drawer on mobile) — 3 modes (career / psychology / academic) with specialized system prompts. Psychology mode always returns iCall India helpline in disclaimer. 3 credits per fresh LLM answer, 0 on KB hit.
- **Template Gallery** — 6 hand-crafted single-file HTML apps (todo, pomodoro, calculator, dev portfolio, SaaS landing, weather) auto-seeded on backend startup. **Public endpoints** `/api/builder/templates`, `/api/builder/templates/{slug}`, `/api/builder/templates/{slug}/preview` require NO auth (marketing use). `POST /api/builder/templates/{slug}/use` (auth) clones to user's projects at 0 credits. Landing page shows a live iframe gallery with template picker + CTA.
- **Admin Data Lake tab** — new tab on `/admin` showing KB stats (total entries, all-time hits, breakdown by kind) + threshold slider (0–1) + enable toggle. Changes are logged to the data lake (`admin_setting_updated` event) for audit.
- **Iteration 10 tests**: 20/20 backend + 12/12 UI passing. Retrieve-first verified across all 4 AI kinds. Non-admin users correctly 403 on `/admin/kb/*`.
  - `POST /projects` — LLM generates full multi-file project JSON in a single call (Claude Haiku 4.5). Cost **15 credits**, **cached by (user_id + prompt hash)** for free re-generation.
  - `GET /projects` + `GET /projects/{id}` — list + full detail
  - `PATCH /projects/{id}/files` — manual edit, **FREE**
  - `POST /projects/{id}/refine` — apply an AI edit to the full file set. Cost **8 credits**.
  - `GET /projects/{id}/preview` — server-composed self-contained HTML (inlines sibling CSS/JS, preserves external CDNs)
  - `POST /projects/{id}/share` — publishes to S3 with 7-day signed URL; **overwrites existing share_key so it always serves latest HTML**
  - `POST /projects/{id}/github/push` — pushes every file to `owner/repo` via GitHub Contents API. PAT stored **encrypted (Fernet with JWT_SECRET-derived key)** in `users.github_pat`. **PAT is validated against `GET /user` before persisting**, so `/github/status` never lies. `GET /github/status`, `DELETE /github/disconnect`.
- **Frontend `/builder`** — 3-pane layout (projects list | file tabs + code editor | live iframe preview via `srcDoc`). Refine input at bottom of editor pane. Share button in preview header returns a copyable public 7-day URL. GitHub push dialog with PAT/repo/commit fields.
- **Mobile `BuilderScreen.js`** — list + create + refine + open-share-URL (opens in system browser).
- **Iteration 9 tests**: 25/25 backend + 8/8 UI passing. Adzuna confirmed live (source='adzuna', 100+ real jobs). Post-test fixes: share endpoint now overwrites (was uploading orphan), PAT validated pre-save, iframe sandbox tightened.

## Architecture

### Backend `/app/backend/`
```
server.py                    entry + startup seeds (admin, packs)
db.py                        motor client + BaseDocument + ensure_indexes
models.py                    Pydantic (User, Wallet, Message, Pack, PaymentTx, Notif, +verify/reset)
auth.py                      bcrypt + JWT + get_current_user + require_admin
routers/
├── auth_routes.py           register/login/refresh/me/delete/google/microsoft/
│                            forgot-password/reset-password/send-verify-email/verify-email/oauth-config
├── chat_routes.py           SSE /chat/stream (with attachments), conversations CRUD
├── wallet_routes.py
├── usage_routes.py
├── pack_routes.py
├── payments_routes.py       Stripe + Razorpay
├── notifications_routes.py
├── admin_routes.py
└── uploads_routes.py        POST /uploads/image → S3
services/
├── credit_service.py        priority deduction + daily refill
├── ai_service.py            Claude→GPT failover, vision support (ImageContent from base64)
├── email_service.py         Resend + dev-mode fallback (templates)
├── storage_service.py       boto3 S3 upload + presigned URLs
└── notification_service.py
```

### Frontend Web `/app/frontend/src/`
- Landing / Auth (login, register, forgot, reset, oauth-callback) / Chat (streaming + image upload) / Usage / Wallet / Billing / PaymentSuccess / Notifications / Profile (verify banner) / Settings (delete flow) / Admin

### Mobile `/app/mobile/`
- App.js — Providers + hydration from expo-secure-store
- src/api.js — Axios + refresh + secure storage
- src/navigation/RootNavigator.js — Auth stack vs Drawer
- src/components/{DrawerContent,ScreenHeader,UI}.js
- src/screens/{Login,Register,ForgotPassword,Conversations,Chat,Wallet,Usage,Billing,Notifications,Profile,Settings}Screen.js
- app.json — bundle: `com.iemaai.app`, dark theme, Expo SDK 52

## Backlog / Next Actions

### P1 (Batch B — WAITING FOR API KEYS FROM USER)
- **Multi-social sign-in expansion** — backend `linked_accounts` infra is DONE. Need frontend Profile UI + Apple/Google/Microsoft OAuth-link buttons + **LinkedIn OAuth** (need Client ID/Secret from linkedin.com/developers) + **GitHub OAuth** (Client ID/Secret from github.com/settings/developers).
- **Mobile IAP** — Google Play + Apple App Store receipt validation. Need: Apple App Store shared secret + Google Play service-account JSON.
- **Stripe Subscriptions** — I have Stripe test key already. Need user's OK on the 3-plan pricing (Free 25 one-time / Pro ₹299/mo / Team ₹999/mo) or their preferred numbers.
- **Admin Pricing Excel** — .xlsx export with API costs + credit economics + tier pricing (openpyxl already installed).

### P2 (Endgame — 0 third-party dependency)
- **Continuous Knowledge Engine** — DONE. Runs every 4h. Wikipedia + DuckDuckGo. Admin can force-run.

### P0 (before app store submission)
- Paste real `RESEND_API_KEY` from resend.com so verify/reset emails actually send
- Register `iemaai://auth/callback` deep link and switch mobile OAuth to `expo-auth-session`
- Set up EAS project (`eas init && eas build:configure`) and submit builds
- Add react-native-razorpay SDK for native Razorpay checkout (currently opens in-app browser fallback)

### P1
- Push notifications via `expo-notifications` (backend endpoint `/api/notifications/register-device`)
- Apple Sign-In JS on web (needs verified domain in Apple Developer Console)
- Coupons + referral rewards + shareable referral links
- Invoice PDF generation for purchases

### P2 (build intelligence modules per architecture — one at a time)
1. Career Intelligence (jobs feed + skill roadmaps + interview Q&A generator)
2. Startup Intelligence (playbooks + market maps + competitor teardowns)
3. Research Intelligence (paper summarizer + citation graph)
4. Dynamic Course Engine (topic → syllabus → lessons + quizzes)
5. Resume Intelligence (ATS scoring + rewrite)
6. Mock Interviews (voice-based interviewer using OpenAI Realtime/Whisper)
7. Counselling (structured exercises + mood journaling)
8. Scholarships + Internships + Freelance Intelligence (data ingestion)

## Environment
- `/app/backend/.env`: rotated `JWT_SECRET`, tightened `CORS_ORIGINS`, `EMERGENT_LLM_KEY`, S3 credentials, `RESEND_API_KEY` (blank = dev mode), Razorpay/Google/Microsoft OAuth
- `/app/frontend/.env`: `REACT_APP_BACKEND_URL` (untouched)
- `/app/mobile/app.json`: `expo.extra.apiBaseUrl` (change to production URL before publishing)

## Test Credentials
See `/app/memory/test_credentials.md`
