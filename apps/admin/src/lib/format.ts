const IST = 'Asia/Kolkata';
export const num = (n: number | null | undefined) => (n === null || n === undefined ? '–' : new Intl.NumberFormat('en-IN').format(n));
export const inr = (n: number | null | undefined, digits = 2) => (n === null || n === undefined ? '–' : `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: n < 100 ? digits : 0, maximumFractionDigits: n < 100 ? digits : 0 }).format(n)}`);
export const when = (v: string | Date | null | undefined) => (v ? new Date(v).toLocaleString('en-IN', { timeZone: IST, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '–');
export const day = (v: string | Date | null | undefined) => (v ? new Date(v).toLocaleDateString('en-IN', { timeZone: IST, day: 'numeric', month: 'short' }) : '–');
export const ago = (v: string | Date | null | undefined) => {
  if (!v) return 'never';
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129_600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} d ago`;
};
export const mins = (sec: number | null | undefined) => (sec ? `${Math.round(sec / 60)} min` : '0 min');
export const bytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
