# Saathi

An AI companion for adults in India who feel lonely, stressed or low: talk by voice, video or text, journal privately, calm down, and take small steps outside. **A wellness companion, not a therapist, doctor or crisis service.**

This repo is the front end, built from the Claude Design handoff (`design/saathi-app-v2.dc.html`) and the product spec (`docs/PRD.md`). There is **no backend yet**: every external dependency sits behind a mock or a clearly marked `TODO(...)`.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev -- --host   # open on your phone, same network
npm run verify       # typecheck + tests + production build
```

Add `?demo` to the URL for the **prototype navigator**: the design's side rail, a time-of-day switch, reduce-motion and spoken-voice toggles, and shortcuts to states that normally arrive from outside the app (lock-screen notifications, an incoming call, the crisis screen). It is not mounted without `?demo`.

## What's here

React 18 + Vite + TypeScript, no UI or state library. Mobile-first; on a wide screen the app sits in a centred phone-width column.

| Area | Where |
|---|---|
| Onboarding: welcome, honest intro, age gate and under-18 exit, language, name, companion, consent | `src/screens/Onboarding.tsx` |
| Today, Talk, voice/video/"just sit"/check-in calls, text chat | `src/screens/{Today,Talk,Call,Chat}.tsx` |
| Outside: small step, Walk with me, events, hobbies | `src/screens/Outside.tsx` |
| Journal: entries, write / talk it out, "What I noticed" review, Insights | `src/screens/Journal.tsx` |
| You: memory, privacy centre, reminders, look & voice studio | `src/screens/{You,Studio}.tsx` |
| Calm: meditate, sleep stories, mixable sounds, full-screen player with sleep timer | `src/screens/Calm.tsx`, `src/overlays/Full.tsx` |
| Safety: support sheet, helplines, level 2 care card, level 3 crisis screen, breathe | `src/overlays/*`, `src/domain/safety.ts` |
| Notifications, lock screen and incoming call (demo simulations) | `src/screens/Lock.tsx` |
| Pure rules (tested) | `src/domain/safety.ts`, `src/domain/journal.ts` |
| Adapter boundary for the LLM / safety service (mock only) | `src/providers/companion.ts` |
| Audio: browser TTS, generated ambient loops, dictation | `src/audio/*` |

## Safety behaviour (PRD §6.4, §8.10)

- **Level 1/2/3 pre-filter** in English, Hinglish and Hindi (`classify`). Level 2 shows the care card; level 3 takes over with the crisis screen and the **fixed, reviewed script** instead of an AI turn.
- The crisis screen has no Escape or back-gesture dismissal. "I'm safe right now" needs a second confirmation. Helpline buttons are real `tel:` links (Tele-MANAS 14416, 112).
- Risk decays only after 3 calm turns; level 3 never auto-decays.
- **"Need help?" is on every primary screen** and the support sheet has a one-tap Tele-MANAS call.
- The paywall is never shown after any distress signal in the session. Safety features are never gated.
- A user who says they are under 18 mid-chat is routed to the under-18 exit. Asking "are you human?", medication questions and romantic cues get the PRD's honest / decline / boundary replies.
- The client pre-filter is deliberately sensitive and is **not a substitute for the server classifier** (not built).

## Privacy behaviour (PRD §5)

- Nothing is pre-ticked at consent. "Saathi can learn from this" on a journal entry defaults to your Remember setting, which defaults to off.
- "Just for me" entries skip analysis entirely. "Keep it just for me" after review discards the analysis. **Nothing reaches Memory until Done.** Sensitive proposed memories (health, trauma, religion, finances…) start unsaved.
- Only low-sensitivity **preferences** persist to `localStorage`. Journal text, memories, chat and mood are held in memory only, because the PRD requires per-user encryption we don't have client-side. A reload resets them to the demo seed.
- "Delete everything" clears everything held on the device.

## Accessibility

axe-core (WCAG 2.1 A/AA) was run against all 43 states reachable from the navigator with zero violations. Dialogs trap focus and the content behind them is `inert`; switches and radios expose state to assistive tech; mood uses shape and colour; reduce motion is honoured from the OS and an in-app setting.

## Where I followed the PRD over the prototype

1. **Consent defaults to all off** (prototype pre-ticked "Remember me").
2. **Crisis screen** uses the PRD's fixed copy and "I'm safe right now" + confirm, not the prototype's "Back to conversation".
3. **Breathe** is in 4 · hold 2 · out 6 with a breath counter (prototype: 3 s / 3 s).
4. **Under-18 exit** lists KIRAN and Childline 1098 as well as Tele-MANAS.
5. **Memory** gains the master "Remember" switch and a double-confirm "Forget everything".
6. **Device voice picker** is shown only in `?demo` (PRD: dev only).
7. The prototype's journal sample ("…sleep before one tonight") tripped its own crisis regex on the word "tonight". The classifier now needs intent, and a test pins that sample to *not* crisis.
8. Sheets now stack above the full-screen player (in the prototype "Need help?" in the player opened behind it).
9. **Walk** shows elapsed time rather than the prototype's invented step count; real steps need the health adapter.
10. The prototype's phone frame, fake status bar and `window.claude` journal call are dropped; safe-area insets replace the status-bar padding.

## Stubs (`TODO(...)` in code, nothing here is faked as done)

Auth/OTP, real conversation LLM + server safety classifier, WebRTC voice/video, streaming STT, production TTS with visemes, recorded Calm content and gapless loops, events feed and RSVP, billing (**"Try Plus" does not start a trial**), push/VoIP notifications and the scheduler, remote-config helplines, trusted-contact number storage, encrypted sync/offline queue, i18n (UI copy is English only; PRD wants en / hinglish / hi).

Not yet built from the PRD: end-of-call memory review and "a bit better / same / worse" tap, long-press "Remember this" in chat, safety-plan editing, Sunday letter generation, service worker / offline, analytics events, app lock and screenshot blocking (native), Hindi narration.

## Tests

`npm test` runs 58 tests: the safety classifier (EN / Hinglish / Hindi, false-positive guards, decay rules), journal analysis limits and sensitivity, and app-level flows (onboarding defaults, help on every tab, level 2 / 3 chat, crisis can't be escaped, paywall guard, journal review writes nothing until Done, preferences-only persistence, delete-everything).
