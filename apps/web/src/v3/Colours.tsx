import { s } from './css';
import { Sheet } from './Chrome';
import { PALETTES } from './palette';
import { closeSheet, setPalette, useV3 } from './ui';

/** Choose how the whole app looks. It changes at once, and every choice is light. */
export function ColoursSheet() {
  const on = useV3(x => x.palette);
  return (
    <Sheet label="Colours" onClose={closeSheet}>
      <h2 className="serif" style={s('font-size:32px;line-height:1.1;margin:0')}>Colours</h2>
      <p style={s('font-size:15px;line-height:1.45;color:#636B78;margin:0')}>Pick the ones that feel like you. It changes everywhere, straight away.</p>
      <div role="radiogroup" aria-label="Colours" style={s('display:flex;flex-direction:column;gap:10px')}>
        {PALETTES.map(p => (
          <button key={p.id} role="radio" aria-checked={on === p.id} onClick={() => setPalette(p.id)} style={s(`flex:none;display:flex;align-items:center;gap:14px;text-align:left;border:2px solid ${on === p.id ? p.accent : 'transparent'};background:#FFFFFF;border-radius:22px;padding:12px 14px`)}>
            <span aria-hidden="true" style={s('flex:none;display:flex;width:72px;height:44px;border-radius:14px;overflow:hidden')}>
              {[p.tints.morning, p.accent, p.accent2, p.gold].map((c, i) => <span key={i} style={s(`flex:1;background:${c}`)} />)}
            </span>
            <span style={s('flex:1;display:flex;flex-direction:column;gap:2px')}><b style={s('font-size:17px')}>{p.name}</b><span style={s('font-size:13px;line-height:1.35;color:#636B78')}>{p.note}</span></span>
            {on === p.id && <span aria-hidden="true" style={s(`flex:none;width:24px;height:24px;border-radius:50%;background:${p.accent};color:#FFFFFF;display:grid;place-items:center;font-size:14px`)}>✓</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
