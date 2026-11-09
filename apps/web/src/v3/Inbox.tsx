import { dayOf, useStore } from '../state/store';
import { dismissCard, go, openBreathe, openSheet, startCall, startCheckin, startWalkFlow, togglePlan } from '../state/actions';
import { s } from './css';
import { Sheet } from './Chrome';
import { I, Svg } from './icons';
import { MOODS } from './moods';
import { useMonthData } from './month-data';
import { closeSheet, setV3 } from './ui';

// What needs you right now, in one place: each line is about you, built only from what is true today (your mood, your next step,
// something near you, a letter that has arrived), and each one is a button that does the thing it says. Nothing is invented to
// fill the space, and when nothing needs you it says so.

export interface InboxItem { id: string; icon: string; tint: string; title: string; body: string; cta: string; run: () => void; cta2?: { label: string; run: () => void } }

export function useInbox(): InboxItem[] {
  const nick = useStore(x => x.nick);
  const mood = useStore(x => x.mood);
  const plan = useStore(x => x.plan);
  const events = useStore(x => x.events);
  const cards = useStore(x => x.cards);
  const letter = useStore(x => x.letter);
  const month = useMonthData();
  const you = nick ? `${nick}, ` : '';
  const out: InboxItem[] = [];

  const card = cards.find(c => c.kind === 'checkin');
  if (card) out.push({ id: 'checkin', icon: I.chat, tint: '#E6E4F5', title: 'Your check-in is here', body: 'Two minutes, whenever suits. Or skip it, that’s fine too.', cta: 'Check in', run: () => { void dismissCard(card.id); closeSheet(); void startCheckin(); }, cta2: { label: 'Not now', run: () => void dismissCard(card.id) } });

  if (mood !== null && mood <= 1) {
    const helped = month?.help.some(h => h.kind === 'breathe' && h.helped);
    out.push({ id: 'heavy', icon: I.breathe, tint: '#FBE4DA', title: `${you}it’s been a ${MOODS[mood].label.toLowerCase()} day`.replace(/^./, c => c.toUpperCase()), body: helped ? 'A slow breath has helped you before. One minute?' : 'Want to tell me about it, or take one slow breath first?', cta: helped ? 'Breathe with me' : 'Talk', run: () => { closeSheet(); if (helped) openBreathe(); else void startCall('voice'); }, cta2: helped ? { label: 'Talk instead', run: () => { closeSheet(); void startCall('voice'); } } : { label: 'Breathe', run: () => { closeSheet(); openBreathe(); } } });
  }

  const step = plan.find(p => !p.done);
  if (step) out.push({ id: 'step', icon: I.check, tint: '#E0EFE5', title: 'Your next tiny step', body: `“${step.label}”. Small counts.`, cta: 'Done it', run: () => void togglePlan(step.id), ...(/walk/i.test(step.label) ? { cta2: { label: 'Walk with me', run: () => { closeSheet(); void startWalkFlow(); } } } : {}) });

  const ev = events.find(e => !e.interested);
  if (ev) out.push({ id: 'event', icon: I.pin, tint: '#FCEFCF', title: ev.title, body: `${dayOf(ev.startsAt)} · ${ev.venue}. Near you, and easy to join.`, cta: 'See details', run: () => setV3({ sheet: { id: 'event', eventId: ev.id } }) });

  if (letter && new Date().getDay() === 0) out.push({ id: 'letter', icon: I.book, tint: '#FBE4DA', title: 'Your Sunday letter is here', body: 'A few kind lines about your week.', cta: 'Read it', run: () => { closeSheet(); openSheet('letter'); } });

  const today = month?.days.find(d => d.day === month.today)?.kinds ?? [];
  if (month && !today.length) out.push({ id: 'month', icon: I.month, tint: '#E0EFE5', title: 'Nothing yet today', body: 'One small thing adds to your month. Anything counts.', cta: 'Open my month', run: () => { closeSheet(); go('journey'); } });

  return out.slice(0, 5);
}

export function BellButton() {
  const n = useInbox().length;
  return (
    <button onClick={() => setV3({ sheet: { id: 'inbox' } })} data-track="inbox.open" aria-label={n ? `For you, ${n} ${n === 1 ? 'thing' : 'things'}` : 'For you, nothing new'} style={s('position:relative;width:44px;height:44px;border-radius:50%;border:none;background:#FFFFFF;display:grid;place-items:center;flex:none')}>
      <Svg d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21a2 2 0 0 0 4 0" size={20} stroke="#1E2430" />
      {n > 0 && <span aria-hidden="true" style={s('position:absolute;top:2px;right:2px;min-width:18px;height:18px;border-radius:9px;background:#2F2A5E;color:#FFFFFF;font-size:11px;font-weight:700;display:grid;place-items:center;padding:0 4px')}>{n}</span>}
    </button>
  );
}

export function InboxSheet() {
  const items = useInbox();
  return (
    <Sheet label="For you" onClose={closeSheet}>
      <h2 className="serif" style={s('font-size:32px;line-height:1.1;margin:0')}>For you</h2>
      {items.length === 0 && <p style={s('font-size:17px;line-height:1.5;color:#636B78;margin:0')}>You’re all caught up. Nothing needs you right now, and that’s a good place to be.</p>}
      {items.map(it => (
        <section key={it.id} aria-label={it.title} style={s('background:#FFFFFF;border-radius:24px;padding:16px;display:flex;flex-direction:column;gap:12px;flex:none')}>
          <div style={s('display:flex;gap:14px;align-items:flex-start')}>
            <span aria-hidden="true" style={s(`flex:none;width:44px;height:44px;border-radius:14px;background:${it.tint};display:grid;place-items:center`)}><Svg d={it.icon} size={22} stroke="#1E2430" /></span>
            <div style={s('flex:1;display:flex;flex-direction:column;gap:2px')}><b style={s('font-size:17px;line-height:1.3')}>{it.title}</b><span style={s('font-size:15px;line-height:1.4;color:#636B78')}>{it.body}</span></div>
          </div>
          <div style={s('display:flex;gap:8px')}>
            <button onClick={it.run} data-track={`inbox.${it.id}`} style={s('flex:none;height:48px;padding:0 22px;border-radius:24px;border:none;background:#2F2A5E;color:#FFFFFF;font-size:15px;font-weight:600')}>{it.cta}</button>
            {it.cta2 && <button onClick={it.cta2.run} style={s('height:48px;padding:0 16px;border-radius:24px;border:none;background:none;color:#2F2A5E;font-size:15px;font-weight:600')}>{it.cta2.label}</button>}
          </div>
        </section>
      ))}
    </Sheet>
  );
}
