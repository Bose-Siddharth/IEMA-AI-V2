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

### P0 (before app store submission)
- Paste real `RESEND_API_KEY` from resend.com so verify/reset emails actually send
- Register `iemaai://auth/callback` deep link and switch mobile OAuth to `expo-auth-session` (Google + Apple + Microsoft) — see `/app/mobile/README.md`
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
