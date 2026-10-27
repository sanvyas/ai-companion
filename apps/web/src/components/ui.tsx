import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { C, serif, shadow } from '../theme';
import { openSheet } from '../state/actions';
import { Svg, P } from './icons';

const flex = (dir: 'row' | 'column' = 'column', gap = 0): CSSProperties => ({ display: 'flex', flexDirection: dir, gap });

export const Screen = ({ children, bg = C.paper, style, className, label }: { children: ReactNode; bg?: string; style?: CSSProperties; className?: string; label?: string }) => (
  // data-scroll + overflow: on a short phone or with the keyboard open, the content scrolls instead of being cut off.
  <main aria-label={label} className={className} data-scroll="1" style={{ position: 'absolute', inset: 0, ...flex('column'), overflowY: 'auto', background: bg, ...style }}>
    {children}
  </main>
);

export const Scroll = ({ children, pad = '24px 24px var(--scroll-bottom)', gap = 12, style, innerRef }: { children: ReactNode; pad?: string; gap?: number; style?: CSSProperties; innerRef?: React.Ref<HTMLDivElement> }) => (
  <div data-scroll="1" ref={innerRef} style={{ flex: 1, overflow: 'auto', padding: pad, ...flex('column', gap), minHeight: 0, ...style }}>
    {children}
  </div>
);

// "Need help?" is on every primary screen (PRD §3.1.4).
export function HelpPill({ dark = false, small = false }: { dark?: boolean; small?: boolean }) {
  return (
    <button
      data-track="help.open"
      onClick={() => openSheet('support')}
      style={{
        height: small ? 40 : 44, padding: small ? '0 14px' : '0 16px', borderRadius: 22, flex: 'none',
        background: dark ? 'rgba(255,241,214,.14)' : C.amber, border: `1px solid ${dark ? 'rgba(232,169,58,.6)' : C.amberLine}`,
        color: dark ? '#FFE2A8' : C.amberInk, fontSize: small ? 13 : 15, fontWeight: 600,
      }}
    >
      Need help?
    </button>
  );
}

export const TabHeader = ({ title }: { title: string }) => (
  <div style={{ ...flex('row'), alignItems: 'center', justifyContent: 'space-between', padding: `var(--head-pad) 24px 0` }}>
    <h1 style={{ fontFamily: serif, fontSize: 34, fontWeight: 400, margin: 0 }}>{title}</h1>
    <HelpPill />
  </div>
);

export function BackHeader({ title, onBack, help = true }: { title: string; onBack: () => void; help?: boolean }) {
  return (
    <div style={{ ...flex('row', 8), alignItems: 'center', padding: 'var(--head-pad) 16px 0' }}>
      <button onClick={onBack} aria-label="Back" style={{ width: 44, height: 44, border: 'none', background: 'none', display: 'grid', placeItems: 'center' }}>
        <Svg d={P.back} />
      </button>
      <h1 style={{ flex: 1, fontFamily: serif, fontSize: 28, fontWeight: 400, margin: 0 }}>{title}</h1>
      {help && <HelpPill />}
    </div>
  );
}

export const Intro = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.45, marginTop: -12, textWrap: 'pretty' }}>{children}</div>
);

export const SectionLabel = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <h2 style={{ fontSize: 13, fontWeight: 600, color: C.muted, letterSpacing: '.06em', textTransform: 'uppercase', padding: '0 6px', margin: '12px 0 -2px', ...style }}>{children}</h2>
);

export const Heading = ({ title, sub, style }: { title: string; sub?: string; style?: CSSProperties }) => (
  <div style={{ ...flex('column', 2), ...style }}>
    <h2 style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, margin: 0 }}>{title}</h2>
    {sub && <span style={{ fontSize: 15, color: C.muted, lineHeight: 1.4 }}>{sub}</span>}
  </div>
);

export const Card = ({ children, style, pad = 20, gap = 12 }: { children: ReactNode; style?: CSSProperties; pad?: number | string; gap?: number }) => (
  <div style={{ background: C.white, borderRadius: 28, padding: pad, boxShadow: shadow.cardSoft, ...flex('column', gap), ...style }}>{children}</div>
);

type BtnProps = { children: ReactNode; onClick?: (e: MouseEvent<HTMLButtonElement>) => void; style?: CSSProperties; disabled?: boolean; ariaLabel?: string; href?: string; type?: 'button' | 'submit' };

export const PrimaryButton = ({ children, onClick, style, disabled, ariaLabel, type = 'button' }: BtnProps) => (
  <button type={type} onClick={onClick} aria-label={ariaLabel} disabled={disabled} style={{ height: 56, borderRadius: 28, border: 'none', background: C.teal, color: C.white, fontSize: 17, fontWeight: 600, ...style }}>{children}</button>
);

export const OutlineButton = ({ children, onClick, style, type = 'button' }: BtnProps) => (
  <button type={type} onClick={onClick} style={{ height: 52, borderRadius: 26, border: `1.5px solid ${C.teal}`, background: C.white, color: C.teal, fontSize: 17, fontWeight: 600, ...style }}>{children}</button>
);

export const TextButton = ({ children, onClick, style, type = 'button' }: BtnProps) => (
  <button type={type} onClick={onClick} style={{ height: 48, background: 'none', border: 'none', color: C.teal, fontSize: 17, fontWeight: 600, ...style }}>{children}</button>
);

/** A real phone call link. Calls always go through the OS dialer (PRD §8.10). */
export const CallLink = ({ tel, children, style, onClick }: { tel: string; children: ReactNode; style?: CSSProperties; onClick?: () => void }) => (
  <a href={`tel:${tel}`} onClick={onClick} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...style }}>{children}</a>
);

export function Switch({ on }: { on: boolean }) {
  return (
    <span aria-hidden style={{ flex: 'none', width: 52, height: 32, borderRadius: 16, background: on ? C.teal : C.track, position: 'relative', transition: 'background 400ms', display: 'block' }}>
      <span style={{ position: 'absolute', top: 3, left: 3, width: 26, height: 26, borderRadius: '50%', background: C.white, boxShadow: '0 2px 6px rgba(0,0,0,.15)', transform: on ? 'translateX(20px)' : 'none', transition: 'transform 400ms cubic-bezier(.22,.61,.36,1)' }} />
    </span>
  );
}

/** A whole-row switch. role=switch + aria-checked so the state is announced, not just coloured. */
export function ToggleRow({ on, onToggle, label, desc, style, labelSize = 17 }: { on: boolean; onToggle: () => void; label: string; desc?: string; style?: CSSProperties; labelSize?: number }) {
  return (
    <button role="switch" aria-checked={on} onClick={onToggle} style={{ ...flex('row', 16), alignItems: 'center', textAlign: 'left', border: 'none', background: 'none', width: '100%', padding: 0, ...style }}>
      <span style={{ flex: 1, ...flex('column', 3) }}>
        <span style={{ fontSize: labelSize, fontWeight: labelSize === 17 ? undefined : 600 }}>{label}</span>
        {desc && <span style={{ fontSize: labelSize === 17 ? 15 : 13, color: C.muted, lineHeight: 1.4 }}>{desc}</span>}
      </span>
      <Switch on={on} />
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange, tone = 'sand', label }: { options: readonly T[] | readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void; tone?: 'sand' | 'sandDark'; label: string }) {
  const opts = (options as readonly (T | { value: T; label: string })[]).map(o => (typeof o === 'string' ? { value: o as T, label: o as string } : o));
  return (
    <div role="radiogroup" aria-label={label} style={{ ...flex('row', 6), background: tone === 'sand' ? C.sand : C.sandDark, borderRadius: 24, padding: 4 }}>
      {opts.map(o => {
        const on = o.value === value;
        return (
          <button key={o.value} role="radio" aria-checked={on} onClick={() => onChange(o.value)} style={{ flex: 1, height: 44, borderRadius: 22, border: 'none', background: on ? C.white : 'transparent', fontSize: 15, fontWeight: 600, boxShadow: on ? shadow.seg : 'none' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ label, on, onClick, height = 40, pad = 14 }: { label: string; on: boolean; onClick: () => void; height?: number; pad?: number }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{ flex: 'none', height, padding: `0 ${pad}px`, borderRadius: height / 2, border: `1.5px solid ${on ? C.teal : 'transparent'}`, background: on ? C.tealSoft : C.white, fontSize: 15, color: C.ink }}>
      {label}
    </button>
  );
}

export const Chevron = () => <Svg d={P.chev} size={16} stroke={C.chevron} style={{ flex: 'none' }} />;

export function IconDisc({ d, bg, size = 44, iconSize = 22, stroke = C.ink }: { d: string; bg: string; size?: number; iconSize?: number; stroke?: string }) {
  return (
    <span style={{ flex: 'none', width: size, height: size, borderRadius: '50%', background: bg, display: 'grid', placeItems: 'center' }}>
      <Svg d={d} size={iconSize} stroke={stroke} />
    </span>
  );
}

export const onKeyActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
};

export { flex };

export const onbPad = 'calc(var(--sa-top) + 88px) 24px calc(var(--sa-bottom) + 32px)';

export const Title = ({ children, size = 34, style }: { children: ReactNode; size?: number; style?: CSSProperties }) => (
  <h1 style={{ fontFamily: serif, fontSize: size, lineHeight: size === 34 ? 1.15 : size === 28 ? 1.25 : 1.2, fontWeight: 400, margin: 0, textWrap: 'pretty', ...style }}>{children}</h1>
);

export const Body = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <p style={{ fontSize: 17, lineHeight: 1.6, color: C.muted, margin: 0, textWrap: 'pretty', ...style }}>{children}</p>
);
