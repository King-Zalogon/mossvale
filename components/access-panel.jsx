'use client';

import {useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';

function browserClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export default function AccessPanel({signedIn, canAccess, isOwner, message}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(message);
  const [busy, setBusy] = useState(false);

  async function launch() {
    setBusy(true);
    setStatus('Checking your Mossvale access…');
    try {
      const response = await fetch('/api/launch', {method: 'POST'});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not open the game.');
      window.location.assign(result.url);
    } catch (error) {
      setStatus(error.message);
      setBusy(false);
    }
  }

  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      const {error} = await browserClient().auth.signInWithPassword({email, password});
      if (error) throw error;
      await launch();
    } catch (error) {
      setStatus(error.message || 'Sign in failed.');
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    await browserClient().auth.signOut();
    await fetch('/api/logout', {method: 'POST'});
    window.location.assign('/');
  }

  if (signedIn && canAccess) {
    return (
      <div className="actions">
        <button className="primary" disabled={busy} onClick={launch}>
          {busy ? 'Opening…' : 'Open Mossvale'}
        </button>
        {isOwner && (
          <a className="secondary link-button" href="/mcp-access">
            Manage AI feedback access
          </a>
        )}
        <button className="secondary" disabled={busy} onClick={signOut}>
          Sign out
        </button>
        {status && (
          <p className="status" role="status">
            {status}
          </p>
        )}
      </div>
    );
  }

  if (signedIn) {
    return (
      <div className="actions">
        <p className="status" role="status">
          Ask the portal owner to grant your account access to Mossvale.
        </p>
        <button className="secondary" disabled={busy} onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={signIn}>
      <label htmlFor="email">Email address</label>
      <input autoComplete="username" id="email" onChange={event => setEmail(event.target.value)} required type="email" value={email} />
      <label htmlFor="password">Password</label>
      <input autoComplete="current-password" id="password" onChange={event => setPassword(event.target.value)} required type="password" value={password} />
      <button className="primary" disabled={busy} type="submit">
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      {status && (
        <p className="status" role="status">
          {status}
        </p>
      )}
      {!process.env.NEXT_PUBLIC_SUPABASE_URL && <p className="status">The app owner needs to configure the Supabase project in Vercel.</p>}
    </form>
  );
}
