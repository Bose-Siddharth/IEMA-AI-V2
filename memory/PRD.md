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
- **Data Lake Middleware**: Global FastAPI middleware `middleware/data_lake_middleware.py` logs every `/api/*` request (method, path, status, latency, user_id, IP, UA) to Mongo `events` collection. Helper `services/data_lake.py` also lets any route log custom event types (studio_summarize, studio_image, career_job_search, career_learning_path). Indexes on (event_type, created_at) and (user_id, created_at).
- **AI Studio** (`/studio` web + AI Studio drawer on mobile):
  - `POST /api/studio/summarize` — Claude Haiku 4.5 summarizer, 3 styles (default/eli5/executive), cost 2 credits
  - `POST /api/studio/image` — GPT-Image-1 via `emergentintegrations.OpenAIImageGeneration`, saved to S3 with 7-day signed URL. Cost 10 (low) / 20 (medium) / 40 (high) per image
- **Career Intelligence** (`/career` web + drawer on mobile):
  - `POST /api/career/jobs` — Adzuna India (`ADZUNA_COUNTRY=in`) w/ 6-hour Mongo cache; **falls back to curated mock data when ADZUNA keys absent**
  - `POST /api/career/learning-path` — Claude-generated 90-day roadmap, **cached in `career_cache` by (role+skills) hash** — free on repeat calls (major credit saver)
  - Web pages `pages/Studio.jsx` + `pages/Career.jsx` w/ full test-id coverage; Mobile screens `StudioScreen.js` + `CareerScreen.js`; both added to sidebar/drawer and moved out of Coming Soon.
- **Iteration 8 tests**: 21/21 backend + 10/10 UI passing. All events verified in data lake. Image gen produces valid S3 URL (HTTP 200). Learning path cache hit produces 0 credits.

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

### P1 (next batch — awaiting user go-ahead)
- **Counseling Module** (Career + Psychology AI chat) — pure LLM, specialized system prompts, first queries the Data Lake for user's own past context.
- **Mobile IAP** — Google Play + Apple App Store receipt validation on backend + Expo `react-native-iap` UI. Requires user-provided Google Play service account JSON + Apple App Store shared secret.
- **Admin Pricing Excel** — generate `.xlsx` summarizing API costs, credit economics, tier pricing (available for admin download).

### P2 (last if budget allows)
- **Code Builder** (Emergent-style multi-project) — GitHub connector + live preview. User chose "full" but agreed we only do it if budget still holds after P1.

### P0 (before app store submission)
- Paste real `RESEND_API_KEY` from resend.com so verify/reset emails actually send
- Paste real `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` from developer.adzuna.com to switch career jobs from mock → live India feed
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
