import { useEffect, useRef } from 'react';
import { C } from '../theme';
import { getState, set, useStore } from '../state/store';
import { go, openSheet, sendChat, startCall, toast } from '../state/actions';
import { Disc } from '../components/figures';
import { P, Svg } from '../components/icons';
import { HelpPill, flex } from '../components/ui';

export function Chat() {
  const msgs = useStore(s => s.msgs);
  const typing = useStore(s => s.typing);
  const careCard = useStore(s => s.careCard);
  const draft = useStore(s => s.draft);
  const compName = useStore(s => s.compName);
  const hook = useStore(s => s.journalHook);
  const hookUsed = useStore(s => s.hookUsed);
  const ref = useRef<HTMLDivElement>(null);

  // A pending journal hook opens the conversation, once (PRD §8.3.2).
  useEffect(() => {
    const st = getState();
    if (st.journalHook && !st.hookUsed) set(p => ({ hookUsed: true, msgs: [...p.msgs, { who: 'ai', text: p.journalHook! }] }));
  }, [hook, hookUsed]);

  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [msgs.length, typing, careCard]);

  return (
    <main aria-label="Text conversation" style={{ position: 'absolute', inset: 0, ...flex('column'), background: C.paper }}>
      <div style={{ ...flex('row', 8), alignItems: 'center', padding: 'calc(var(--sa-top) + 16px) 16px 12px', background: 'rgba(251,247,240,.96)', boxShadow: '0 8px 24px rgba(42,46,69,.04)', zIndex: 2 }}>
        <button onClick={() => go('talk')} aria-label="Back" style={{ width: 44, height: 44, border: 'none', background: 'none', display: 'grid', placeItems: 'center' }}><Svg d={P.back} /></button>
        <div style={{ flex: 1, ...flex('column') }}>
          <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{compName}</h1>
          <span style={{ fontSize: 13, color: C.muted }}>AI companion</span>
        </div>
        <button onClick={() => startCall('voice')} aria-label="Switch to voice" style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: C.tealSoft, display: 'grid', placeItems: 'center' }}><Svg d="M9 3h6v8a3 3 0 0 1-6 0V3zM5 11a7 7 0 0 0 14 0M12 18v3" size={20} stroke={C.teal} /></button>
        <HelpPill />
      </div>

      <div data-scroll="1" ref={ref} role="log" aria-live="polite" aria-label="Conversation" style={{ flex: 1, overflow: 'auto', padding: '20px 20px 12px', ...flex('column', 8), minHeight: 0 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.who === 'ai' ? 'flex-start' : 'flex-end' }}>
            <div style={{ maxWidth: '80%', padding: '12px 16px', borderRadius: m.who === 'ai' ? '22px 22px 22px 8px' : '22px 22px 8px 22px', background: m.who === 'ai' ? C.white : C.tealSoft, fontSize: 17, lineHeight: 1.55, boxShadow: m.who === 'ai' ? '0 6px 18px rgba(42,46,69,.05)' : 'none', textWrap: 'pretty' }}>
              <span className="sr-only">{m.who === 'ai' ? `${compName} says: ` : 'You said: '}</span>{m.text}
            </div>
          </div>
        ))}
        {typing && (
          <div role="status" style={{ padding: '14px 18px', display: 'flex' }}>
            <span className="sr-only">{compName} is typing</span>
            <div style={{ width: 12, height: 12 }}><Disc size={12} bg={C.teal} /></div>
          </div>
        )}
      </div>

      {careCard && (
        <section aria-label="Support" style={{ margin: '0 16px 10px', background: C.amber, border: `1px solid ${C.amberLine}`, borderRadius: 24, padding: '16px 18px', ...flex('column', 10), animation: 'sUp 600ms cubic-bezier(.22,.61,.36,1)' }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Talk to a real person</div>
          <div style={{ fontSize: 15, lineHeight: 1.45, color: C.amberText }}>Free, any time, in your language. I’ll stay here too.</div>
          <div style={flex('row', 8)}>
            <button onClick={() => openSheet('helplines')} style={{ flex: 1, height: 48, borderRadius: 24, border: 'none', background: C.ink, color: C.white, fontSize: 15, fontWeight: 600 }}>See helplines</button>
            <button onClick={() => set({ careCard: false })} style={{ height: 48, padding: '0 16px', border: 'none', background: 'none', color: C.amberInk, fontSize: 15, fontWeight: 600 }}>Not now</button>
          </div>
        </section>
      )}

      <form onSubmit={e => { e.preventDefault(); sendChat(); }} style={{ ...flex('row', 8), alignItems: 'center', padding: '10px 16px calc(var(--sa-bottom) + 20px)', background: C.paper }}>
        {/* TODO(stt): hold-to-record dictation into the composer (POST /stt/token). */}
        <button type="button" onClick={() => toast('Hold to record a voice note.')} aria-label="Voice note" style={{ flex: 'none', width: 48, height: 48, borderRadius: '50%', border: 'none', background: C.sand, display: 'grid', placeItems: 'center' }}><Svg d={P.mic} size={20} stroke={C.muted} /></button>
        <input aria-label="Message" value={draft} onChange={e => set({ draft: e.target.value })} placeholder="Say anything" autoComplete="off" style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 24, border: 'none', background: C.sand, padding: '0 18px', fontSize: 17, outline: 'none' }} />
        <button type="submit" aria-label="Send" style={{ flex: 'none', width: 48, height: 48, borderRadius: '50%', border: 'none', background: C.teal, display: 'grid', placeItems: 'center' }}><Svg d={P.send} size={20} stroke="#FFFFFF" sw={2} /></button>
      </form>
    </main>
  );
}

