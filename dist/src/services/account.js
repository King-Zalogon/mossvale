/* Same-origin account APIs. The server verifies Supabase identity and app access on every request. */
export function createAccountClient(request = fetch) {
  async function call(path, body) {
    try {
      const response = await request(path, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
        ...(body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {}),
      });
      const data = await response.json();
      if (!response.ok) return {ok: false, status: response.status, error: data.error || 'Account services are unavailable.'};
      return {ok: true, ...data};
    } catch {
      return {ok: false, error: 'Could not confirm the request. Check your connection and retry. Your text and local progress are kept.'};
    }
  }
  return {
    reviewBatch: () => call('/api/feedback-review'),
    feedbackStatus: () => call('/api/feedback'),
    sendFeedback: body => call('/api/feedback', body),
    loadSave: pack => call('/api/account-save?pack=' + encodeURIComponent(pack)),
    storeSave: body => call('/api/account-save', body),
  };
}
