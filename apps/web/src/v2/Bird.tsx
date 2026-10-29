// Saathi's bird. The gradients it uses are defined once in <BirdDefs/>, which the shell renders.
const BIRD = '<ellipse cx="40" cy="74" rx="22" ry="4" fill="url(#gShadow)"/><g class="bob"><g class="flip"><path d="M12 44c-6-2-9-8-8-14 6 1 11 5 14 10z" fill="#2A8479"/><ellipse cx="40" cy="46" rx="25" ry="22" fill="url(#gBird)"/><ellipse cx="42" cy="54" rx="15" ry="12" fill="#F6EBD2"/><g class="fw"><path d="M22 42c6-10 18-10 24-2-3 10-14 14-24 2z" fill="#2A8479"/></g><g class="blink"><circle cx="54" cy="36" r="5.6" fill="#fff"/><circle cx="55.5" cy="36.4" r="3" fill="#2A2A2A"/><circle cx="56.5" cy="35" r="1" fill="#fff"/></g><circle cx="54" cy="46" r="3.4" fill="#F08FA3" opacity=".5"/><g class="beak"><path d="M62 38l12 3-12 4z" fill="#F4A62E"/></g><path d="M34 66v6M44 66v6" stroke="#E08A2A" stroke-width="3" stroke-linecap="round"/></g></g>';

export function BirdDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="gBird" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5BCBB8" /><stop offset="1" stopColor="#2F9C8E" /></linearGradient>
        <radialGradient id="gShadow"><stop offset="0" stopColor="#000" stopOpacity=".28" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
      </defs>
    </svg>
  );
}

export function Bird({ size = 44, className }: { size?: number; className?: string }) {
  return <svg viewBox="0 0 80 80" width={size} height={size} className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: BIRD }} />;
}
