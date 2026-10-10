'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
function subscribe(listener: () => void) {
  window.addEventListener('storage', listener); window.addEventListener('agency-theme', listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener('agency-theme', listener); };
}
function snapshot() { try { return localStorage.getItem('agency-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } }
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => 'light');
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return <button className="icon-button theme-toggle" aria-label={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'} title={theme === 'dark' ? 'Light appearance' : 'Dark appearance'} onClick={() => {
    try { localStorage.setItem('agency-theme', theme === 'dark' ? 'light' : 'dark'); window.dispatchEvent(new Event('agency-theme')); } catch { /* Appearance preference is optional. */ }
  }}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button>;
}
