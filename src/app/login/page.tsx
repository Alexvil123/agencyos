import { hasBackend, isSetupPreview } from '@/lib/config';
import { LoginForm } from '@/components/login-form';
import Link from 'next/link';
export const dynamic = 'force-dynamic';
export default function LoginPage() {
  return <main className="auth-page"><div className="auth-story"><div className="brand"><span className="brand-mark">a</span> agency<span className="brand-os">os</span></div><span className="eyebrow">ONE WORKSPACE. YOUR WHOLE AGENCY.</span><h1>Great work starts<br/>with a connected team.</h1><p>Bring your people, clients, and production together.<br/>Make room for the work that matters.</p><div className="auth-art"><span/><span/><span/><span/></div><small>Built for clarity. Designed for your agency.</small></div><section className="auth-card"><span className="eyebrow">WELCOME BACK</span><h2>Sign in to your workspace</h2><p>Your agency, all in one place.</p><LoginForm configured={hasBackend()} google={process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === 'true'} microsoft={process.env.NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED === 'true'}/>{isSetupPreview() && <Link className="preview-link" href="/">Explore the empty setup preview →</Link>}<small>Workspace access is managed by your agency owner.</small></section></main>;
}
