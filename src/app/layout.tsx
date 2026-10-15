import type { Metadata } from 'next';
import Script from 'next/script';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import './globals.css';
import './workspace-polish.css';
import './workspace-colour.css';
import './employee-workspace.css';
import './calendar.css';
import './workspace-system.css';
import './workspace-responsive.css';
export const metadata: Metadata = { title: 'Agency OS · Your agency, connected', description: 'An agency operations workspace for people, clients and production.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Applies the saved appearance before first paint (also on the sign-in pages, which have no theme button).
  const theme = "try{if(localStorage.getItem('agency-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}";
  return <html lang="en" suppressHydrationWarning><body>{children}<Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{__html: theme}}/></body></html>;
}
