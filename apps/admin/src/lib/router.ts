import { useEffect, useState } from 'react';

// Hash routes (#/users/<id>) so the portal is a static site and every page has a shareable address.
const read = () => (location.hash.replace(/^#\/?/, '') || 'overview').split('/').filter(Boolean);

export function useRoute() {
  const [parts, setParts] = useState(read);
  useEffect(() => { const f = () => setParts(read()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return parts;
}
export const go = (path: string) => { location.hash = `#/${path}`; };
