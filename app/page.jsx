import {createSupabaseServerClient} from '@/lib/supabase/server';
import AccessPanel from '@/components/access-panel';

export const dynamic = 'force-dynamic';

export default async function Home({searchParams}) {
  const params = await searchParams;
  const reason = params?.reason === 'access' ? 'Your access link expired. Sign in again to continue.' : '';
  let user = null;
  let canAccess = false;
  let isOwner = false;

  try {
    const supabase = await createSupabaseServerClient();
    const {data} = await supabase.auth.getUser();
    user = data.user;
    if (user) {
      const {data: app} = await supabase.from('applications').select('id').eq('slug', 'mossvale').eq('is_enabled', true).maybeSingle();
      canAccess = Boolean(app);
      const {data: profile} = await supabase.from('portal_profiles').select('role').eq('user_id', user.id).maybeSingle();
      isOwner = profile?.role === 'owner' && canAccess;
    }
  } catch {
    // The client panel gives a setup message if the Supabase environment is not configured.
  }

  return (
    <main className="shell">
      <section className="card">
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>Mossvale</span>
        </div>
        <p className="eyebrow">PRIVATE GAME ACCESS</p>
        <h1>{user ? (canAccess ? 'Welcome back' : 'Access not granted') : 'Your next adventure awaits'}</h1>
        <p className="intro">
          {user
            ? canAccess
              ? 'Sign in is connected to your Zalonline account. Local autosaves stay in this browser; upload or restore an account checkpoint from the game menu.'
              : 'This account does not have Mossvale in its Zalonline app library yet.'
            : 'Sign in with the account you use for Zalonline to open your private game.'}
        </p>
        <AccessPanel signedIn={Boolean(user)} canAccess={canAccess} isOwner={isOwner} message={reason} />
        <p className="privacy-note">Private access is checked against your Zalonline app permissions.</p>
      </section>
    </main>
  );
}
