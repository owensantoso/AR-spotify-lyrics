import type { UserSettings } from './types';

export function renderSettingsPage(userId: string | undefined, settings: UserSettings): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lyrics Settings</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; line-height: 1.4; }
      .card { max-width: 480px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 16px; }
      h1 { font-size: 24px; margin: 0 0 12px; }
      p { color: #555; }
      label { display: flex; gap: 12px; align-items: center; font-size: 18px; margin: 20px 0; }
      .muted { font-size: 14px; color: #777; }
      .status { font-size: 14px; color: #0a7; min-height: 20px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Lyrics Settings</h1>
      <p>Adjust how lyrics are rendered on the G1.</p>
      <form id="settingsForm" method="GET" action="/webview/save">
        <label>
          <input type="checkbox" name="showPinyin" value="1" ${settings.showPinyin ? 'checked' : ''} />
          Show pinyin for Chinese lyric lines
        </label>
        <label>
          <input type="checkbox" name="fixChineseNaiToNi" value="1" ${settings.fixChineseNaiToNi ? 'checked' : ''} />
          Fix Chinese nai to ni
        </label>
        <label>
          <input type="checkbox" name="showJapaneseRomanization" value="1" ${settings.showJapaneseRomanization ? 'checked' : ''} />
          Show romanization for Japanese lyric lines
        </label>
        <label>
          <input type="checkbox" name="showKoreanRomanization" value="1" ${settings.showKoreanRomanization ? 'checked' : ''} />
          Show romanization for Korean lyric lines
        </label>
        <label>
          <input type="checkbox" name="showOriginalBelowRomanization" value="1" ${settings.showOriginalBelowRomanization ? 'checked' : ''} />
          Show original language below romanization
        </label>
        <label style="display:block;">
          Lyric timing: <span id="offsetValue">${settings.lyricOffsetMs}</span> ms
          <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:14px;color:#666;">
            <span>Earlier</span>
            <span>Later</span>
          </div>
          <input
            type="range"
            name="lyricOffsetMs"
            min="-3000"
            max="3000"
            step="100"
            value="${settings.lyricOffsetMs}"
            style="width:100%;margin-top:12px;"
            oninput="document.getElementById('offsetValue').textContent=this.value"
          />
        </label>
        <label style="display:block;">
          Custom replace from
          <input
            type="text"
            name="customRomanizationFrom"
            value="${escapeHtml(settings.customRomanizationFrom)}"
            style="width:100%;margin-top:8px;padding:8px;border:1px solid #ccc;border-radius:8px;"
            placeholder="e.g. liao"
          />
        </label>
        <label style="display:block;">
          Custom replace to
          <input
            type="text"
            name="customRomanizationTo"
            value="${escapeHtml(settings.customRomanizationTo)}"
            style="width:100%;margin-top:8px;padding:8px;border:1px solid #ccc;border-radius:8px;"
            placeholder="e.g. le"
          />
        </label>
      </form>
      <p id="saveStatus" class="status">Changes apply instantly.</p>
      <p class="muted">Current user: ${userId ?? 'unknown'}</p>
    </div>
    <script>
      const form = document.getElementById('settingsForm');
      const status = document.getElementById('saveStatus');
      let timer = null;

      const save = () => {
        const params = new URLSearchParams(new FormData(form));
        fetch('/webview/save?' + params.toString(), { method: 'GET', credentials: 'same-origin' })
          .then(() => {
            status.textContent = 'Saved';
            window.clearTimeout(timer);
            timer = window.setTimeout(() => { status.textContent = 'Changes apply instantly.'; }, 1000);
          })
          .catch(() => {
            status.textContent = 'Save failed';
          });
      };

      form.addEventListener('change', save);
      form.addEventListener('input', (event) => {
        if (event.target && ['lyricOffsetMs', 'customRomanizationFrom', 'customRomanizationTo'].includes(event.target.name)) {
          save();
        }
      });
    </script>
  </body>
</html>`;
}

export function renderSavedPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Saved</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; line-height: 1.4; }
      .card { max-width: 480px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 16px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Saved</h1>
      <p>Your lyric settings have been updated.</p>
      <p><a href="/webview">Back to settings</a></p>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
