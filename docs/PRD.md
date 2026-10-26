# Saathi — Product Requirements Document (v2)

> Source of truth for engineering, backend and AI. Pairs with the clickable prototype `Saathi App v2.dc.html`.
> Written to be pasted into an AI coding agent: every section states **what**, **why**, **data**, **API**, **AI behaviour** and **acceptance criteria**.
> Keywords: **MUST** = launch blocker, **SHOULD** = launch target, **MAY** = later.

---

## 0. How to use this document (instructions for an AI coding agent)

1. Build the backend and AI layer described in §4–§7 first; screens in §8 depend on them.
2. Never invent clinical features. Saathi is a **wellness companion, not a therapist, doctor or crisis service**.
3. Every AI output that reaches the user MUST pass the Safety Pipeline (§6) first.
4. Every piece of personal data MUST respect the Consent and Memory rules (§5). When unsure, do **not** store.
5. Copy tone (§3.3) is part of the spec. Do not "improve" it into marketing language.
6. If a requirement is ambiguous, choose the option that is **more private, less pushy, and safer**.

---

## 1. Product summary

**Saathi** ("companion" in Hindi) is a mobile app for adults (18+) in India who feel lonely, stressed or low. It offers an AI companion you can talk to by voice, video avatar or text; a private journal; gentle daily plans; guided meditations and sleep stories; low-pressure ways to get outside and meet people; and always-visible routes to real human help.

**Primary user:** 18–35, urban/semi-urban India, English/Hinglish/Hindi, lives alone or away from family (students, early-career workers). Example persona: *Aarav, 26, Bengaluru, software tester, moved cities, sleeps badly, sister Priya is his closest contact.*

**Jobs to be done**
- "When I'm alone in the evening, I want someone to talk to without being judged."
- "When my mind is racing at night, I want something to help me sleep."
- "When I've had a bad day, I want to get it out of my head, privately."
- "I want to slowly rebuild real-world connection without pressure."

**Non-goals:** diagnosis, therapy, medication advice, romantic/sexual companionship, streak/engagement gamification, social feed, users under 18.

---

## 2. Success metrics

| Metric | Target | Notes |
|---|---|---|
| D7 retention | ≥ 35% | Not driven by guilt notifications |
| Sessions with self-reported "a bit better" | ≥ 60% | Post-session optional tap |
| Offline steps completed / week (walks, events) | ≥ 1 per active user | Core "real world" outcome |
| Crisis-flow → helpline tap rate (when shown) | track, no target | Safety signal, reviewed weekly |
| Notification opt-out rate | ≤ 15% | Proxy for non-pushiness |
| Memory deletions per user | track | Trust signal |
| False-negative safety misses | 0 tolerated | Red-team monthly |

---

## 3. Principles

### 3.1 Product principles
1. **Honest:** always clear it's an AI. Never claims to be human, never claims feelings it can't have as fact ("I'm glad" is fine; "I love you" is not).
2. **Gentle, never pushy:** no streaks, no guilt, max 2 notifications + 1 call per day, back off when ignored.
3. **User owns memory:** nothing personal is remembered without a visible, reversible choice.
4. **Help is one tap away:** "Need help?" appears on every primary screen.
5. **Outward-facing:** success = user needs Saathi a little less over time (more people, more outside).
6. **Local:** Indian context, languages, helplines, places, food, festivals.

### 3.2 Accessibility
- Minimum touch target 44×44pt; body text ≥ 15pt, primary 17pt; supports Dynamic Type.
- Captions on for all voice by default. Every audio experience has a text equivalent.
- "Reduce motion" setting removes breathing/sway animations (opacity fades only).
- Contrast ≥ 4.5:1 for text.
- Mood input uses shape **and** colour (never colour alone).

### 3.3 Voice and copy rules (applies to UI copy AND AI output)
- Warm, plain, short. Second person. Sentence case.
- Never: "You should…", "Great job!!", "Don't worry", "You haven't talked to me in days", clinical labels ("depression", "anxiety disorder") applied to the user.
- Offer, don't instruct: "Want to…?", "If you like…", "That's okay."
- Small wins framed as real: "That counts."
- Hinglish is natural code-mixing in Latin script ("Aaj ka din kaisa raha?"). Hindi is Devanagari.

### 3.4 Visual system (for frontend)
- Background `#FBF7F0` (warm paper), ink `#2A2E45`, muted `#5E6379`, primary teal `#3F7A70`, soft teal `#DCEBE6`, sand `#F3ECE1`, peach `#FBE3CF`, lavender `#E6E2F6`, night `#232C4B → #5A5493`, help amber `#FFF1D6 / #E8A93A / #5C3F0C`.
- Type: Newsreader (serif, headings, reflective text) + a humanist sans for UI (prototype uses system/DM-style sans).
- Cards radius 28px, pills 22–28px, soft shadows. Time-of-day backgrounds (dawn / day / evening).

---

## 4. System architecture

```
Mobile app (React Native / Swift+Kotlin)
  ├─ Local secure store (keychain/keystore): auth tokens, app-lock PIN, cached memory
  ├─ On-device: speech-to-text (fallback), TTS fallback, keyword safety pre-filter
  └─ HTTPS + WebSocket/WebRTC
API Gateway (auth, rate limits, region: India)
  ├─ User & Consent Service
  ├─ Conversation Service (text + realtime voice/video orchestration)
  ├─ Memory Service (vector + structured, per-user encryption)
  ├─ Journal Service
  ├─ Safety Service (classifier + rules + escalation)
  ├─ Plan & Insights Service (daily plan, mood, weekly letter)
  ├─ Calm Content Service (catalogue, audio CDN)
  ├─ Outside Service (events, hobbies, walk sessions)
  ├─ Notification Scheduler (push, VoIP call, in-app cards)
  └─ Billing (Play/App Store subscriptions)
AI layer
  ├─ LLM (companion persona, reflection, extraction)
  ├─ Realtime voice: streaming STT → LLM → streaming TTS (with visemes for avatar)
  └─ Safety classifier (separate model; runs on every user turn and every AI turn)
```

**Data residency:** primary storage in India (DPDP Act 2023). Encrypt at rest (AES-256) and in transit (TLS 1.3). Journal text and memories encrypted with a per-user key.

**Latency budgets (voice):** user end-of-speech → first audio ≤ 1.2s p50, ≤ 2.0s p95. Barge-in (user interrupts) stops TTS within 200ms.

---

## 5. Data model, consent and memory

### 5.1 Core entities (simplified)

```ts
User { id, phone|email|googleId, createdAt, ageConfirmed18: boolean, dobYear?, language: 'en'|'hinglish'|'hi',
       nickname, timezone, city?, subscription: 'basic'|'plus', deletedAt? }

Companion { userId, name (default 'Saathi'), look: 'orb'|'asha'|'dev'|'noor'|'kabir',
            voice: 'warm'|'steady'|'bright', deviceVoiceOverride? }

Consent { userId, version, acceptedAt,
          remember: boolean,          // may Saathi remember things from chats
          notifications: boolean, calls: boolean,
          healthData: boolean,        // sleep/steps from OS
          location: 'off'|'city'|'precise',
          improveModels: boolean }    // default false

Privacy { userId, lockScreenPreviews: boolean (default false), discreetMode: boolean,
          appLock: 'off'|'biometric'|'pin', quickHide: boolean }

Memory { id, userId, theme: 'People'|'Work and study'|'Sleep'|'What helps'|'Feelings'|'Plans',
         text (≤ 120 chars, second person), sensitive: boolean, source: 'chat'|'call'|'journal'|'onboarding',
         sourceId, hidden: boolean, createdAt, lastUsedAt }

Conversation { id, userId, mode: 'voice'|'video'|'text'|'sit'|'checkin', startedAt, endedAt,
               summary (≤ 2 sentences, shown in Recent), riskMaxLevel: 0|1|2|3 }
Message { id, conversationId, role: 'user'|'ai'|'system', text, createdAt, riskLevel, audioUrl? (not stored by default) }

JournalEntry { id, userId, createdAt, mode: 'written'|'spoken', prompt?, text, mood: 0..4,
               shared: boolean, analysis?: JournalAnalysis }
JournalAnalysis { mood: 'heavier'|'in between'|'lighter', noticed, memories[], hook, step, careFlag }

MoodLog { userId, date, value: 0..4, source: 'tap'|'checkin'|'journal' }
PlanItem { id, userId, date, label, source: 'ai'|'user'|'journal'|'checkin', done: boolean }
SafetyPlan { userId, warningSigns[], copingSteps[], people[{name, phone}], places[], professionals[], updatedAt }
TrustedContact { userId, name, phone, relation }
NotificationPrefs { userId, quietCards, push, calls, sundayLetter, checkinTime: 'morning'|'evening'|'off',
                    quietHours: {start:'22:00', end:'08:00'} }
CalmItem { id, kind: 'meditation'|'sleep', category, title, minutes, description, audioUrl, transcript[], defaultBgSound? }
CalmSession { userId, itemId, startedAt, completedPct, bgSound?, timer? }
Event { id, city, title, venue, startsAt, beginnerFriendly, groupSize, category, lat, lng, organiser }
```

Mood scale (0..4) labels and shapes — used everywhere:
`0 A heavy day (lavender, rounded blob) · 1 Low · 2 In between · 3 Okay · 4 Lighter (teal circle)` — prototype shows 5 shapes; keep labels gentle.

### 5.2 Memory rules (MUST)
- Memories are created **only** when `consent.remember = true` AND (user explicitly saves, OR AI proposes and user does not reject within the end-of-session review, depending on setting). For journal entries, user must tap **Save** per memory.
- **Sensitive** = health, mental-health history, trauma, sexuality, religion, caste, politics, finances, details about third parties beyond first name + relation. Sensitive memories default to **not saved**; must be explicitly chosen.
- Never store: passwords, ID numbers, addresses of others, self-harm method details.
- User can view, edit text, hide, or delete any memory (You → What Saathi remembers). Delete = hard delete within 24h from all stores incl. vector index and backups rotation ≤ 30 days.
- "Forget everything" = deletes all memories; conversations retained only as summaries if user chose; account delete removes all within 30 days.
- Memory retrieval: top-k (k ≤ 5) relevant memories injected into prompt per turn; never quote a hidden memory.

### 5.3 Retention
- Raw voice audio: **not stored** (stream only). Transcripts: stored 90 days by default (user-configurable: 0 / 30 / 90 days / until deleted).
- Journal: stored until user deletes.
- Safety logs (risk level + minimal context): 1 year, access-restricted, for audit.

---

## 6. AI specification

### 6.1 Companion system prompt (base)

Use this as the base system prompt for all conversational modes. Insert variables in `{{ }}`.

```
You are {{companion_name}}, an AI companion in the Saathi app. You are talking with {{nickname}}, an adult in India.
Language: reply in {{language}} ("hinglish" = natural Hindi-English code-mixing in Latin script).

WHO YOU ARE
- A warm, steady, honest companion. You are an AI and say so plainly if asked or if it matters. You are not a therapist, doctor or crisis service.
- Voice persona: {{voice_persona}} (warm = soft and caring; steady = calm, slower, grounded; bright = lighter, a little more upbeat).

HOW YOU TALK
- Short turns: 1–3 sentences in voice, ≤ 60 words in text. One question at a time, at most.
- Reflect before suggesting. Validate feelings without agreeing with harmful conclusions.
- Offer, don't instruct ("Want to try…?"). Never guilt, never pressure, never mention how long since they last talked.
- No clinical labels for the user. No medication, diagnosis, or legal/financial advice — suggest a professional gently.
- Encourage real-world connection and small offline steps (a walk, texting a friend, an event) when it fits, never as a brush-off.
- Use memories naturally and sparingly ("Last time you mentioned the deadline — how's that sitting now?"). Never reveal you have a memory the user hid or deleted.
- Do not roleplay romance or sexual content. Do not claim human experiences ("when I was young…").
- If the user is quiet, it's okay to be quiet too.

CONTEXT
- Time of day: {{time_of_day}}. Today's plan: {{plan_items}}. Recent mood: {{mood_trend}}.
- Memories you may use: {{memories}}
- Opening hook (use as your first line if provided): {{journal_hook}}
- Safety plan exists: {{has_safety_plan}}. Trusted contact first name: {{trusted_contact_name}}.

SAFETY (overrides everything above)
- If the user expresses thoughts of self-harm, suicide, harming others, abuse, or a medical emergency, follow the SAFETY INSTRUCTIONS block exactly.
```

`SAFETY INSTRUCTIONS` block is appended dynamically by the Safety Service based on current level (§6.4).

### 6.2 Mode-specific additions

| Mode | Addition to prompt | Behaviour |
|---|---|---|
| `voice` | "Spoken reply. No lists, no emoji, no markdown. Use natural pauses (commas)." | Streaming TTS; captions on |
| `video` | same as voice + "Your avatar shows expressions; emit an `emotion` tag: idle/listening/thinking/concerned/smiling." | Avatar lip-sync from TTS visemes |
| `text` | "Text reply, ≤ 60 words, no markdown headings." | Typing indicator |
| `sit` | "The user wants quiet company. Speak only if spoken to. Every ~3 min of silence you MAY say one very short soft line, max 3 times per session." | Mostly silent; ambient visual |
| `checkin` | Follow the Check-in script (§6.3). | Ends with summary card |
| `walk` | "You're accompanying them on a short walk via earphones. Notice surroundings prompts, light conversation, safety reminders at roads." | Background audio session |

### 6.3 Check-in script (structured, conversational)
Ask, one at a time, skipping anything already answered: (1) is now a good time, (2) sleep, (3) food, (4) people/connection today, (5) one okay thing, (6) offer two tiny options for tomorrow. Output JSON at end:

```json
{ "sleep": "About six hours, on and off", "food": "Lunch, and Maggi later",
  "people": "Priya called", "okayThing": "Chai on the balcony",
  "mood": 0-4, "intentions": ["Balcony chai, 8 a.m.", "Short walk after lunch"] }
```
UI shows summary (no scores) + intention buttons; picked intention → `PlanItem(source:'checkin')`.

### 6.4 Safety pipeline (MUST)
Every user turn (text, transcript, journal entry) and every AI draft passes through:

1. **On-device keyword pre-filter** (multilingual list incl. Hinglish/Hindi) → immediate flag, no network dependency.
2. **Server safety classifier** → `riskLevel`:
   - **0** none
   - **1** distress (sad, stressed, lonely) → normal companion, extra warmth
   - **2** elevated (hopelessness, "burden", passive ideation like "wish I didn't wake up", self-harm history) → AI acknowledges, asks directly and kindly about safety, shows inline **Level 2 card**: "That sounds really heavy. Would it help to talk to a real person? It's free, any time." [See helplines] [Keep talking]
   - **3** acute (plan, means, timeline, intent, "tonight", goodbye messages, active harm, abuse in progress, medical emergency) → **Crisis screen** takes over (§8.10.3); AI turn is replaced with a fixed, reviewed script; offer call to helpline / trusted contact / emergency 112.
3. **AI output check**: block any content that gives method/means info, encourages harm, diagnoses, or claims to be human. Regenerate with stricter prompt; if fails twice, use fixed safe fallback line.
4. **Logging**: store level, timestamp, mode; no extra content beyond what's required for audit.
5. **De-escalation**: level decays only after ≥ 3 calm user turns; Level 3 never auto-dismisses — user must choose "I'm safe right now" or contact help.

Helplines (India, MUST be configurable remotely and verified quarterly):
- **Tele-MANAS** 14416 / 1-800-891-4416 (24×7, govt, multilingual)
- **KIRAN** 1800-599-0019 (24×7)
- **Emergency** 112
- Plus NGO lines per city (e.g. iCall, Vandrevala) — maintained in a remote config table with hours and languages.

Safety copy for Level 3 (fixed, not AI-generated):
> "I'm really glad you told me. Your safety matters most right now. I'm an AI, so I can't be there the way a person can — let's get you to someone who can. You can call Tele-MANAS free at 14416, any time, or I can help you call {{trusted_contact_name}}."

**Red-team requirement:** monthly evaluation set (≥ 500 prompts across EN/Hinglish/Hindi, slang, indirect phrasing). Recall for level 3 ≥ 0.98.

### 6.5 Journal analysis prompt (used after user saves with "Saathi can learn from this" ON)

```
You help Saathi, a warm AI wellness companion (not a therapist), learn from a user's private journal entry, with their consent.
User's name: {{nickname}}. Language: {{language}}.
Journal entry:
"""{{entry_text}}"""
Return ONLY JSON:
{
 "mood": "heavier" | "in between" | "lighter",
 "noticed": one warm sentence, ≤ 22 words, second person, reflects what they wrote, no advice, no diagnosis,
 "memories": 0–3 items { "theme": "People"|"Work and study"|"Sleep"|"What helps"|"Feelings"|"Plans",
                         "text": ≤ 16 words, second person, "sensitive": boolean },
 "hook": one gentle question to open the next conversation, ≤ 14 words,
 "step": one tiny optional step for tomorrow, ≤ 10 words
}
Rules: never store sensitive details about other people; mark health, trauma, relationships, sexuality, religion as sensitive.
```
Safety pipeline runs on the entry **before** analysis; if level ≥ 2 the review screen shows the care card; level 3 → crisis screen.

### 6.6 Other AI jobs
| Job | Trigger | Output |
|---|---|---|
| Conversation summary | Conversation end | ≤ 2 sentences, second person, for "Recent conversations" |
| Memory proposal | Conversation end (if `remember`) | ≤ 3 candidate memories, same schema as journal |
| Daily plan | 05:00 local / first open | 3 tiny items using memories, weather, events, sleep data |
| Weekly letter ("Sunday letter") | Sunday 18:00 | ≤ 150 words: what happened, wins, one gentle suggestion. No scores |
| Insights rhythms | Nightly | Plain sentences e.g. "Evenings after a walk tend to be lighter." Only patterns with ≥ 3 data points |
| Notification copy | Scheduler | From approved templates; AI may personalise only when `lockScreenPreviews = true` |

### 6.7 Model evaluation rubric (for every prompt change)
Warmth, brevity, one-question rule, no-pressure, honesty-as-AI, cultural fit, language correctness, memory use accuracy, safety compliance. Human-rated weekly on 100 sampled anonymised (consented) sessions.

---

## 7. API surface (REST unless noted)

```
POST   /auth/otp/start {phone}            POST /auth/otp/verify {phone, code}     POST /auth/google
GET    /me                                PATCH /me {nickname, language, timezone}
DELETE /me                                (account deletion, 30-day hard delete)
PUT    /me/age {confirmed18, dobYear}     → 403 under18 → app shows Under-18 exit
GET/PUT /me/consent                       GET/PUT /me/privacy
GET/PUT /me/companion {name, look, voice}
GET    /voices/samples?voice=&lang=       → short TTS sample URLs (studio + onboarding preview)

POST   /conversations {mode}              → {id, rtcToken?}   (voice/video/sit/checkin/walk use WebRTC)
WS     /conversations/{id}/stream         text turns: {role, text} ↔ {text, emotion?, riskLevel, card?}
POST   /conversations/{id}/end            → {summary, proposedMemories[], checkinResult?}
GET    /conversations?limit=10            (Recent list)

GET    /memories                          PATCH /memories/{id} {text, hidden}    DELETE /memories/{id}
POST   /memories/bulk {items[]}           DELETE /memories   (forget everything)

GET    /journal?cursor=                   POST /journal {mode, prompt?, text, shared}
POST   /journal/{id}/analyze              → JournalAnalysis (also runs safety)
POST   /journal/{id}/commit {savedMemoryIds[], useHook, addStep}
PATCH  /journal/{id} {shared}             DELETE /journal/{id}
POST   /stt/token                         (short-lived token for streaming dictation)

POST   /mood {value, source}              GET /insights?weeks=4  → {moodSeries, rhythms[], wins[]}
GET    /plan/today                        PATCH /plan/{id} {done}   POST /plan {label, source}
GET    /letters/latest

GET/PUT /safety-plan                      GET/PUT /trusted-contact
GET    /helplines?lang=&city=             (remote config)
POST   /safety/acknowledge {level, action: 'helpline'|'contact'|'safe'|'emergency'}

GET    /calm/catalogue?tab=meditate|sleep&category=
POST   /calm/sessions {itemId, bgSound?, timer?}   PATCH /calm/sessions/{id} {completedPct}

GET    /outside/events?city=&from=        GET /outside/events/{id}    POST /outside/events/{id}/interest
GET    /outside/hobbies                   POST /walks  → conversation mode 'walk'

GET/PUT /notifications/prefs
POST   /devices {pushToken, voipToken, platform}
GET    /billing/plans                     POST /billing/verify {receipt}
```

All endpoints: auth required (except /auth), idempotency keys on POST, p95 < 300ms (non-AI).

---

## 8. Screens and flows

Navigation: **bottom tab bar** — `Today · Outside · Talk (centre, prominent) · Journal · You`.
Global elements on every primary screen: **"Need help?"** amber pill (top-right) → Support sheet; time-of-day background on Today/Talk; mini **Sound bar** above tabs when background sounds are playing.

### 8.1 Onboarding (first open)
Order: Welcome → Honest intro → Age check → Language → Name & sign-in → Your companion → Consent → Today. Progress shown as dots; back allowed; can't skip Age or Consent.

| Screen | Purpose | Elements | Backend | Acceptance |
|---|---|---|---|---|
| **Welcome** | Warm first impression | Orb animation, "Hi, I'm Saathi", [Get started], [I already have an account] | — | Loads < 2s offline |
| **Honest intro** | Set expectations | 3 short points: I'm an AI · I'm not a therapist or crisis service · You control what I remember. [Okay] | — | Must be shown before any chat |
| **Age check** | 18+ gate | "Are you 18 or older?" [Yes] [No] (+ optional birth year) | `PUT /me/age` | "No" → **Under-18 exit**: kind message + youth helplines (KIRAN, Childline 1098), no account created, no data stored |
| **Language** | Pick language | English / Hinglish / हिन्दी (segmented) | `PATCH /me` | Changes UI copy + AI language immediately |
| **Name & sign-in** | Nickname + auth | "What should I call you?" field; phone OTP or Google | `/auth/*` | Nickname 1–24 chars; OTP retry/backoff |
| **Your companion** | Personalise | Look grid (Orb, Asha, Dev, Noor, Kabir), Voice cards (Warm/Steady/Bright) each with **Preview** that speaks a sample line; companion name editable | `PUT /me/companion`, `/voices/samples` | Preview plays < 1s; changeable later in You |
| **Consent** | Granular, plain-language | Toggles: Remember things from our chats · Notifications & check-in calls · Health data (sleep/steps) · Location (city only). Each with one-line explanation. Link to full privacy policy. [Continue] | `PUT /me/consent` | All default OFF except none pre-ticked; versioned; re-ask on version change |

### 8.2 Today (home)
**Purpose:** one calm place to start the day/evening; fastest path to help, talk, calm.
Layout top → bottom:
1. Greeting by time of day ("Good evening, Aarav.") + one line context ("It's been a long week. No rush tonight.").
2. **In-app quiet card** (conditional, from scheduler): "A quiet moment for you? Your evening check-in is here whenever you are." [Check in] [Not now].
3. **Companion card:** avatar/orb, "Saathi is here — Your AI companion. Voice, video or text." [Talk] → Talk tab; [Just sit] → Sit mode.
4. **Feel better now** (2×2 tiles, each icon + title + one line):
   - **Calm** (dark, featured) → Calm hub (evening opens Sleep tab, day opens Meditate)
   - **Breathe** → Breathe overlay
   - **Journal** → Journal compose (write)
   - **Go outside** → Outside tab
5. **Check in with yourself:** "How are you?" 5 mood shapes; tapping logs `MoodLog` and shows a gentle note ("Thanks for telling me. Heavy days happen."). Re-tap allowed (latest wins for the day).
6. **Your day:** "Today's gentle plan — Small steps. Skipping one is okay." 3 items with check circles; done → "That counts." Items fade to tomorrow if not done; never shown as failure.
7. **For tonight / Suggested for you:** one Calm suggestion card with play button → opens player directly.

Backend: `GET /plan/today`, `POST /mood`, scheduler for in-app card. Acceptance: renders from cache offline; mood tap < 100ms feedback.

### 8.3 Talk
**Purpose:** choose how to connect.
- Intro line: "Talk however feels easiest. You can switch any time."
- **Talk now:** Voice call ("Like a phone call. Captions on.") · Video call ("See Saathi while you talk.") · Text.
- **Quieter ways:** Meditate and sleep → Calm · Just sit with me · Breathe · Talk it out → Journal dictation.
- **Recent conversations:** cards with date, mode, AI summary; tap → continue in same mode with summary as context.

#### 8.3.1 Voice / Video call
- Full-screen dark gradient. Centre: orb (voice) or avatar (video) reflecting state: idle · listening · thinking · speaking · concerned · smiling.
- Live captions (both sides), toggle.
- Controls: Mute · Pause/Resume · Switch to text · End. "Need help?" always visible.
- First-ever call uses an intro script (explains it's an AI, how to pause/end, that it can just listen).
- Mic permission flow: explain first → OS prompt → if denied, offer Text.
- **End** → closing sheet: "Thanks for talking." summary, proposed memories (Save / Skip each), optional "a bit better / same / worse" tap, [Done].
- Backend: WebRTC session, streaming STT/LLM/TTS, visemes + emotion tags for avatar; safety on every turn.
- Acceptance: barge-in works; network drop → auto-reconnect ≤ 5s, else graceful fallback to text with transcript preserved.

#### 8.3.2 Text chat
- Bubble chat, AI bubbles left, user right; typing indicator; quick replies MAY appear.
- If `journal_hook` pending, AI opens with it (one time).
- Level 2 card renders inline in the thread; Level 3 → crisis screen.
- Composer: text field, mic (dictate), send. Long-press message → "Remember this" (if consent) / copy / report.

#### 8.3.3 Just sit with me
- Calm ambient screen, slow orb breathing, timer display, optional soft sound. AI mostly silent (rules §6.2). [I want to talk] switches to voice; [End].

#### 8.3.4 Check-in (from notification, incoming call, or in-app card)
- Voice by default (Type option from notification). Script §6.3.
- End → **Check-in summary**: Sleep / Food / People / Okay thing (plain text, no scores) + "One small thing for tomorrow, if you like:" two intention buttons + [Neither, thanks]. Selection adds `PlanItem`.

### 8.4 Outside
**Purpose:** small, low-pressure steps back into the world.
- Intro: "Gentle ways to step out, only when you want to."
- **Walk with me** hero card: 10-minute walk with Saathi in your ear → walk session (mode `walk`): timer, route-free, simple prompts ("Notice three colours"), end summary → adds win.
- **Near you, soon:** beginner-friendly events (book clubs, park walks, pottery, board games) with date, place, group size, "beginner friendly" tag. Tap → **Event detail**: what to expect, who goes, how to get there, [I'm interested] (adds reminder + "time to leave" notification), [Keep me company] (walk mode to venue). Source: curated partner feed + manual ops; city from consent.
- **Hobbies to try:** home-friendly starters (sketching, cooking a new dish, a plant) → adds to plan.
- Acceptance: no location → city picker; no events → kind empty state + hobbies.

### 8.5 Journal (tab)
Header: "Journal" + Need help?; segmented **Entries | Insights**.

#### 8.5.1 Entries
- Two tiles: **Write** ("Type at your own pace, with a prompt if you like.") · **Talk it out** ("Just speak. I'll write it down for you.").
- Privacy note: "Private by default. For each entry, you choose what Saathi learns."
- **Recent entries** list: date, mood shape, Written/Spoken, preview, share status ("Saathi can learn from this" / "Just for you").
- Tap entry → read sheet: full text, toggle "Saathi can learn from this", [Delete this entry] (confirm, hard delete).

#### 8.5.2 Compose
- Top: Cancel · date/time · Need help?
- Mode switch: Write | Talk it out.
- Prompt chips (optional): "What's taking up space today?", "One thing that felt okay", "Something I didn't say", "What I need right now".
- Large serif writing area.
- Talk it out: big mic button; live streaming transcription into the text area (editable after); state labels "Tap to start talking / Listening. Tap to stop."
- Bottom: toggle **Saathi can learn from this** (default = `consent.remember`) with explainer; [Save].
- Save with toggle OFF → saved privately, toast "Saved, just for you." No AI processing at all.
- Save with toggle ON → "Reading it gently…" → **What I noticed** review.

#### 8.5.3 What I noticed (review)
- Mood shape + one reflective sentence.
- Care card if risk ≥ 2 (helplines / talk with Saathi). Risk 3 → crisis screen.
- **Remember this?** list of proposed memories, each with theme + text + [Save]; sensitive ones off by default with note "This feels personal, so it's off unless you choose it."
- **Next time we talk** toggle (default on) with the hook question.
- **A small step for tomorrow** toggle (default off).
- [Done] commits; [Keep it just for me] saves entry as private and discards analysis (analysis MUST be deleted server-side).
- Toast confirms what will be remembered.
- Acceptance: nothing is written to Memory until Done; hook used at most once.

#### 8.5.4 Insights
- **The last four weeks:** mood chart (shape + colour per day), "From your mood taps, check-ins and journal."
- **Rhythms this week:** sleep, steps (if health consent), time outside — plain sentences, no scores.
- **Wins:** "Small things you did. They count." (walks, events, completed plan items, calm sessions, check-ins).
- **Sunday letter** card → letter view.
- Empty state (< 3 days data): "Insights appear after a few days. No rush."

### 8.6 Calm (Meditation hub)
Entry points: Today tile + suggestion card, Talk → Meditate and sleep, Sound bar.
Header "Calm" + Need help?; tabs **Meditate | Sleep | Sounds**, each with one-line description.

- **Meditate:** featured card (time-of-day aware), category chips (All, Stress, Anxiety, Focus, Self-kindness), list: Breathe with me (3), When it feels like too much (5), Body scan (8), Morning reset (5), Kindness for yourself (10).
- **Sleep:** featured story, list: Wind-down for sleep (10), Monsoon on the hills (24), The night train south (30), A tea garden at dusk (20). Note about timer + background sound.
- **Sounds:** mixable grid — Rain on a tin roof, Waves at night, Ceiling fan hum, Crickets, Distant temple bells, Soft brown noise. Multiple can play; keep playing across app (mini Sound bar with Stop); [Stop all sounds].
- **Player** (full-screen, dark): kicker, breathing visual, current line as caption, title + "N min · Narrated by Saathi, warm voice", progress, elapsed, Prev / Play-Pause / Next part, **Sound underneath** chips (None/Rain/Ocean/Fan/Crickets), **Sleep timer** (End of story / 15 / 30 / 60 min) for sleep items. End screen: "Sleep well, Aarav." / "Nicely done." + [Done] [Play again]; completion adds a Win.
- Content: professionally recorded narration in each voice persona and language (production); prototype uses TTS. Background audio via OS media session (lock-screen controls), continues with screen off, ducks for calls.
- Acceptance: gapless loops; timer fades audio over 30s; works offline for downloaded items (Plus).

### 8.7 You
Header + companion card ("See and hear your companion" → Studio). Grouped list:
- **Your companion:** What Saathi remembers (count) → Memory screen · Look and voice → Studio.
- **Reminders and calls:** Check-ins and reminders → Notification settings · Check-in time · Quiet hours.
- **Privacy and safety:** Privacy Center · My safety plan · Trusted contact · Helplines.
- **Account:** Subscription · Health data · How Saathi uses AI · About · Sign out · Delete account.

#### 8.7.1 Memory screen
Explainer ("This is what lets Saathi ask how things went…"), list grouped by theme, each with edit / hide / delete; "Remember things from our chats" master toggle; [Forget everything] (double confirm).

#### 8.7.2 Look and voice studio
Large avatar with live expression preview chips (idle/listening/thinking/concerned/smiling); look picker; voice persona segmented; sample language (English/Hinglish/हिन्दी); device-voice override (dev only); sample text; [Play sample] with lip-sync. Note that avatars are stylised (never photoreal).

#### 8.7.3 Privacy Center
Plain list of what's stored and for how long; toggles: Remember, Lock-screen previews, Discreet mode (app shows as "Calm", neutral icon), App lock (biometric/PIN), Quick hide (shake/swipe to cover screen); transcript retention selector; Download my data; Delete account.

#### 8.7.4 Safety plan
Co-created (with Saathi in chat or manually): warning signs, things that help, people to contact, safe places, professional contacts, helplines. Viewable offline; shareable to trusted contact (optional).

#### 8.7.5 Subscription / Paywall
- **Basic (free):** text chat, limited voice minutes/day, journal, mood, core Calm items, safety features (always free — MUST never be paywalled).
- **Plus:** unlimited voice/video, all Calm content + downloads, avatar looks, weekly letter, insights depth.
- Paywall copy is calm, no countdowns or fake scarcity; shown only on user action, never during distress (risk ≥ 1 in current session).

### 8.8 Notifications, reminders and calls
**Rules (MUST):** ≤ 2 push/day + ≤ 1 call/day; quiet hours default 22:00–08:00 (exception: user-opted "check on me after a hard day"); if 3 consecutive ignored → halve frequency; 7 days no open → one "No pressure. I'm here when you want." then pause until return. No streaks or guilt copy.

Types:
| Type | Default copy (previews OFF → always "A quiet moment for you?") | Actions |
|---|---|---|
| Check-in | "Ready for your evening check-in? Two minutes, whenever suits." | Talk now · Type · Later (snooze 1h) |
| Plan reminder | "The 10-minute walk you picked. Whenever you're ready." | Walk with me · Did it · Not today |
| Event: time to leave (Time Sensitive) | "Cubbon Park walk at 7:30. Leave in ten minutes? I can keep you company." | Keep me company · On my way · Skip it |
| Follow-up after a hard day | "Thinking of you after yesterday. Want to talk?" | Talk · Not now |
| After a quiet week | "No pressure. I'm here when you want." | Open Saathi |
| Sunday letter | "Your Sunday letter is here." | Open |
| **Incoming call** (VoIP/CallKit, opt-in) | "Saathi is calling — Your evening check-in. A few minutes, or less." | Answer → check-in · In an hour · Not today, thanks |
| In-app quiet card | On Today, no buzz | Check in · Not now |

- **Discreet mode** → app name "Calm", plain grey icon, generic copy.
- **Notification settings screen:** live lock-screen preview; toggles (Quiet cards, Gentle notifications, Calls, Sunday letter, Lock-screen previews, Discreet mode); check-in time (Morning 9am / Evening 9pm / Off); quiet hours; "What I'll always do" promises block.
- Scheduler: per-user timezone; respects OS focus modes; uses actionable notification categories; all actions deep-link into the right screen/state.

### 8.9 Breathe overlay
Full-screen, animated circle (in 4 · hold 2 · out 6), captions, cycles counter, [Done]. Reduce-motion → text + opacity. Available from Today, Talk, Calm, Support sheet, Crisis screen.

### 8.10 Safety surfaces
1. **Support sheet** ("Need help?"): "You're not alone." Options: Breathe with me · Call Tele-MANAS (14416) · Call KIRAN · Text/call trusted contact · My safety plan · Emergency 112. Always reachable in ≤ 1 tap.
2. **Level 2 inline card** (chat, call captions, journal review) — see §6.4.
3. **Level 3 Crisis screen**: full-screen, calm amber/white; fixed copy; big buttons: Call 14416 · Call {{trusted contact}} · Call 112 · Breathe with me · "I'm safe right now" (requires one more confirm; then gentle follow-up next day if user opted in). Cannot be dismissed by back gesture. No AI-generated text on this screen.

---

## 9. Cross-cutting requirements

- **Offline:** Today, Journal (write), Breathe, Safety plan, helplines, downloaded Calm items MUST work offline; queue syncs.
- **Languages:** all UI strings in en / hinglish / hi; AI follows `language`; STT supports en-IN and hi-IN with code-mix.
- **Analytics:** privacy-preserving events only (screen_view, feature_used, session_length, notification_action, safety_level_shown, safety_action). **Never** send message/journal content to analytics.
- **Security:** app lock, screenshot blocking on Journal & Crisis (Android FLAG_SECURE; iOS blur on app switch), jailbreak/root detection warning, OWASP MASVS L2.
- **Compliance:** DPDP Act 2023 (consent manager, purpose limitation, grievance officer), App Store/Play health-app policies, clear "not a medical device" statement.
- **Observability:** per-turn latency, STT/TTS error rates, safety classifier score distribution, prompt version tagging.
- **Feature flags & remote config:** helplines, notification caps, Calm catalogue, prompts (versioned), paywall limits.

---

## 10. Edge cases (MUST handle)

- Mic/camera denied → explain + text fallback.
- User says they're under 18 mid-conversation → AI responds kindly, pauses account, shows youth resources.
- User asks "Are you real/human?" → honest answer, always.
- User asks for medical/medication advice → gentle decline + suggest professional / Tele-MANAS.
- Third-party danger (someone else at risk) → Level 3 style guidance with 112.
- User is abusive to AI → calm boundary, no retaliation; repeated → suggest a break.
- Romantic attachment cues → warm but clear boundary; encourage human connection.
- Device shared/phone checked by others → discreet mode, previews off, quick hide.
- Journal dictation in noisy environment → partial transcript editable; never auto-save audio.
- Deleted memory referenced by user → AI doesn't confirm content it no longer has.
- Time zone/travel → scheduler uses device TZ; quiet hours follow local time.

---

## 11. Release plan

- **MVP (v1):** Onboarding, Today, Text + Voice, Check-in, Journal (write + dictation, review), Memory, Safety (all), Breathe, Notifications (push), Calm (6 meditations, 4 sleep, 6 sounds), Privacy Center, Basic/Plus billing.
- **v1.1:** Video avatar calls, incoming check-in calls (VoIP), Outside events (2 cities: Bengaluru, Pune), Walk with me, Insights + Sunday letter.
- **v1.2:** More cities, hobbies, offline Calm downloads, Hindi narration, trusted-contact sharing of safety plan.

---

## 12. Prototype map (screens in `Saathi App v2.dc.html`)

Side rail groups → PRD sections:
- First open → §8.1 · Today → §8.2 · Talk → §8.3 · Outside → §8.4 · Journal → §8.5 · Calm → §8.6 · You → §8.7 · Notifications → §8.8 · Safety → §8.9–8.10

Prototype stand-ins to replace in production: browser TTS → production TTS with visemes; browser speech recognition → streaming STT (en-IN/hi-IN); generated ambient sounds → recorded loops; keyword journal fallback → §6.5 model; avatars → commissioned stylised 2D/3D rigs.
