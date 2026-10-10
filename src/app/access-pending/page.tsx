import Link from 'next/link';
export default function AccessPending() {
  return <main className="auth-page"><section className="auth-card"><span className="eyebrow">ACCESS REQUIRED</span><h1>Your account is signed in.</h1><p>An active agency membership is required to open this workspace. Ask your workspace owner to arrange access.</p><form action="/auth/signout" method="post"><button className="primary">Sign out</button></form><Link href="/login">Back to sign in</Link></section></main>;
}
