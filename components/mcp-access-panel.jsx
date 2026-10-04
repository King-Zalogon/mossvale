'use client';

import {useEffect, useState} from 'react';

function codexConfig(endpoint) {
  return `[mcp_servers.mossvale_feedback]\nurl = "${endpoint}"\nbearer_token_env_var = "MOSSVALE_MCP_CODEX_TOKEN"`;
}

function claudeConfig(endpoint) {
  return JSON.stringify(
    {
      mcpServers: {
        'mossvale-feedback': {
          type: 'http',
          url: endpoint,
          headers: {Authorization: 'Bearer ${MOSSVALE_MCP_CLAUDE_TOKEN}'},
        },
      },
    },
    null,
    2,
  );
}

export default function McpAccessPanel({initialTokens}) {
  const [tokens, setTokens] = useState(initialTokens);
  const [label, setLabel] = useState('Codex');
  const [issued, setIssued] = useState(null);
  const [endpoint, setEndpoint] = useState('');
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => setEndpoint(`${window.location.origin}/api/mcp`), []);

  async function createToken(event) {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    setIssued(null);
    try {
      const response = await fetch('/api/mcp-tokens', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({label}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not create the MCP token.');
      setTokens(current => [{id: result.id, label: result.label, created_at: result.createdAt, last_used_at: null}, ...current]);
      setIssued(result);
      setStatus('Copy this token now. Mossvale stores only its hash and will not show it again.');
    } catch (error) {
      setStatus(error.message || 'Could not create the MCP token.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeToken(id) {
    setRevoking(id);
    setStatus('');
    try {
      const response = await fetch('/api/mcp-tokens', {
        method: 'DELETE',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not revoke the MCP token.');
      setTokens(current => current.filter(token => token.id !== id));
      if (issued?.id === id) setIssued(null);
      setStatus('Token revoked. The client will lose access on its next request.');
    } catch (error) {
      setStatus(error.message || 'Could not revoke the MCP token.');
    } finally {
      setRevoking('');
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(issued.token);
      setStatus('Token copied. Store it in the selected client’s local secret environment.');
    } catch {
      setStatus('Clipboard access was blocked. Select and copy the token manually.');
    }
  }

  return (
    <main className="shell">
      <section className="card mcp-card">
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>Mossvale</span>
        </div>
        <p className="eyebrow">PRIVATE FEEDBACK ACCESS</p>
        <h1>Connect your AI clients</h1>
        <p className="intro">
          Create one read-only token per client. Each token can list pending player feedback through the private MCP endpoint, and you can revoke it here at any
          time.
        </p>

        <form className="form" onSubmit={createToken}>
          <label htmlFor="mcp-label">Client label</label>
          <input id="mcp-label" maxLength={40} onChange={event => setLabel(event.target.value)} placeholder="Codex or Claude Code" required value={label} />
          <button className="primary" disabled={busy || !label.trim()} type="submit">
            {busy ? 'Creating…' : 'Create one-time token'}
          </button>
        </form>

        {issued && (
          <div className="mcp-issued" role="status">
            <label htmlFor="mcp-token">Copy this token now</label>
            <textarea id="mcp-token" readOnly rows={3} value={issued.token} />
            <button className="secondary" onClick={copyToken} type="button">
              Copy token
            </button>
            <p className="mcp-warning">Do not put the token in a prompt, source file, or checked-in MCP config.</p>
            {endpoint && (
              <>
                {/claude/i.test(issued.label) ? (
                  <>
                    <h2>Claude Code setup</h2>
                    <p>
                      Store it as <code>MOSSVALE_MCP_CLAUDE_TOKEN</code>, then add this server entry to your user-level MCP configuration:
                    </p>
                    <pre>{claudeConfig(endpoint)}</pre>
                  </>
                ) : (
                  <>
                    <h2>Codex setup</h2>
                    <p>
                      Store it in the local environment as <code>MOSSVALE_MCP_CODEX_TOKEN</code>, then add this to <code>~/.codex/config.toml</code>:
                    </p>
                    <pre>{codexConfig(endpoint)}</pre>
                  </>
                )}
              </>
            )}
          </div>
        )}

        <div className="mcp-token-section">
          <h2>Active tokens</h2>
          {tokens.length ? (
            <ul className="mcp-token-list">
              {tokens.map(token => (
                <li className="mcp-token-row" key={token.id}>
                  <span>
                    <b>{token.label}</b>
                    <small>
                      Created {new Date(token.created_at).toLocaleDateString()}
                      {token.last_used_at ? ` · Used ${new Date(token.last_used_at).toLocaleDateString()}` : ' · Not used yet'}
                    </small>
                  </span>
                  <button className="secondary revoke-button" disabled={revoking === token.id} onClick={() => revokeToken(token.id)} type="button">
                    {revoking === token.id ? 'Revoking…' : 'Revoke'}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mcp-empty">No active MCP tokens.</p>
          )}
        </div>

        {status && (
          <p className="status" role="status">
            {status}
          </p>
        )}
        <p className="privacy-note">Tokens are stored as SHA-256 hashes. MCP access is owner-only, read-only, and limited to pending feedback fields.</p>
        <a className="secondary link-button" href="/">
          Return to Mossvale
        </a>
      </section>
    </main>
  );
}
