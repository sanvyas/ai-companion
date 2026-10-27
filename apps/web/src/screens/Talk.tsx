import { useEffect } from 'react';
import { C, TOD, shadow } from '../theme';
import { dayOf, useStore } from '../state/store';
import { go, loadTalk, openBreathe, openChat, startCall, startJournal } from '../state/actions';
import { useTimeOfDay } from '../hooks';
import { Chevron, Heading, Intro, Scroll, TabHeader, flex } from '../components/ui';
import { P, Svg } from '../components/icons';

interface Row { label: string; desc: string; tint: string; icon: string; onTap: () => void }

function RowCard({ rows, label }: { rows: Row[]; label: string }) {
  return (
    <div role="list" aria-label={label} style={{ background: C.white, borderRadius: 28, padding: '4px 18px', boxShadow: shadow.card, ...flex('column') }}>
      {rows.map((tm, i) => (
        <button role="listitem" key={tm.label} data-track={`talk.${tm.label.toLowerCase().replace(/[^a-z]+/g, '_')}`} onClick={tm.onTap} style={{ ...flex('row', 14), alignItems: 'center', textAlign: 'left', border: 'none', background: 'none', padding: '14px 0', borderBottom: i < rows.length - 1 ? `1px solid ${C.rule}` : 'none' }}>
          <div style={{ flex: 'none', width: 48, height: 48, borderRadius: '50%', background: tm.tint, display: 'grid', placeItems: 'center' }}><Svg d={tm.icon} /></div>
          <div style={{ flex: 1, ...flex('column', 2) }}><span style={{ fontSize: 17, fontWeight: 600 }}>{tm.label}</span><span style={{ fontSize: 15, color: C.muted, lineHeight: 1.4 }}>{tm.desc}</span></div>
          <Chevron />
        </button>
      ))}
    </div>
  );
}

export function Talk() {
  const tod = useTimeOfDay();
  const compName = useStore(s => s.compName);
  const recent = useStore(s => s.recent);
  useEffect(() => { void loadTalk(); }, []);
  const now: Row[] = [
    { label: 'Voice call', desc: 'Like a phone call. Captions on.', tint: C.tealSoft, icon: P.mic, onTap: () => void startCall('voice') },
    { label: 'Video call', desc: `See ${compName} while you talk.`, tint: C.lavender, icon: P.video, onTap: () => void startCall('video') },
    { label: 'Text', desc: 'Type, at your own pace.', tint: C.peach, icon: P.text, onTap: () => void openChat() },
  ];
  const quiet: Row[] = [
    { label: 'Meditate and sleep', desc: 'Guided meditations, sleep stories and sounds.', tint: C.lavenderDeep, icon: P.moon, onTap: () => go('calm') },
    { label: 'Just sit with me', desc: 'Quiet company. No need to say anything.', tint: C.lavender, icon: P.person, onTap: () => void startCall('sit') },
    { label: 'Breathe', desc: 'A slow, guided breathing exercise.', tint: C.sky, icon: P.wave, onTap: openBreathe },
    { label: 'Talk it out', desc: 'Speak freely. Saved as a private journal entry.', tint: C.sand, icon: P.pen, onTap: () => startJournal('speak') },
  ];
  return (
    <main aria-label="Talk" style={{ position: 'absolute', inset: 0, ...flex('column'), background: TOD[tod].bg }}>
      <TabHeader title="Talk" />
      <Scroll pad="24px 24px var(--scroll-bottom)">
        <Intro>Talk however feels easiest. You can switch any time.</Intro>
        <Heading title="Talk now" sub="A conversation, out loud or typed." />
        <RowCard rows={now} label="Talk now" />
        <Heading title="Quieter ways" sub="For when you don’t feel like a conversation." style={{ marginTop: 8 }} />
        <RowCard rows={quiet} label="Quieter ways" />
        {recent.filter(r => r.summary).length > 0 && (
          <>
            <Heading title="Recent conversations" sub="Short summaries. Tap one to pick it back up." style={{ marginTop: 8 }} />
            <div style={{ ...flex('column'), background: C.white, borderRadius: 28, padding: '4px 20px', boxShadow: shadow.cardSoft }}>
              {recent.filter(r => r.summary).slice(0, 5).map((r, i, arr) => (
                <button key={r.id} onClick={() => void openChat(r.id)} style={{ textAlign: 'left', border: 'none', background: 'none', padding: '16px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.rule}` : 'none', ...flex('column', 3) }}>
                  <span style={{ fontSize: 17, lineHeight: 1.4 }}>{r.summary}</span>
                  <span style={{ fontSize: 15, color: C.muted }}>{dayOf(r.startedAt)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </Scroll>
    </main>
  );
}

