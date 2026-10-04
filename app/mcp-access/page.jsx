import {createSupabaseServerClient} from '@/lib/supabase/server';
import McpAccessPanel from '@/components/mcp-access-panel';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Mossvale · AI feedback access',
  robots: {index: false, follow: false},
};

function PageMessage({title, children}) {
  return (
    <main className="shell">
      <section className="card">
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>Mossvale</span>
        </div>
        <p className="eyebrow">PRIVATE FEEDBACK ACCESS</p>
        <h1>{title}</h1>
        <div className="intro">{children}</div>
        <a className="secondary link-button" href="/">
          Return to Mossvale
        </a>
      </section>
    </main>
  );
}

export default async function McpAccessPage() {
  try {
    const supabase = await createSupabaseServerClient();
    const {data: authData} = await supabase.auth.getUser();
    if (!authData.user) return <PageMessage title="Sign in to continue">Use your Zalonline owner account to create and revoke AI access tokens.</PageMessage>;

    const {data: app} = await supabase.from('applications').select('id').eq('slug', 'mossvale').eq('is_enabled', true).maybeSingle();
    if (!app) return <PageMessage title="Mossvale access is unavailable">This account does not currently have owner access to Mossvale.</PageMessage>;

    const {data: profile} = await supabase.from('portal_profiles').select('role').eq('user_id', authData.user.id).maybeSingle();
    if (profile?.role !== 'owner')
      return <PageMessage title="Owner access required">Only the Zalonline portal owner can create or revoke feedback MCP tokens.</PageMessage>;

    const {data: tokens, error} = await supabase.rpc('mossvale_mcp_list_tokens');
    if (error)
      return (
        <PageMessage title="Finish database setup">
          Apply <code>supabase/migrations/20261004_feedback_mcp.sql</code> in the shared Zalonline Supabase project, then reload this page.
        </PageMessage>
      );

    return <McpAccessPanel initialTokens={tokens ?? []} />;
  } catch {
    return <PageMessage title="Access is temporarily unavailable">Try again after signing in to your Zalonline account.</PageMessage>;
  }
}
