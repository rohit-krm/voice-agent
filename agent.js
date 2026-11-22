(function () {
  if (document.getElementById('rohit-ai-agent-bar')) return;

  const API_KEY = window.__AI_KEY__;
  const SHEET_URL = window.__SHEET_URL__;
  let uploadedFileBase64 = null;
  let uploadedMimeType = null;

  // 1. Floating UI
  const bar = document.createElement('div');
  bar.id = 'rohit-ai-agent-bar';
  bar.innerHTML = `
    <div style="position:fixed;bottom:12px;left:12px;right:12px;z-index:999999;background:#0f172a;color:#fff;padding:12px;border-radius:14px;box-shadow:0 10px 25px rgba(0,0,0,0.5);border:1px solid #38bdf8;font-family:sans-serif;max-width:500px;margin:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-weight:bold;font-size:13px;color:#38bdf8;">🤖 Live Form Agent</span>
        <span id="ai-status" style="font-size:11px;color:#34d399;">Ready</span>
        <button id="ai-close" style="background:none;border:none;color:#f87171;font-size:16px;cursor:pointer;">✕</button>
      </div>
      
      <div style="display:flex;gap:6px;margin-bottom:8px;">
        <label style="flex:1;background:#1e293b;padding:8px;border-radius:8px;text-align:center;font-size:12px;cursor:pointer;border:1px dashed #64748b;">
          <span id="ai-file-label">📎 Doc / Image</span>
          <input type="file" id="ai-file" accept="image/*,application/pdf" style="display:none;" />
        </label>
        <button id="ai-mic" style="flex:1;background:#0284c7;color:#fff;border:none;border-radius:8px;padding:8px;font-weight:bold;font-size:12px;cursor:pointer;">🎤 Bolkar Bhejein</button>
      </div>

      <div style="display:flex;gap:6px;">
        <input id="ai-cmd" type="text" placeholder="Bolein: Naam, Email, Address, Phone bhar do..." style="flex:1;padding:8px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#fff;font-size:12px;" />
        <button id="ai-run" style="background:#10b981;color:#fff;border:none;border-radius:8px;padding:0 14px;font-weight:bold;font-size:12px;cursor:pointer;">Go</button>
      </div>
    </div>
  `;
  document.body.appendChild(bar);

  const statusEl = document.getElementById('ai-status');
  const cmdInput = document.getElementById('ai-cmd');

  document.getElementById('ai-close').onclick = () => bar.remove();

  // 2. File Upload (Image / PDF)
  document.getElementById('ai-file').onchange = function (e) {
    const file = e.target.files[0];
    if (!file) return;
    uploadedMimeType = file.type || 'image/jpeg';
    const reader = new FileReader();
    reader.onload = function () {
      uploadedFileBase64 = reader.result.split(',')[1];
      document.getElementById('ai-file-label').innerText = "✅ " + file.name.slice(0, 14);
      statusEl.innerText = "Image Ready — Ab bolein ya Go dabayein";
    };
    reader.readAsDataURL(file);
  };

  // 3. Voice Input (Auto-Run after speaking)
  document.getElementById('ai-mic').onclick = function () {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return alert("Browser voice support nahi karta.");
    const rec = new SpeechRec();
    rec.lang = 'hi-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    statusEl.innerText = "🎤 Bolte rahiye...";
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript.trim();
      cmdInput.value = text;
      if (text) {
        executeAgent(text);
      }
    };
    rec.onerror = (e) => {
      statusEl.innerText = "Mic: " + e.error;
    };
    rec.start();
  };

  document.getElementById('ai-run').onclick = () => {
    const cmd = cmdInput.value.trim() || "Attached document se form bhar do";
    executeAgent(cmd);
  };

  // 4. Safe Value Setter (No Illegal Invocation)
  function setElementValue(el, val) {
    try {
      el.focus();
      const strVal = String(val);
      if (el.tagName === 'INPUT') {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, strVal);
        else el.value = strVal;
      } else if (el.tagName === 'TEXTAREA') {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (setter) setter.call(el, strVal);
        else el.value = strVal;
      } else if (el.tagName === 'SELECT') {
        el.value = strVal;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    } catch (e) {
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // 5. Smart DOM Scanner
  function scanPageElements() {
    const elements = [];
    document.querySelectorAll('input:not([type="hidden"]), textarea, select, button, [role="button"], [role="radio"], [role="checkbox"]').forEach((el, idx) => {
      if (el.closest('#rohit-ai-agent-bar')) return;
      el.setAttribute('data-ai-id', idx);

      let label = el.getAttribute('aria-label') || el.placeholder || el.name || el.innerText || "";
      const parentQuestion = el.closest('[role="listitem"]');
      if (parentQuestion) {
        const heading = parentQuestion.querySelector('[role="heading"]');
        if (heading) label = heading.innerText.replace(/\*/g, '').trim();
      }

      elements.push({
        id: idx,
        tag: el.tagName.toLowerCase(),
        type: el.type || el.getAttribute('role') || '',
        question_or_label: label.trim().slice(0, 120)
      });
    });
    return elements;
  }

  // 6. Gemini Execution Engine
  async function executeAgent(userCommand) {
    statusEl.innerText = "⚡ AI bhar raha hai...";
    const domMap = scanPageElements();

    const prompt = `You are a precision form-filling assistant.
User Command / Spoken Data: "${userCommand}"
Available Form Fields: ${JSON.stringify(domMap)}

Rules:
1. Extract values from the user command AND/OR attached document/image (like Aadhaar/ID/card).
2. Match each piece of data to the exact field 'id' from Available Form Fields.
3. For Email fields: always format as a clean valid email address (no spaces, no Hindi words, lowercase).
4. For Phone/Mobile fields: extract digits cleanly (e.g. 10-digit mobile number without spaces).
5. Return ONLY a valid JSON array of actions.
Example:
[
  {"id": 1, "action": "type", "value": "Rohit Kumar Maurya"},
  {"id": 2, "action": "type", "value": "rohit2052018@gmail.com"},
  {"id": 3, "action": "type", "value": "Chakshivramgir, Jaunpur, UP"},
  {"id": 4, "action": "type", "value": "8317072042"}
]
Only use "type" for inputs/textareas, and "click" only if user explicitly asks to click/submit.`;

    const parts = [{ text: prompt }];
    if (uploadedFileBase64) {
      parts.push({
        inline_data: {
          mime_type: uploadedMimeType,
          data: uploadedFileBase64
        }
      });
    }

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1
          }
        })
      });

      const data = await res.json();
      if (data.error) {
        statusEl.innerText = "API Err: " + data.error.message.slice(0, 35);
        return;
      }

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      const actions = JSON.parse(rawText);

      let filledCount = 0;
      actions.forEach((act) => {
        const target = document.querySelector(`[data-ai-id="${act.id}"]`);
        if (!target) return;

        if (act.action === 'type' && act.value !== undefined) {
          setElementValue(target, act.value);
          filledCount++;
        } else if (act.action === 'click') {
          target.click();
          filledCount++;
        }
      });

      statusEl.innerText = `✅ Filled ${filledCount} fields`;
    } catch (err) {
      console.error("Agent Error:", err);
      statusEl.innerText = "Err: " + (err.message || "Failed").slice(0, 32);
    }
  }
})();
