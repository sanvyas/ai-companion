import { C, serif } from '../theme';
import { getState, set, useStore, type NotifKind } from '../state/store';
import { go, startCheckin, toast } from '../state/actions';
import { useClock, todayLong } from '../hooks';
import { Companion } from '../components/figures';
import { P, Svg } from '../components/icons';
import { flex } from '../components/ui';

// Notification content (PRD §8.8). With previews OFF every notification reads "A quiet moment for you?".
// These simulate the OS lock screen for the demo. Real delivery: push/VoIP via POST /devices + the scheduler.
// TODO(notifications): APNs/FCM actionable categories, caps (<=2 push + 1 call a day), quiet hours, back-off.
interface NDef { body: string; tag?: string; actions: [string, () => void][] }

const quietToast = (t: string) => () => { go('lock', { notif: null }); toast(t); };

const NDEF: Record<NotifKind, NDef> = {
  checkin: { body: 'Ready for your evening check-in? Two minutes, whenever suits.', actions: [
    ['Talk now', startCheckin],
    ['Type', () => go('chat', { notif: null, msgs: [...getState().msgs, { who: 'ai', text: 'Check-in time, if you’re up for it.' }, { who: 'ai', text: 'How did you sleep last night?' }] })],
    ['Later', quietToast('Okay. I’ll stay quiet for an hour.')],
  ] },
  plan: { body: 'The 10-minute walk you picked. Whenever you’re ready.', actions: [
    ['Walk with me', () => go('walk', { walkEnded: false, notif: null })],
    ['Did it', () => { set(p => ({ plan: p.plan.map(x => (x.id === 1 ? { ...x, done: true } : x)) })); quietToast('That counts, truly.')(); }],
    ['Not today', quietToast('That’s okay. It’ll fade to tomorrow.')],
  ] },
  leave: { tag: 'Time Sensitive', body: 'Cubbon Park walk at 7:30. Leave in ten minutes? I can keep you company.', actions: [
    ['Keep me company', () => go('walk', { walkEnded: false, notif: null })],
    ['On my way', quietToast('Lovely. 30 minutes is plenty.')],
    ['Skip it', quietToast('No problem. There’s another next Sunday.')],
  ] },
  followup: { body: 'Thinking of you after yesterday. Want to talk?', actions: [
    ['Talk', () => go('call', { callMode: 'voice', micOk: true, notif: null })],
    ['Not now', quietToast('Okay. I’m here when you want.')],
  ] },
  quietweek: { body: 'No pressure. I’m here when you want.', actions: [['Open Saathi', () => go('today', { notif: null })]] },
};

export function buildNotification(kind: NotifKind, compName: string, rich: boolean, disc: boolean) {
  const def = NDEF[kind];
  return {
    app: disc ? 'Calm' : rich ? compName : 'Saathi',
    body: rich ? def.body : 'A quiet moment for you?',
    tag: rich ? def.tag ?? '' : '',
    iconBg: disc ? '#C9CCD6' : C.teal,
    iconDot: disc ? '#FFFFFF' : C.peachDeep,
    actions: def.actions,
  };
}

export function NotifIcon({ bg, dot, size = 38 }: { bg: string; dot: string; size?: number }) {
  return <div aria-hidden style={{ width: size, height: size, borderRadius: size / 3.8, background: bg, flex: 'none', display: 'grid', placeItems: 'center' }}><div style={{ width: size * 0.42, height: size * 0.42, borderRadius: '50%', background: dot }} /></div>;
}

export function LockScreen() {
  const notif = useStore(s => s.notif);
  const compName = useStore(s => s.compName);
  const rich = useStore(s => s.priv.preview);
  const disc = useStore(s => s.priv.discreet);
  const clock = useClock();
  const nt = notif ? buildNotification(notif, compName, rich, disc) : null;
  return (
    <main className="on-dark" aria-label="Lock screen (demo)" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#232C4B 0%,#4A4682 52%,#A79FD6 100%)', color: '#FFFFFF', ...flex('column'), alignItems: 'center', padding: 'calc(var(--sa-top) + 56px) 14px calc(var(--sa-bottom) + 14px)' }}>
      <div style={{ fontSize: 17, fontWeight: 600, opacity: 0.9 }}>{todayLong()}</div>
      <div style={{ fontSize: 92, fontWeight: 300, lineHeight: 1, letterSpacing: -3, marginTop: 4 }}>{clock}</div>
      <div style={{ width: '100%', marginTop: 'auto', ...flex('column', 10) }}>
        {nt ? (
          <div role="alert" style={{ width: '100%', borderRadius: 24, background: 'rgba(246,244,251,.78)', backdropFilter: 'blur(20px)', color: C.ink, padding: 14, ...flex('column', 12), animation: 'sDrop 700ms cubic-bezier(.22,.61,.36,1)' }}>
            <button onClick={nt.actions[0][1]} style={{ textAlign: 'left', border: 'none', background: 'none', padding: 0, ...flex('row', 12), alignItems: 'flex-start', color: 'inherit' }}>
              <NotifIcon bg={nt.iconBg} dot={nt.iconDot} />
              <div style={{ flex: 1, ...flex('column', 2) }}>
                <div style={{ ...flex('row'), justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: 15, fontWeight: 600 }}>{nt.app}</span><span style={{ fontSize: 13, color: C.muted }}>now</span></div>
                {nt.tag && <span style={{ fontSize: 13, fontWeight: 600, color: '#4A4682' }}>{nt.tag}</span>}
                <span style={{ fontSize: 15, lineHeight: 1.4 }}>{nt.body}</span>
              </div>
            </button>
            <div style={flex('row', 6)}>
              {nt.actions.map(([label, fn]) => <button key={label} onClick={fn} style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 14, border: 'none', background: 'rgba(255,255,255,.85)', fontSize: 15, fontWeight: 600, color: C.ink, padding: '0 6px' }}>{label}</button>)}
            </div>
          </div>
        ) : <div style={{ textAlign: 'center', fontSize: 15, opacity: 0.8, padding: 16 }}>No notifications</div>}
      </div>
      <button onClick={() => go('today', { notif: null })} aria-label="Unlock" style={{ marginTop: 28, width: 140, height: 24, border: 'none', background: 'none', display: 'grid', placeItems: 'center', padding: 0 }}><span style={{ width: 140, height: 5, borderRadius: 3, background: '#FFFFFF' }} /></button>
    </main>
  );
}

// CallKit-style incoming check-in call (opt-in, PRD §8.8). TODO(voip): PushKit/ConnectionService.
export function IncomingCall() {
  const compName = useStore(s => s.compName);
  const look = useStore(s => s.look);
  return (
    <main className="on-dark" aria-label="Incoming call (demo)" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 70% at 50% 32%,#2B3A63 0%,#1B2340 48%,#12182B 100%)', color: C.moonText, ...flex('column'), alignItems: 'center', padding: 'calc(var(--sa-top) + 48px) 24px calc(var(--sa-bottom) + 40px)' }}>
      <div style={{ fontSize: 13, color: C.moonMuted, padding: '6px 12px', borderRadius: 14, background: 'rgba(255,255,255,.08)' }}>Time-sensitive · AI companion</div>
      <div style={{ marginTop: 56, width: 210, height: 210, borderRadius: '50%', overflow: 'hidden', background: 'radial-gradient(circle at 50% 40%,rgba(255,255,255,.22),rgba(255,255,255,.05))', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 0 0 10px rgba(207,227,240,.06),0 0 0 22px rgba(207,227,240,.03)' }}><Companion look={look} size={210} mode="listening" /></div>
      <h1 style={{ fontFamily: serif, fontSize: 34, fontWeight: 400, margin: '32px 0 0', textAlign: 'center' }}>{compName} is calling</h1>
      <div style={{ fontSize: 17, color: C.moonMuted, marginTop: 8, textAlign: 'center', lineHeight: 1.5 }}>Your evening check-in. A few minutes, or less.</div>
      <div style={{ marginTop: 'auto', width: '100%', display: 'flex', justifyContent: 'space-around' }}>
        <button onClick={quietToast('Okay. I’ll try once more in an hour.')} style={{ background: 'none', border: 'none', ...flex('column', 10), alignItems: 'center', color: C.moonSoft }}>
          <span style={{ width: 76, height: 76, borderRadius: '50%', background: 'rgba(255,255,255,.14)', display: 'grid', placeItems: 'center' }}><Svg d={P.clock} size={28} stroke={C.moonText} /></span>
          <span style={{ fontSize: 15 }}>In an hour</span>
        </button>
        <button onClick={startCheckin} style={{ background: 'none', border: 'none', ...flex('column', 10), alignItems: 'center', color: C.moonSoft }}>
          <span style={{ width: 76, height: 76, borderRadius: '50%', background: '#7FC4B5', display: 'grid', placeItems: 'center' }}><Svg d={P.phone} size={28} stroke="#12182B" sw={1.9} /></span>
          <span style={{ fontSize: 15 }}>Answer</span>
        </button>
      </div>
      <button onClick={quietToast('No more calls today. I’m here if you want me.')} style={{ marginTop: 22, height: 48, background: 'none', border: 'none', color: C.moonSoft, fontSize: 17, fontWeight: 600 }}>Not today, thanks</button>
    </main>
  );
}
