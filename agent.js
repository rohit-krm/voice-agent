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
    <div style="position:fixed;bottom:12px;left:12px;right:12px;z-index:999999;background:#0f172a;color:#fff;padding:12px;border-radius:14px;box-shadow:0 10px 25px rgba(0,0,0,0.5);border:1px solid #38bdf8;font-family:sans-serif;max-width:480px;margin:auto;">
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
        <input id="ai-cmd" type="text" placeholder="Bolein: Naam Rohit aur Email abc@gmail.com bharo..." style="flex:1;padding:8px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#fff;font-size:12px;" />
        <button id="ai-run" style="background:#10b981;color:#fff;border:none;border-radius:8px;padding:0 14px;font-weight:bold;font-size:12px;cursor:pointer;">Go</button>
      </div>
    </div>
  `;
  document.body.appendChild(bar);

  const statusEl = document.getElementById('ai-status');
  const cmdInput = document.getElementById('ai-cmd');

  document.getElementById('ai-close').onclick = () => bar.remove();

  // 2. File Upload
  document.getElementById('ai-file').onchange = function (e) {
    const file = e.target.files[0];
    if (!file) return;
    uploadedMimeType = file.type;
    const reader = new FileReader();
    reader.onload = function () {
      uploadedFileBase64 = reader.result.split(',')[1];
      document.getElementById('ai-file-label').innerText = "✅ " + file.name.slice(0, 14);
      statusEl.innerText = "Doc Ready";
    };
    reader.readAsDataURL(file);
  };

  // 3. Voice Input
  document.getElementById('ai-mic').onclick = function () {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return alert("Browser voice support nahi karta.");
    const rec = new SpeechRec();
    rec.lang = 'hi-IN';
    statusEl.innerText = "Sun raha hun...";
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      cmdInput.value = text;
      executeAgent(text);
    };
    rec.onerror = (e) => (statusEl.innerText = "Mic: " + e.error);
    rec.start();
  };

  document.getElementById('ai-run').onclick = () => {
    if (cmdInput.value.trim()) executeAgent(cmdInput.value.trim());
  };

  // 4. Smart DOM Scanner (Google Forms + Normal Sites)
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

  // 5. Gemini API Call
  async function executeAgent(userCommand) {
    statusEl.innerText = "AI soch raha hai...";
    const domMap = scanPageElements();

    const prompt = `You are a form-filling assistant.
User said: "${userCommand}"
Form fields on page: ${JSON.stringify(domMap)}

Task: Map user's spoken info (or attached document info) to the matching form field IDs.
Even if user just speaks a name like "Rohit Maurya", match it to the "Name" input field!
Return ONLY a valid JSON array. Example: [{"id": 1, "action": "type", "value": "Rohit Maurya"}]
Use action "type" for text/textarea inputs, and "click" for buttons/radio/checkboxes.`;

    const parts = [{ text: prompt }];
    if (uploadedFileBase64) {
      parts.push({ inline_data: { mime_type: uploadedMimeType, data: uploadedFileBase64 } });
    }

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await res.json();
      if (data.error) {
        statusEl.innerText = "API Error: " + data.error.message.slice(0, 35);
        return;
      }

      const rawText = data.candidates[0].content.parts[0].text;
      const actions = JSON.parse(rawText);

      // 6. Google Forms Compatible Value Setter
      actions.forEach((act) => {
        const target = document.querySelector(`[data-ai-id="${act.id}"]`);
        if (!target) return;

        if (act.action === 'type') {
          target.focus();
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set ||
                               Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
          if (nativeSetter && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
            nativeSetter.call(target, act.value);
          } else {
            target.value = act.value;
          }
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          target.blur();
        } else if (act.action === 'click') {
          target.click();
        }
      });

      statusEl.innerText = `✅ Filled (${actions.length})`;
    } catch (err) {
      console.error("Agent Error:", err);
      statusEl.innerText = "Err: " + err.message.slice(0, 30);
    }
  }
})();
