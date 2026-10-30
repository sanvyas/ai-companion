import { useEffect, useState, type ReactNode } from 'react';
import { useDialog } from '../components/useDialog';
import { EMERGENCY } from '../data/helplines';
import { acknowledgeHelp, go, openBreathe, openSheet as openStoreSheet } from '../state/actions';
import { useStore, type Screen } from '../state/store';
import { s } from './css';
import { Buoy, I, Svg } from './icons';
import { closeSheet, openHelp, setV3, useV3, type Banner } from './ui';

export const NAV_ID = 'v3-main';

/** The always-there way to reach people who can help. Labelled, so nobody has to guess what the icon means. */
export function HelpButton({ dark, small }: { dark?: boolean; small?: boolean }) {
  return (
    <button onClick={openHelp} data-track="help" aria-label="Help, if you need someone now"
      style={s(dark ? 'height:36px;padding:0 12px;border-radius:18px;border:1px solid rgba(255,214,190,.5);background:rgba(255,255,255,.08);color:#FFD6BE;font-size:13px;font-weight:700' : `height:${small ? 36 : 40}px;padding:0 14px;border-radius:20px;border:none;background:#FFFFFF;display:flex;align-items:center;gap:6px;font-size:${small ? 13 : 14}px;font-weight:600;color:#9A3B1E`)}>
      {!dark && <Buoy />}Help
    </button>
  );
}

const TABS: { screen: Screen; label: string; icon: string }[] = [
  { screen: 'today', label: 'Home', icon: I.home },
  { screen: 'calm', label: 'Relax', icon: I.lotus },
  { screen: 'talk', label: 'Talk', icon: I.chat },
  { screen: 'journal', label: 'Journal', icon: I.book },
  { screen: 'journey', label: 'Month', icon: I.month },
];

export function TabBar() {
  const screen = useStore(x => x.screen);
  return (
    <nav aria-label="Main" style={s('position:absolute;left:12px;right:12px;bottom:22px;height:72px;border-radius:36px;background:rgba(255,255,255,.94);backdrop-filter:blur(16px);box-shadow:0 12px 30px rgba(30,36,48,.12);display:flex;align-items:center;justify-content:space-around;z-index:30')}>
      {TABS.map(t => {
        const on = screen === t.screen, center = t.screen === 'talk';
        return (
          <button key={t.screen} onClick={() => go(t.screen)} aria-current={on ? 'page' : undefined} data-track={`nav.${t.screen}`}
            style={s(`border:none;background:none;display:flex;flex-direction:column;align-items:center;gap:3px;color:${on ? '#2F2A5E' : '#6B7280'};width:64px;padding:0`)}>
            <span style={s(`width:${center ? 52 : 28}px;height:${center ? 52 : 28}px;border-radius:50%;background:${center ? '#2F2A5E' : 'transparent'};display:grid;place-items:center;margin-top:${center ? -22 : 0}px;box-shadow:${center ? '0 8px 20px rgba(47,42,94,.35)' : 'none'}`)}>
              <Svg d={t.icon} stroke={center ? '#FFFFFF' : on ? '#2F2A5E' : '#6B7280'} />
            </span>
            <span style={s('font-size:11px;font-weight:700')}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function Toast() {
  const msg = useStore(x => x.toast);
  if (!msg) return null;
  return (
    <div style={s('position:absolute;left:20px;right:20px;bottom:108px;z-index:70;display:flex;justify-content:center;pointer-events:none')} role="status" aria-live="polite">
      <span style={{ ...s('background:#1E2430;color:#FFFFFF;border-radius:22px;padding:12px 18px;font-size:15px;font-weight:600;animation:kUp 300ms;display:flex;align-items:center;gap:8px') }}>
        <span style={s('width:10px;height:10px;border-radius:50%;background:#93C48A;flex:none')} />{msg}
      </span>
    </div>
  );
}

/** A nudge from Saathi that drops in, says one thing, and leaves. Tapping it goes where it points. */
export function BannerView({ onGo }: { onGo: (b: Banner) => void }) {
  const b = useV3(x => x.banner);
  useEffect(() => { if (!b) return; const t = setTimeout(() => setV3({ banner: null }), 6500); return () => clearTimeout(t); }, [b]);
  if (!b) return null;
  return (
    <button onClick={() => onGo(b)} data-track="banner" style={{ ...s('position:absolute;left:10px;right:10px;top:12px;z-index:80;border:none;border-radius:24px;background:rgba(250,248,255,.97);box-shadow:0 16px 40px rgba(20,20,40,.22);padding:12px 14px;display:flex;gap:12px;align-items:center;text-align:left;animation:kDrop 500ms cubic-bezier(.22,.61,.36,1)') }}>
      <span style={s('flex:none;width:40px;height:40px;border-radius:12px;background:#2F2A5E;display:grid;place-items:center')}><span style={s('width:18px;height:18px;border-radius:50%;background:#F2B33D')} /></span>
      <span style={s('flex:1;display:flex;flex-direction:column;gap:2px')}>
        <span style={s('display:flex;justify-content:space-between;font-size:13px;font-weight:700')}><span>Saathi</span><span style={s('color:#636B78;font-weight:500')}>now</span></span>
        <span style={s('font-size:15px;line-height:1.35')}>{b.text}</span>
      </span>
    </button>
  );
}

/** A bottom sheet: dimmed behind, focus inside, Escape and a tap outside both close it. */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useDialog<HTMLDivElement>(onClose);
  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={s('position:absolute;inset:0;background:rgba(20,20,40,.4);z-index:60;animation:kFade 300ms')} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} style={{ ...s('position:absolute;left:0;right:0;bottom:0;z-index:61;background:#FAF6EF;border-radius:30px 30px 0 0;padding:12px 20px 36px;display:flex;flex-direction:column;gap:12px;animation:kSheet 400ms cubic-bezier(.22,.61,.36,1);max-height:88%;overflow:auto;outline:none') }}>
        <span style={s('align-self:center;width:40px;height:5px;border-radius:3px;background:#D9D2C5;flex:none')} aria-hidden="true" />
        {children}
      </div>
    </>
  );
}

/** "You’re not alone." Real people, free, any time. Numbers come from the app’s own helpline list, which works without a connection. */
export function HelpSheet() {
  const helplines = useStore(x => x.helplines);
  const trusted = useStore(x => x.trustedDial);
  const comp = useStore(x => x.compName);
  const tele = helplines.find(h => /tele-?manas/i.test(h.name)) ?? helplines.find(h => h.kind === 'crisis');
  const kiran = helplines.find(h => /kiran/i.test(h.name));
  const emergency = helplines.find(h => h.kind === 'emergency');
  const Row = ({ label, sub, icon, bg, fg, tel, onClick }: { label: string; sub: string; icon: string; bg: string; fg: string; tel?: string; onClick?: () => void }) => {
    const style = s(`display:flex;align-items:center;gap:14px;text-align:left;border:none;background:${bg};color:${fg};border-radius:20px;padding:14px 16px;min-height:64px;text-decoration:none`);
    const inner = <><span style={s('flex:1;display:flex;flex-direction:column;gap:2px')}><span style={s('font-size:16px;font-weight:700')}>{label}</span><span style={s('font-size:13px;opacity:.9')}>{sub}</span></span><Svg d={icon} size={20} /></>;
    return tel ? <a href={tel} onClick={onClick} style={style}>{inner}</a> : <button onClick={onClick} style={style}>{inner}</button>;
  };
  return (
    <Sheet label="You’re not alone" onClose={closeSheet}>
      <span className="serif" style={s('font-size:32px;line-height:1.1')}>You’re not alone.</span>
      <span style={s('font-size:15px;color:#636B78')}>Real people, free, any time.</span>
      <Row label="Breathe with me now" sub="1 minute" icon={I.breathe} bg="#FFFFFF" fg="#1E2430" onClick={() => { closeSheet(); openBreathe(); }} />
      {tele && <Row label={`Call ${tele.name} · ${tele.number}`} sub={`Free, ${tele.hours === '24x7' ? '24×7' : tele.hours}, many languages`} icon={I.phone} bg="#9A3B1E" fg="#FFFFFF" tel={`tel:${tele.tel}`} onClick={() => acknowledgeHelp('helpline')} />}
      {kiran && <Row label={`Call ${kiran.name} · ${kiran.number}`} sub="Free, 24×7" icon={I.phone} bg="#FFFFFF" fg="#1E2430" tel={`tel:${kiran.tel}`} onClick={() => acknowledgeHelp('helpline')} />}
      {trusted
        ? <Row label={`Call ${trusted.name}`} sub="Your trusted person" icon={I.phone} bg="#FFFFFF" fg="#1E2430" tel={`tel:${trusted.phone}`} onClick={() => acknowledgeHelp('contact')} />
        : <Row label="Add someone you trust" sub="So help is one tap away" icon={I.chev} bg="#FFFFFF" fg="#1E2430" onClick={() => { closeSheet(); openStoreSheet('trusted'); }} />}
      <Row label={`Emergency · ${emergency?.number ?? EMERGENCY.num}`} sub="If you’re in danger now" icon={I.phone} bg="#FFE6D9" fg="#9A3B1E" tel={`tel:${emergency?.tel ?? EMERGENCY.tel}`} onClick={() => acknowledgeHelp('emergency')} />
      <Row label="All helplines" sub="Every number, with hours and languages" icon={I.chev} bg="#FFFFFF" fg="#1E2430" onClick={() => { closeSheet(); openStoreSheet('helplines'); }} />
      <span style={s('font-size:13px;color:#636B78;line-height:1.45')}>{comp} is an AI companion, not a crisis service.</span>
    </Sheet>
  );
}

/** A screen title row: a back button if there is somewhere to go back to, and the Help button. */
export function Head({ title, back, right }: { title: string; back?: () => void; right?: ReactNode }) {
  return (
    <div style={s('display:flex;align-items:center;justify-content:space-between;gap:8px')}>
      <div style={s('display:flex;align-items:center;gap:6px')}>
        {back && <button onClick={back} aria-label="Back" style={s('width:44px;height:44px;border:none;background:none;display:grid;place-items:center;margin-left:-10px')}><Svg d={I.back} size={22} stroke="#1E2430" /></button>}
        <h1 className="serif" style={s('font-size:38px;line-height:1;margin:0')}>{title}</h1>
      </div>
      {right ?? <HelpButton />}
    </div>
  );
}

export const useClock = () => {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30_000); return () => clearInterval(t); }, []);
  return new Date();
};
