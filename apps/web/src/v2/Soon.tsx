import { go } from '../state/actions';
import { pop, getV2 } from './ui';
import { Ic } from './icons';

// TODO(v2): screens that have not been moved into the new design yet. Only people previewing the new design (?ui=2) can see this.
export function Soon({ name, pushed }: { name: string; pushed?: boolean }) {
  const back = () => { if (getV2().stack.length) pop(); else go('today'); };
  return (
    <div className={pushed ? 'screen' : 'sc-body'}>
      {pushed && <div className="sc-head"><button className="backbtn" onClick={back}><Ic n="back" />Back</button><div className="ttl">{name}</div><span style={{ width: 44 }} /></div>}
      <div className="sc-body"><p className="muted" style={{ marginTop: 40, textAlign: 'center' }}>“{name}” is coming to the new design. The previous design still has it.</p></div>
    </div>
  );
}
