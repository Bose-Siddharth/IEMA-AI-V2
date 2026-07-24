# RevenueCat & Subscription Setup — Status

Log of the RevenueCat integration + recurring subscription work, and what's still
outstanding. Written 2026-07-24.

---

## 1. What RevenueCat is doing here — Observer Mode

The app already had a working, custom subscription flow before RevenueCat was
introduced:

```
expo-iap (StoreKit 2 / Play Billing)
  -> POST /api/payments/iap/{apple,google}/verify
  -> backend verifies the receipt directly with Apple/Google
  -> _credit_plan() grants the plan + monthly credits
```

That flow is untouched and is still what actually grants credits. RevenueCat was
added in **Observer Mode** (`purchasesAreCompletedBy: MY_APP`) — it only *watches*
the transactions expo-iap already makes; it does not own checkout and does not
replace the verify flow. Its value: a second, independent view of subscription
state (renewals, cancellations, billing issues) via `services/payments_service.py
handle_revenuecat_webhook()`, and normal RevenueCat dashboard analytics.

`Purchases.configure({ appUserID: user.id, ... })` is called with our own Mongo
`user.id` as the RevenueCat `app_user_id`, so the webhook can match a RevenueCat
event straight to a Mongo user with no lookup table.

---

## 2. RevenueCat dashboard (project "IEMA AI", `b676ea16`)

**Apps** — both already existed before this work started:
- `IEMA AI (App Store)` — bundle `com.iemaai.app`, P8 key **valid**.
- `IEMA AI (Play Store)` — package `com.iemaai.app`, Google Play service account
  **valid** (same account backend already uses for direct verification).

**Products** — all 8 created manually today (auto-import didn't work because the
iOS subscriptions were still "Waiting for Review" in App Store Connect at the
time; manual-by-identifier creation works regardless of review state):
- iOS: `iema.pro.monthly`, `iema.pro.annual`, `iema.team.monthly`, `iema.team.annual`
- Android: `iema.pro.monthly:1bp`, `iema.pro.annual:2bp`, `iema.team.monthly:3tp`, `iema.team.annual:4tp`

**Entitlements** — created `pro` and `team` (cross-platform; each has both the
iOS and Android monthly+annual product attached, so a subscriber gets the right
access regardless of which store they bought through).

> Bug found and fixed along the way: `iema.team.monthly:3tp` (Android) was
> wrongly attached to a stray legacy entitlement called "IEMA AI Pro Monthly"
> (unrelated pre-existing entitlement, still attached to one Test Store product —
> left alone). Detached it and reattached to the correct `team` entitlement.

**API keys**:
- iOS: `appl_jFQKLAUZpcGOOLtuiKpFLQKRMNp`
- Android: `goog_hSnLKVEWOegGCbkpfFRQDTUKYRq`
(Both are public SDK keys — safe to ship in client code, which is where they are:
`mobile/src/services/revenuecat.js`.)

**Webhook** — created an integration named "IEMA Backend" pointing at
`https://api.iema.ai/api/payments/webhook/revenuecat`, sending both Production
and Sandbox events, with a generated bearer secret. **The secret itself is not
recorded in this file** (avoid committing secrets) — it needs to be set as
`REVENUECAT_WEBHOOK_AUTH` in the deployed backend's `.env`, as the exact string
`Bearer <secret>`, matching what's configured in RevenueCat's "Authorization
header value" field. Ask whoever set it up (or regenerate it in RevenueCat →
Integrations → Webhooks → IEMA Backend → Edit) if it's been lost.

**Not yet configured**: "Google developer notifications" (a Pub/Sub topic for
real-time Android purchase events) — optional, not blocking anything today.

---

## 3. Mobile app changes

- Installed `react-native-purchases` (`^10.4.4`).
- New `mobile/src/services/revenuecat.js` — `initRevenueCat(userId)`, configures
  RevenueCat in Observer Mode for **both iOS and Android** (platform → API key
  map), passes `appUserID: userId`.
- `mobile/src/screens/BillingScreen.js` — pulls `user.id` from Redux, calls
  `initRevenueCat(userId)` alongside the existing `initIap()` call. No changes
  to the actual purchase/checkout code.
- Unrelated fixes made along the way while touching these files:
  - Fixed a require cycle (`api.js` ↔ `store.js` ↔ `authSlice.js`) that was
    causing a transient "useDispatch doesn't exist" crash. `persistAuth`/
    `loadAuth` moved out of `api.js` into a new `mobile/src/authStorage.js`.
  - `ChatScreen.js` and `StudioScreen.js` (Summarize tab) got a model picker
    dropdown, reusing the backend's existing `/chat/models` catalog.
  - AI Studio's Image tab now shows a static "GPT Image 1" model badge (only
    one image model exists server-side, so no picker needed there).

---

## 4. Backend changes (`payments_service.py`, `payments_routes.py`)

> These were made in this **local** checkout. The user then pulled/merged the
> actual hosted backend repo into this one — the RevenueCat code below survived
> that merge cleanly with **no conflicts**. The user has asked the other
> developer to apply these same changes to the hosted backend repo directly —
> as of this writing that deploy step is still pending on their side, not done
> from here.

- `_revoke_plan(user_id, source, ref_id)` — new. Downgrades a user to `free`.
  Nothing in this codebase did this before (cancellations previously only
  flipped `subscriptions.status`, never touched `users.plan`).
- `handle_revenuecat_webhook(body, auth_header)` — new. Verifies the
  `Authorization` header against `REVENUECAT_WEBHOOK_AUTH`, dispatches
  `INITIAL_PURCHASE/RENEWAL/PRODUCT_CHANGE/UNCANCELLATION` → `_credit_plan()`
  (the same single choke-point Apple/Google/Razorpay already use), and
  `CANCELLATION/EXPIRATION` → `_revoke_plan()`. Skips gracefully (no error) if
  `app_user_id` isn't a valid Mongo ObjectId (e.g. an anonymous RevenueCat user
  who never logged in).
- New route: `POST /api/payments/webhook/revenuecat` (unauthenticated, hidden
  from OpenAPI schema — same pattern as the existing Razorpay webhook route).

**Two new orphaned Apple IAP products found, left alone on purpose**:
`iema_credits_50` / `iema_credits_100` (consumables, both Approved in App Store
Connect, auto-imported into RevenueCat). No app or backend code references
them at all — likely set up previously for a "buy credits via native IAP"
feature that was never finished. Decision: **stay dormant** until that feature
is actually prioritized.

---

## 5. iOS — current blocker

Every "Product not found" error encountered on iOS traces back to one thing:

> **App Store Connect → Business → Agreements → Tax Forms → U.S. Form W-9 is
> still "Missing Tax Info".**

Apple can silently withhold paid content (including subscriptions, even in
sandbox) until this is submitted. The Paid Apps Agreement itself is Active —
just the W-9 is outstanding. This is **not** a code or build issue — no rebuild
fixes it. Someone with authority over IEM AMERICA CORPORATION's Apple account
needs to submit that form (Business page → Tax Forms → "Add Tax Info").

Also fixed along the way: a recurring `eas build` failure ("Failed to sync
capabilities... bundle cannot be deleted") — added `ios.usesAppleSignIn: true`
to `app.json` (the app uses `expo-apple-authentication` for Sign In with Apple
but this flag was missing, which made EAS try to incorrectly disable that
capability on Apple's side). This setting has been dropped from `app.json` more
than once by an external process during this session — if the capability-sync
error recurs, check it's still there first; fall back to
`EXPO_NO_CAPABILITY_SYNC=1 eas build ...` if needed.

**Sandbox testing setup** (done): a sandbox tester `iema.iem.testing@gmail.com`
already exists in App Store Connect. Sign into it under Settings → App Store →
Sandbox Account on the test device (separate from the real Apple ID).

---

## 6. Android — current blocker

Diagnosed a "Product not found" on Android that looked identical to iOS's but
had a completely different cause: **the test build was sideloaded (direct APK
install), and Google Play Billing cannot resolve subscription products for a
sideloaded app** — it only works when the app is installed through the Play
Store, from any track.

Fix in progress:
- Confirmed **Production** already has a live build (30, `3.0.0`, publicly on
  the Play Store, 23 installs) with the current subscription setup.
- Set up **License Testing**: created a new list "IEMA AI testers" containing
  `drarunkundu22@gmail.com` (Play Console → Settings → License testing). Lets
  that Google account make free/test purchases. Note: license testing lists are
  **account-wide** (apply to all 31 apps under this org), not per-app.
- Recommended next step (not yet confirmed done): uninstall the sideloaded
  APK, install "IEMA AI" from the real Play Store listing signed into
  `drarunkundu22@gmail.com`, then retry Subscribe.

**Build 31 status**: uploaded via `eas submit` to a *custom* closed-testing
track ("internal testing iema ai" — distinct from the standard "Internal
testing" track, which is still stuck on old build 21 from July 18). Build 31
was **never actually published** — Play Console showed 5 pending changes
(publish build 31, resume that track, pause both the Alpha and standard
Internal Testing tracks, and gate testers to an unrelated "SAL Testers" list).
**Per explicit instruction, none of this was submitted — aborted, nothing
published, no changes made.** If build 31 needs to go out later, revisit
Play Console → Publishing overview on that app.

Mobile-side Android RevenueCat wiring (`revenuecat.js` platform key map) is
done, but has not yet been exercised end-to-end on a real device — that
requires either fixing the Production install (build 30, which predates
today's mobile changes) or properly publishing a newer build.

---

## 7. Open items / next steps

- [ ] Get the W-9 tax form submitted in App Store Connect (iOS blocker).
- [ ] Reinstall the Android test app via the Play Store (not sideloaded) and
      retry the subscription purchase.
- [ ] Confirm the other developer has applied the RevenueCat webhook changes to
      the hosted backend repo, and that `REVENUECAT_WEBHOOK_AUTH` is set there.
- [ ] Once both platforms can complete a real (sandbox/test) purchase, verify
      it shows up in RevenueCat → Customers, and eventually in
      `subscriptions_col` with `source: "revenuecat"` once the webhook is live.
- [ ] Decide whether/when to build the `iema_credits_50`/`iema_credits_100`
      native-IAP credit-pack feature (currently dormant, unwired).
- [ ] Optional: connect Google developer notifications (Pub/Sub) for
      real-time Android purchase events in RevenueCat.
