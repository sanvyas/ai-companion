import { useEffect } from 'react';
import { Companion, LOOK_OPTIONS } from '../components/figures';
import { go, loadMemory, loadYou, openPaywall, openSheet, signOutNow, startCheckin, updateConsent, updatePrefs, updatePrivacy } from '../state/actions';
import { updateCompanion } from '../state/session';
import { useStore } from '../state/store';
import { Head } from './Chrome';
import { s } from './css';
import { I, Svg } from './icons';
import { setV3 } from './ui';

const LANG = { en: 'English', hinglish: 'Hinglish', hi: 'हिन्दी' } as const;
const clock12 = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`; };

function Toggle({ on, label, onTap, desc }: { on: boolean; label: string; onTap: () => void; desc?: string }) {
  return (
    <div style={s('display:flex;align-items:center;gap:12px;padding:14px 0')}>
      <span style={s('flex:1;display:flex;flex-direction:column;gap:2px')}><span style={s('font-size:15px')}>{label}</span>{desc && <span style={s('font-size:13px;color:#636B78;line-height:1.35')}>{desc}</span>}</span>
      <button role="switch" aria-checked={on} aria-label={label} onClick={onTap} style={s(`flex:none;width:48px;height:30px;border-radius:15px;border:none;background:${on ? '#2F2A5E' : '#D9D2C5'};position:relative;padding:0;transition:background 300ms`)}>
        <span style={s(`position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#FFFFFF;transform:${on ? 'translateX(18px)' : 'none'};transition:transform 300ms`)} />
      </button>
    </div>
  );
}
const Group = ({ children }: { children: React.ReactNode }) => <div style={s('background:#FFFFFF;border-radius:24px;padding:4px 16px;display:flex;flex-direction:column')}>{children}</div>;
const Sep = () => <div aria-hidden="true" style={s('height:1px;background:#F1EDE6')} />;
const Link = ({ label, sub, value, onTap }: { label: string; sub?: string; value?: string; onTap: () => void }) => (
  <button onClick={onTap} style={s('display:flex;align-items:center;gap:12px;text-align:left;border:none;background:none;padding:14px 0;min-height:56px;width:100%')}>
    <span style={s('flex:1;display:flex;flex-direction:column;gap:2px')}><span style={s('font-size:15px;font-weight:600')}>{label}</span>{sub && <span style={s('font-size:13px;color:#636B78;line-height:1.35')}>{sub}</span>}</span>
    {value && <span style={s('font-size:13px;color:#636B78')}>{value}</span>}
    <Svg d={I.chev} size={16} sw={2} stroke="#636B78" />
  </button>
);

export function YouTab() {
  const look = useStore(x => x.look);
  const comp = useStore(x => x.compName);
  const nick = useStore(x => x.nick);
  const language = useStore(x => x.language);
  const prefs = useStore(x => x.prefs);
  const me = useStore(x => x.me);
  const consent = useStore(x => x.consent);
  const memories = useStore(x => x.memories);
  const safety = useStore(x => x.safetyPlan);
  const trusted = me?.trustedContact?.name;
  useEffect(() => { void loadYou(); void loadMemory(); }, []);
  const priv = me?.privacy;
  const memN = memories.filter(m => !m.hidden).length;
  const quiet = prefs ? `${clock12(prefs.quietHours.start)} to ${clock12(prefs.quietHours.end)}` : '10 pm to 8 am';

  return (
    <div className="screen" data-scroll="1" style={{ ...s('overflow:auto;background:#FAF6EF;display:flex;flex-direction:column;padding:52px 20px 120px;gap:14px') }}>
      <Head title={nick || 'You'} back={() => go('today')} />
      <section aria-label="Your companion" style={s('background:#FFFFFF;border-radius:28px;padding:18px;display:flex;flex-direction:column;gap:14px;align-items:center;box-shadow:0 8px 22px rgba(30,36,48,.05)')}>
        <div style={s('width:150px;height:150px;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 50% 40%,#FFFFFF,#E6E2F6);display:flex;justify-content:center;align-items:flex-end')}><Companion look={look} size={150} /></div>
        <h2 className="kicker" style={s('margin:0')}>A face for {comp}</h2>
        <div role="radiogroup" aria-label="Face" style={s('display:flex;gap:10px;flex-wrap:wrap;justify-content:center')}>
          {LOOK_OPTIONS.map(o => (
            <button key={o.id} role="radio" aria-checked={look === o.id} onClick={() => void updateCompanion({ look: o.id })} style={s('border:none;background:none;padding:0;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:56px')}>
              <span style={s(`width:58px;height:58px;border-radius:50%;overflow:hidden;background:#F3EEFA;display:grid;place-items:center;box-shadow:${look === o.id ? '0 0 0 3px #2F2A5E' : 'none'}`)}><Companion look={o.id} size={58} /></span>
              <span style={s('font-size:13px;font-weight:600')}>{o.label}</span>
            </button>
          ))}
        </div>
        <button onClick={() => go('studio')} style={s('align-self:stretch;height:48px;border-radius:24px;border:1.5px solid #2F2A5E;background:none;color:#2F2A5E;font-size:15px;font-weight:700')}>Choose a voice and hear it</button>
      </section>

      <h2 className="kicker" style={s('margin:6px 0 0')}>Check-ins</h2>
      <Group>
        <div style={s('padding:14px 0;display:flex;flex-direction:column;gap:10px')}>
          <span style={s('font-size:15px')}>When should I check in?</span>
          <div role="radiogroup" aria-label="Check-in time" style={s('display:flex;gap:4px;background:#F1EDE6;border-radius:22px;padding:4px')}>
            {(['morning', 'evening', 'off'] as const).map(v => <button key={v} role="radio" aria-checked={prefs?.checkinTime === v} onClick={() => void updatePrefs({ checkinTime: v })} style={s(`flex:1;height:40px;border-radius:18px;border:none;background:${prefs?.checkinTime === v ? '#FFFFFF' : 'transparent'};font-size:14px;font-weight:700;box-shadow:${prefs?.checkinTime === v ? '0 2px 8px rgba(30,36,48,.08)' : 'none'}`)}>{v === 'off' ? 'Not now' : v[0].toUpperCase() + v.slice(1)}</button>)}
          </div>
        </div>
        <Sep />
        <Toggle on={!!prefs?.push} label="Gentle nudges" desc="A quiet note on your phone, now and then." onTap={() => void updatePrefs({ push: !prefs?.push })} />
        <Sep />
        <Toggle on={!!prefs?.calls} label="A short call if you’d like one" onTap={() => void updatePrefs({ calls: !prefs?.calls })} />
        <Sep />
        <Toggle on={!!prefs?.sundayLetter} label="A letter on Sundays" desc="A few kind lines about your week." onTap={() => void updatePrefs({ sundayLetter: !prefs?.sundayLetter })} />
        <Sep />
        <button onClick={() => void startCheckin()} style={s('display:flex;align-items:center;gap:12px;text-align:left;border:none;background:none;padding:14px 0;min-height:56px;width:100%')}><span style={s('flex:1;font-size:15px;font-weight:600')}>Try a check-in now</span><Svg d={I.chev} size={16} sw={2} stroke="#636B78" /></button>
      </Group>
      <span style={s('font-size:13px;color:#636B78;line-height:1.45;padding:0 4px')}>Two a day at most. Quiet from {quiet}. Ignore one and I’ll ease off.</span>

      <h2 className="kicker" style={s('margin:6px 0 0')}>Privacy</h2>
      <Group>
        <Toggle on={!!consent?.remember} label="Let Saathi remember what I share" desc="You choose what is kept, and can see or delete all of it." onTap={() => void updateConsent({ remember: !consent?.remember })} />
        <Sep />
        <Toggle on={!!priv?.discreetMode} label="Hide message previews" desc="Quiet notifications and a plain name on the screen." onTap={() => void updatePrivacy({ discreetMode: !priv?.discreetMode })} />
        <Sep />
        <Toggle on={!!priv?.quickHide} label="Quick hide" desc="Tap the date on Home three times to cover the screen." onTap={() => void updatePrivacy({ quickHide: !priv?.quickHide })} />
      </Group>

      <h2 className="kicker" style={s('margin:6px 0 0')}>Yours</h2>
      <Group>
        <Link label={`What ${comp} remembers`} sub="See, edit or delete what I’ve learned." value={String(memN)} onTap={() => go('memory')} />
        <Sep />
        <Link label="Language" value={LANG[language]} onTap={() => setV3({ over: 'language' })} />
        <Sep />
        <Link label="Privacy Center" sub="What’s stored, and your data." onTap={() => go('privacy')} />
        <Sep />
        <Link label="My safety plan" sub="Your own steps. Works without internet once opened." value={safety ? 'Set' : 'Not yet'} onTap={() => openSheet('plan')} />
        <Sep />
        <Link label="Trusted contact" value={trusted ?? 'None'} onTap={() => openSheet('trusted')} />
        <Sep />
        <Link label="Reminders in detail" sub="Times, quiet hours, calls." onTap={() => go('notifs')} />
        <Sep />
        <Link label="Subscription" value={me?.subscription === 'plus' ? 'Plus' : 'Basic'} onTap={openPaywall} />
      </Group>
      <button onClick={() => setV3({ sheet: { id: 'help' } })} style={s('height:56px;border-radius:28px;border:none;background:#FFE6D9;color:#9A3B1E;font-size:16px;font-weight:700;margin-top:6px')}>Helplines and support</button>
      <button onClick={() => void signOutNow()} style={s('height:48px;border:none;background:none;color:#636B78;font-size:15px;font-weight:600')}>Sign out</button>
      <p style={s('margin:0;text-align:center;font-size:13px;color:#636B78')}>{comp} is an AI companion, not a doctor or therapist.</p>
    </div>
  );
}
