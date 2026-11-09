import { s } from './css';
import { Sheet } from './Chrome';
import { PALETTES, pageOf } from './palette';
import { closeSheet, setPalette, useV3 } from './ui';

/** Choose how the whole app looks: light, a wash of colour, or dark. It changes at once. Each choice shows a small picture of itself. */
export function ColoursSheet() {
  const on = useV3(x => x.palette);
  return (
    <Sheet label="Colours" onClose={closeSheet}>
      <h2 className="serif" style={s('font-size:32px;line-height:1.1;margin:0')}>Colours</h2>
      <p style={s('font-size:15px;line-height:1.45;color:var(--muted);margin:0')}>Light, a wash of colour, or dark. Pick what feels like you. It changes everywhere, straight away.</p>
      <div role="radiogroup" aria-label="Colours" style={s('display:flex;flex-direction:column;gap:10px')}>
        {PALETTES.map(p => (
          <button key={p.id} role="radio" aria-checked={on === p.id} onClick={() => setPalette(p.id)} style={s(`flex:none;display:flex;align-items:center;gap:14px;text-align:left;border:2px solid ${on === p.id ? p.accentInk : 'transparent'};background:var(--card);color:var(--ink);border-radius:22px;padding:12px 14px`)}>
            <span aria-hidden="true" style={s(`flex:none;position:relative;width:76px;height:52px;border-radius:14px;overflow:hidden;background:${pageOf(p, p.tints.morning)};box-shadow:inset 0 0 0 1px rgba(128,128,128,.25)`)}>
              <span style={s(`position:absolute;left:8px;right:22px;top:9px;height:18px;border-radius:9px;background:${p.card}`)} />
              <span style={s(`position:absolute;left:8px;bottom:8px;width:36px;height:12px;border-radius:6px;background:${p.accent}`)} />
              <span style={s(`position:absolute;right:8px;bottom:8px;width:12px;height:12px;border-radius:50%;background:${p.gold}`)} />
            </span>
            <span style={s('flex:1;display:flex;flex-direction:column;gap:2px')}><b style={s('font-size:17px')}>{p.name}</b><span style={s('font-size:13px;line-height:1.35;color:var(--muted)')}>{p.note}</span></span>
            {on === p.id && <span aria-hidden="true" style={s(`flex:none;width:24px;height:24px;border-radius:50%;background:${p.accent};color:#FFFFFF;display:grid;place-items:center;font-size:14px`)}>✓</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
