'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="auth-page"><section className="auth-card"><span className="eyebrow">CONNECTION INTERRUPTED</span><h1>We couldn’t load your workspace.</h1><p>Your data hasn’t been changed. Try again, or ask your administrator to check the connection and permissions.</p><button className="primary" onClick={reset}>Try again</button></section></main>;
}
