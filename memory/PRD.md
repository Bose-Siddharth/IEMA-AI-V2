# IEMA.ai v2 — Product Requirements Document

## Original Problem Statement
Build IEMA.ai v2 as a complete, production-ready AI Super Platform from scratch. This is a complete redesign with modern architecture supporting millions of users across Web, Android, and iOS. The final product should look and feel comparable to ChatGPT, Claude, Cursor, Perplexity, Linear, Notion, and Vercel.

## User Choices (2026-02-15)
- **Stack**: React web + FastAPI (Python) + MongoDB (adapted from Node/Prisma requested)
- **Scope v1**: All modules — Auth, Chat, Wallet, Usage, Billing, Notifications, Profile, Settings, Admin, Payments
- **Mobile**: Deferred to phase 2 (API designed mobile-friendly)
- **AI**: Claude Haiku 4.5 (default) + GPT-5-mini (fallback) via Emergent Universal LLM Key (cost-optimized)
- **Payments**: Stripe (test key pre-configured) + Razorpay (test keys provided by user)
- **Auth**: Email/Password (JWT) + Google OAuth (real credentials wired) + Apple/Microsoft (credentials stored, UI "coming soon") + Facebook (disabled per user)
- **Admin seed**: `siddharth.bose@iemlabs.com` / `Admin@12345`

## Architecture

### Backend (FastAPI + MongoDB)
```
/app/backend/
├── server.py                # entry, startup seeds admin + 8 credit packs
├── db.py                    # motor client, BaseDocument, ensure_indexes
├── models.py                # Pydantic: User, Wallet, Message, CreditPack, PaymentTx, Notification
├── auth.py                  # bcrypt + JWT (access 60m / refresh 30d) + get_current_user + require_admin
├── routers/
│   ├── auth_routes.py       # register/login/refresh/logout/me/delete/google
│   ├── chat_routes.py       # SSE stream at /chat/stream, conversation CRUD, pin/rename/delete
│   ├── wallet_routes.py     # get wallet, list transactions
│   ├── usage_routes.py      # summary + timeline (5 periods)
│   ├── pack_routes.py       # list packs, admin CRUD
│   ├── payments_routes.py   # Stripe checkout + Razorpay order/verify + history + webhook
│   ├── notifications_routes.py
│   └── admin_routes.py      # stats, users list, toggle active/promote, wallet adjust
└── services/
    ├── credit_service.py    # priority deduction: welcome→daily→bonus→referral→promo→purchased
    ├── ai_service.py        # Emergent LLM: Claude Haiku 4.5 → GPT-5-mini failover, SSE streaming
    └── notification_service.py
```

### Frontend (React + Redux Toolkit + Tailwind + shadcn)
```
/app/frontend/src/
├── App.js                   # BrowserRouter + protected routes
├── index.css                # Outfit + Manrope + JetBrains Mono, dark/light tokens
├── store/                   # Redux slices: auth, ui (theme + sidebar + wallet)
├── context/ThemeProvider    # light/dark/system w/ prefers-color-scheme
├── lib/api.js               # axios + auto refresh interceptor
├── components/
│   ├── Sidebar.jsx          # 260px/64px collapsible, ChatGPT-style
│   ├── AppLayout.jsx        # authenticated shell + mobile drawer
│   └── ThemeToggle.jsx
└── pages/
    ├── Landing.jsx          # marketing hero + features + pricing
    ├── AuthPage.jsx         # login/register with OAuth buttons
    ├── Chat.jsx             # streaming SSE + markdown + code highlight + chat history
    ├── Usage.jsx            # Recharts line + bar analytics
    ├── Wallet.jsx           # 6-bucket balance + transactions
    ├── Billing.jsx          # USD (Stripe) + INR (Razorpay) checkout
    ├── PaymentSuccess.jsx   # polling stripe status
    ├── Notifications.jsx
    ├── Profile.jsx          # edit name + connected accounts
    ├── Settings.jsx         # theme + delete account (typed DELETE confirm)
    └── Admin.jsx            # stats + users/packs/transactions tabs
```

## What's Implemented (2026-02-15)
- **Auth**: JWT (access+refresh) with rotation on refresh, bcrypt passwords, session tracking, delete account with DELETE-type confirmation, Google OAuth code exchange endpoint
- **Wallet**: 6 credit buckets, priority-based deduction, auto daily refill on new UTC day, 100 welcome + 20 daily on signup
- **Chat**: SSE streaming with Claude Haiku 4.5 default → GPT-5-mini auto-failover, multi-turn history, markdown + code highlighting, credit deduction per message
- **Usage**: Analytics with 5 time periods, line + bar charts, top provider/model insights
- **Packs**: 8 default packs (Starter/Standard/Pro/Business × USD/INR), admin CRUD
- **Payments**: Stripe Checkout (via emergentintegrations) + Razorpay Orders with signature verification + webhooks
- **Notifications**: List, mark-read, mark-all-read, delete; auto notification on purchase / admin adjustment
- **Admin**: Stats dashboard, user search/promote/disable, wallet adjust with automatic notification
- **UI**: Landing page + collapsible sidebar (ChatGPT/Cursor style), light/dark/system theme, mobile drawer, coming-soon placeholder for 7 future modules

## Tested (Iteration 1 — 100% pass, 37/37 backend + all frontend flows)
See `/app/test_reports/iteration_1.json`

## Future Modules (Placeholders in Sidebar)
- Career Intelligence, Startup Intelligence, Resume Intelligence
- Dynamic AI Course Generator, Mock Interviews, AI Mentor, Community

## Backlog / Next Actions
### P0 (blocking real launch)
- Wire up actual Google OAuth redirect flow in frontend (backend endpoint ready)
- Implement Apple OAuth (`.p8` file uploaded, needs Sign in with Apple JS flow)
- Implement Microsoft OAuth (client ID/secret ready)
- Set proper CORS origins in production (currently `*`)
- Rotate `JWT_SECRET` before production

### P1 (product completeness)
- Email verification flow (SMTP integration — SendGrid/Resend)
- Forgot/reset password flow
- Refresh-token blocklist on logout (currently stored but not enforced)
- Rate limiting middleware (redis-based)
- File/image upload in chat (S3 or GridFS)
- Regenerate response / edit message
- Export chat to markdown/PDF
- Coupon / referral code system
- Invoice PDF generation

### P2 (nice-to-have)
- React Native (Expo) apps for iOS/Android
- Career/Startup/Resume Intelligence modules
- Dynamic AI Course Generator
- Multi-agent AI system

## Environment Variables (backend/.env)
- `EMERGENT_LLM_KEY` — universal AI key
- `JWT_SECRET`, `JWT_ACCESS_MINUTES=60`, `JWT_REFRESH_DAYS=30`
- `WELCOME_CREDITS=100`, `DAILY_CREDITS=20`, `CREDIT_COST_MESSAGE=1`
- `DEFAULT_AI_MODEL=claude-haiku-4-5-20251001`, `FALLBACK_AI_MODEL=gpt-5-mini`
- `STRIPE_API_KEY=sk_test_emergent`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`
- `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`

## Test Credentials
See `/app/memory/test_credentials.md`
