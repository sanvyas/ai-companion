import { C, BLOBS, serif, shadow } from '../theme';
import { set, useStore } from '../state/store';
import { openPlayer, playStory } from '../state/actions';
import { stopAllSounds, toggleSound } from '../audio/sounds';
import { toast } from '../state/actions';
import { CALM_CATS, CALM_ITEMS, SOUND_DEFS, STORY_THEMES } from '../data/calm';
import { useTimeOfDay } from '../hooks';
import { Svg, P } from '../components/icons';
import { Chip, HelpPill, OutlineButton, Scroll, Segmented, flex } from '../components/ui';

const DESC = {
  meditate: 'Short guided sessions in your companion’s voice. Pick what you need right now.',
  sleep: 'Slow, quiet stories and wind-downs for falling asleep. Lights off, phone face down.',
  sounds: 'Mix as many as you like. They keep playing while you use the app.',
};

export function Calm() {
  const tab = useStore(s => s.calmTab);
  const cat = useStore(s => s.calmCat);
  const sounds = useStore(s => s.sounds);
  const compName = useStore(s => s.compName);
  const tod = useTimeOfDay();
  const evening = tod === 'evening';

  const list = CALM_ITEMS.filter(x => (tab === 'sleep' ? x.kind === 'sleep' : x.kind === 'med') && (tab !== 'meditate' || cat === 'All' || x.cat === cat));
  const feat = CALM_ITEMS.find(x => x.id === (tab === 'sleep' ? 'monsoon' : evening ? 'winddown' : 'morning'))!;
  const meta = (x: (typeof CALM_ITEMS)[number]) => `${x.cat} · ${x.mins} min`;
  const anyOn = Object.keys(sounds).length > 0;
  const busy = useStore(s => s.storyBusy);

  return (
    <main aria-label="Calm" style={{ position: 'absolute', inset: 0, ...flex('column'), background: C.paper }}>
      <div style={{ padding: 'var(--head-pad) 24px 0', ...flex('column', 16) }}>
        <div style={{ ...flex('row'), alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontFamily: serif, fontSize: 34, fontWeight: 400, margin: 0 }}>Calm</h1>
          <HelpPill />
        </div>
        <Segmented<'meditate' | 'sleep' | 'sounds'> label="Calm" options={[{ value: 'meditate', label: 'Meditate' }, { value: 'sleep', label: 'Sleep' }, { value: 'sounds', label: 'Sounds' }]} value={tab} onChange={v => set({ calmTab: v })} />
      </div>
      <Scroll pad="16px 24px var(--scroll-bottom)">
        <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.45, textWrap: 'pretty' }}>{DESC[tab]}</div>

        {tab !== 'sounds' && (
          <button onClick={() => openPlayer(feat.id)} style={{ textAlign: 'left', border: 'none', borderRadius: 32, padding: 0, overflow: 'hidden', background: 'linear-gradient(160deg,#2B3A63 0%,#5A5493 100%)', color: C.moonText, ...flex('column'), boxShadow: '0 16px 36px rgba(42,46,69,.18)' }}>
            <div aria-hidden style={{ position: 'relative', height: 120, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', left: -30, top: -50, background: 'radial-gradient(circle,rgba(183,177,230,.55),rgba(183,177,230,0) 70%)' }} />
              <div style={{ position: 'absolute', width: 140, height: 140, borderRadius: '50%', right: 20, top: 10, background: 'radial-gradient(circle,rgba(159,207,195,.45),rgba(159,207,195,0) 70%)' }} />
              <div style={{ position: 'absolute', width: 44, height: 44, borderRadius: '50%', right: 44, top: 26, background: '#F8E9C8', boxShadow: '0 0 40px rgba(248,233,200,.6)' }} />
            </div>
            <div style={{ padding: '0 20px 20px', ...flex('row', 12), alignItems: 'flex-end' }}>
              <div style={{ flex: 1, ...flex('column', 4) }}>
                <span style={{ fontSize: 13, color: C.moonSoft, fontWeight: 600 }}>{tab === 'sleep' ? 'Tonight’s story' : evening ? 'For this evening' : 'For this morning'}</span>
                <span style={{ fontFamily: serif, fontSize: 28, lineHeight: 1.15 }}>{feat.title}</span>
                <span style={{ fontSize: 15, color: C.lavenderDeep }}>{meta(feat)} · Narrated by {compName}</span>
              </div>
              <span style={{ flex: 'none', width: 56, height: 56, borderRadius: '50%', background: C.moonText, display: 'grid', placeItems: 'center' }}><Svg d={P.play} size={20} stroke="none" fill="#2B3A63" /></span>
            </div>
          </button>
        )}

        {tab === 'sleep' && (
          <section aria-label="A story made for tonight" style={{ background: C.white, borderRadius: 28, padding: 18, boxShadow: shadow.cardSoft, ...flex('column', 12) }}>
            <div style={flex('column', 4)}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>A story made for tonight</span>
              <span style={{ fontSize: 15, color: C.muted, lineHeight: 1.4 }}>Pick a place and {compName} will write a new, quiet story, just for you.</span>
            </div>
            <div role="group" aria-label="Story place" style={{ ...flex('row', 8), overflowX: 'auto', margin: '0 -18px', padding: '0 18px' }}>
              {STORY_THEMES.map(t => <Chip key={t.id} label={t.label} on={false} onClick={() => { if (!busy) void playStory(t.id); }} pad={16} />)}
            </div>
            <div role="status" aria-live="polite" style={{ fontSize: 13, color: C.muted, minHeight: 18 }}>{busy ? 'Writing your story…' : ''}</div>
          </section>
        )}

        {tab === 'meditate' && (
          <div role="group" aria-label="Category" style={{ ...flex('row', 8), overflowX: 'auto', margin: '4px -24px 0', padding: '0 24px' }}>
            {CALM_CATS.map(c => <Chip key={c} label={c} on={cat === c} onClick={() => set({ calmCat: c })} pad={16} />)}
          </div>
        )}

        {tab !== 'sounds' && (
          <div style={{ background: C.white, borderRadius: 28, padding: '4px 18px', boxShadow: shadow.cardSoft, ...flex('column') }}>
            {list.map((x, i) => (
              <button key={x.id} onClick={() => openPlayer(x.id)} style={{ ...flex('row', 14), alignItems: 'center', textAlign: 'left', border: 'none', background: 'none', padding: '14px 0', borderBottom: i < list.length - 1 ? `1px solid ${C.rule}` : 'none' }}>
                <span aria-hidden style={{ flex: 'none', width: 52, height: 52, borderRadius: BLOBS[i % BLOBS.length], background: x.tint }} />
                <div style={{ flex: 1, ...flex('column', 2) }}>
                  <span style={{ fontSize: 17, fontWeight: 600 }}>{x.title}</span>
                  <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{meta(x)}</span>
                  <span style={{ fontSize: 15, color: C.muted, lineHeight: 1.4 }}>{x.desc}</span>
                </div>
                <span aria-hidden style={{ flex: 'none', width: 40, height: 40, borderRadius: '50%', background: C.sand, display: 'grid', placeItems: 'center' }}><Svg d={P.play} size={14} stroke="none" fill={C.ink} /></span>
              </button>
            ))}
          </div>
        )}

        {tab === 'sleep' && <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, padding: '0 4px', textWrap: 'pretty' }}>In the player you can set a sleep timer and add rain or ocean under the story. Sounds can keep playing after the story ends.</div>}

        {tab === 'sounds' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
              {SOUND_DEFS.map((sd, i) => {
                const on = !!sounds[sd.id];
                return (
                  <button key={sd.id} aria-pressed={on} onClick={() => toggleSound(sd.id, undefined, () => toast('This browser can’t play sounds.'))} style={{ textAlign: 'left', border: 'none', borderRadius: 28, padding: 16, background: on ? C.ink : C.white, color: on ? C.moonText : C.ink, ...flex('column', 6), minHeight: 132, boxShadow: shadow.card, transition: 'background 400ms' }}>
                    <span aria-hidden style={{ width: 40, height: 40, borderRadius: BLOBS[i % BLOBS.length], background: sd.tint }} />
                    <span style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>{sd.label}</span>
                    <span style={{ fontSize: 13, opacity: 0.8 }}>{on ? 'Playing · tap to stop' : 'Tap to play'}</span>
                  </button>
                );
              })}
            </div>
            {anyOn && <OutlineButton onClick={stopAllSounds}>Stop all sounds</OutlineButton>}
          </>
        )}
      </Scroll>
    </main>
  );
}
