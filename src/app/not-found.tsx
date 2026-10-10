import Link from 'next/link';
export default function NotFound() { return <main className="auth-page"><section className="auth-card"><span className="eyebrow">404</span><h1>Page not found</h1><p>This page isn’t part of your workspace.</p><Link href="/" className="primary">Back to overview</Link></section></main>; }
