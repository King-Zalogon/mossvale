import {$, header, downloadText} from './dom.js';
import {createAccountClient} from '../services/account.js';

const esc = text => String(text).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

export function createAccountMenus(app, open) {
  const client = createAccountClient();
  let draft = '';
  let submission = null; // preserve request identity after an ambiguous network failure
  let busy = false;
  let requestInFlight = null;

  async function feedback(back) {
    open(
      `${header('FEEDBACK', 'Help improve this adventure')}<p id="feedback-loading">Loading your account…</p><button id="f-back">Back</button>`,
      'menu',
      'Game feedback',
    );
    $('#f-back').onclick = back;
    $('#modal .close').onclick = app.actions.close;
    const loadingBack = $('#f-back');
    if (requestInFlight) await requestInFlight;
    if (!loadingBack.isConnected || $('#modal').hidden) return;
    const status = await client.feedbackStatus();
    if (!loadingBack.isConnected || $('#modal').hidden) return; // the user left while the request was in flight
    if (!status.ok) {
      $('#feedback-loading').textContent = 'Feedback is unavailable right now.';
      $('#f-back').insertAdjacentHTML(
        'beforebegin',
        `<p role="alert">${esc(status.error)}${status.status === 401 ? ' Sign in again on this site to send feedback.' : ''}</p>`,
      );
      return;
    }
    open(
      `${header('FEEDBACK', 'What could we improve?')}<p>Sending as <b>${esc(status.account)}</b>. ${status.remaining} of ${status.dailyLimit} messages left today. Resets at midnight UTC.</p><form id="feedback-form"><label for="feedback-text">Your feedback</label><textarea id="feedback-text" rows="7" maxlength="4000" aria-describedby="feedback-count feedback-note" required>${esc(draft)}</textarea><p id="feedback-count" aria-live="polite"></p><p id="feedback-note">Up to ${status.maxCharacters.toLocaleString()} characters. You can describe several improvements in one message. We store your account, this map/build and the submission time. Please leave passwords and personal details out.</p><p id="feedback-status" role="status" aria-live="polite"></p><div class="menu-list"><button id="feedback-send" class="primary" type="submit">Send feedback</button>${status.canReview ? '<button id="f-review" type="button">Download pending feedback for AI review</button>' : ''}<button id="f-back" type="button">Back</button></div></form>`,
      'menu',
      'Game feedback',
    );
    const text = $('#feedback-text');
    const send = $('#feedback-send');
    const count = $('#feedback-count');
    const notice = $('#feedback-status');
    let remaining = status.remaining;
    const update = () => {
      draft = text.value;
      const length = [...draft.trim()].length;
      count.textContent = `${length.toLocaleString()} / ${status.maxCharacters.toLocaleString()} characters`;
      send.disabled = busy || !length || length > status.maxCharacters || remaining <= 0;
    };
    text.oninput = update;
    $('#f-back').onclick = back;
    if ($('#f-review'))
      $('#f-review').onclick = async () => {
        const batch = await client.reviewBatch();
        if (!notice.isConnected || $('#modal').hidden) return;
        if (batch.ok) {
          downloadText('mossvale-private-feedback.json', JSON.stringify({instructions: batch.instructions, feedback: batch.feedback}, null, 2));
          notice.textContent = 'Private feedback batch downloaded. Keep it out of the public repository.';
        } else notice.textContent = batch.error;
      };
    $('#modal .close').onclick = app.actions.close;
    $('#feedback-form').onsubmit = async e => {
      e.preventDefault();
      if (send.disabled || busy) return;
      if (!submission || submission.message !== draft.trim() || submission.accountId !== status.accountId) {
        submission = {
          requestId: crypto.randomUUID(),
          message: draft.trim(),
          accountId: status.accountId,
          packId: app.adventures.current.id,
          mapId: app.game.save.mapId,
          build: app.build?.short ?? null,
        };
      }
      busy = true;
      text.readOnly = true;
      update();
      notice.textContent = 'Sending…';
      requestInFlight = client.sendFeedback(submission);
      const result = await requestInFlight;
      requestInFlight = null;
      busy = false;
      if (result.ok) {
        remaining = result.remaining;
        draft = '';
        submission = null;
      }
      if (!notice.isConnected || $('#modal').hidden) return; // do not reopen a closed menu
      text.readOnly = false;
      text.value = draft;
      notice.textContent = result.ok ? `Thank you. Your feedback was saved. ${remaining} messages left today.` : result.error;
      if (result.status === 429) remaining = 0;
      update();
    };
    update();
    requestAnimationFrame(() => {
      if (text.isConnected && !$('#modal').hidden) text.focus();
    });
  }

  async function accountSave(back) {
    open(
      `${header('ACCOUNT SAVE', 'Your adventure, across devices')}<p>Local autosaving continues. Account saves are checkpoints you upload and restore explicitly.</p><p id="account-status" role="status">Loading your account checkpoint…</p><div class="menu-list"><button id="account-upload" disabled>Save current browser progress to account</button><button id="account-restore" disabled>Restore account checkpoint…</button><button id="account-back">Back</button></div>`,
      'menu',
      'Account save',
    );
    const notice = $('#account-status');
    const upload = $('#account-upload');
    const restore = $('#account-restore');
    $('#account-back').onclick = back;
    $('#modal .close').onclick = app.actions.close;
    const record = await client.loadSave(app.adventures.current.id);
    if (!notice.isConnected || $('#modal').hidden) return;
    if (!record.ok) {
      notice.textContent = record.error;
      return;
    }
    notice.textContent = `${record.account}: ${record.updatedAt ? 'checkpoint from ' + new Date(record.updatedAt).toLocaleString() : 'no account checkpoint yet'}.`;
    upload.disabled = !app.canStartOver();
    restore.disabled = !record.backup || !app.canStartOver();
    upload.onclick = async () => {
      upload.disabled = restore.disabled = true;
      notice.textContent = 'Saving account checkpoint…';
      const backup = app.actions.accountBackup();
      const result = await client.storeSave({
        packId: app.adventures.current.id,
        accountId: record.accountId,
        revision: record.revision,
        backup,
      });
      if (!notice.isConnected || $('#modal').hidden) return;
      if (result.ok) {
        notice.textContent = 'Account checkpoint saved. Local autosaving continues.';
        record.revision = result.revision;
        record.backup = backup;
        record.updatedAt = result.updatedAt;
        restore.disabled = false;
      } else notice.textContent = result.error;
      // Conflicts require reopening and inspecting the latest checkpoint, never a blind overwrite.
      upload.disabled = result.status === 409 || result.status === 401;
    };
    restore.onclick = () => {
      const checked = app.actions.checkAccountBackup(record.backup);
      if (!checked.ok) {
        notice.textContent = checked.reason;
        return;
      }
      open(
        `${header('RESTORE ACCOUNT SAVE', 'Replace this browser’s progress?', false)}<p>The checkpoint from ${esc(new Date(record.updatedAt ?? Date.now()).toLocaleString())} will replace your current adventure. Your current local progress is kept as a backup.</p><div class="menu-list"><button id="account-confirm" class="primary">Restore account checkpoint</button><button id="account-cancel">Keep current progress</button></div>`,
        'menu',
        'Confirm account restore',
      );
      $('#account-confirm').onclick = () => app.actions.applyImport(checked.save);
      $('#account-cancel').onclick = () => accountSave(back);
    };
  }
  return {feedback, accountSave};
}
