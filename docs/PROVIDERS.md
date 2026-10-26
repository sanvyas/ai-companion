# Connecting the vendors that aren't connected yet

Everything external sits behind a small interface in `apps/api/src/providers/`. Nothing else in the codebase changes when you add one. Each factory lives in `providers/index.ts`; the env var that selects it is in `config.ts`.

## Sign-in codes (SMS or WhatsApp): `OtpProvider`

```ts
interface OtpProvider { name: string; canSend: boolean; send(e164: string, code: string): Promise<void> }
```

Options for India: Twilio Verify, MSG91, Gupshup, Exotel, or the WhatsApp Business API. Note DLT registration for SMS in India (sender ID and template) before launch. Implement `send`, return it from `createOtp` for a new `OTP_PROVIDER` value (add it to the enum in `config.ts`). The service already generates, hashes, expires, throttles and verifies the code; the provider only delivers it. Do not log the code.

## Speech to text: `SttProvider`

```ts
open({ language: 'en-IN' | 'hi-IN', signal }) -> { write(pcm16Mono16k), end(), onTranscript(cb), onError(cb) }
```

Streaming recognisers with Indian English and Hindi: Deepgram, Google Cloud Speech, Azure Speech, Sarvam, AssemblyAI. Choose for Hinglish code-switching accuracy and latency (the first-audio budget is about 1.2 s). Implement it, return it from `createStt`, and add the enum value to `STT_PROVIDER`. `/public-config` then reports `stt: true` and the web app switches from browser recognition to streaming microphone audio automatically. Interim transcripts trigger barge-in.

## Text to speech: `TtsProvider`

```ts
stream({ text, voice: 'warm'|'steady'|'bright', language, signal }) -> AsyncIterable<{ audio: PCM16 mono 24k, visemes? }>
```

Candidates: ElevenLabs, Azure Neural, Google Cloud TTS, Sarvam, Cartesia. Map the three personas to three distinct voices, with Hindi and Hinglish support. If the vendor returns visemes, pass them through for the avatar's mouth; otherwise the client lip-syncs from loudness. Audio is sent sentence by sentence as soon as the safety check passes, and stops within a frame of a barge-in.

## Outbound check-in calls: `TelephonyProvider`

```ts
placeCall({ toE164, conversationId, token }) -> { callId }
```

Twilio, Exotel, Plivo, Knowlarity. The call connects to the same voice WebSocket (needs STT and TTS above). Calls are opt-in (`consent.calls` and the Calls toggle), capped at 1 a day, and respect quiet hours; all of that is already enforced by the notification rules before `placeCall` is invoked. Calling needs TRAI/DLT compliance and a consent record, which the consents table already keeps.

## What to ask me for when you've chosen

The vendor name and its key(s). I'll implement the adapter, add its fake for tests, record `usage_events` for cost, and add timeout/retry/circuit-breaker behaviour.
