/* Melonia — Voice input for the quiz open-ended questions.
   Injects a "speak your answer" mic button under the 3 story textareas
   (#mlnQeQualities, #mlnQeMemories, #mlnQeMessage). Records audio in the
   browser, sends it to /transcribe (OpenAI), and drops the text into the field.
   Loaded via a single <script src=".../voice-input.js"> tag on /pages/quiz. */
(function () {
  'use strict';
  if (window.__mlnVoiceInit) return;
  window.__mlnVoiceInit = true;

  var ENDPOINT = 'https://melonia-audio-production.up.railway.app/transcribe';
  var TARGETS = ['mlnQeQualities', 'mlnQeMemories', 'mlnQeMessage'];
  var ORANGE = '#E9764B';

  // ---- styles ----
  var css = document.createElement('style');
  css.textContent = [
    '.mln-voice{margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}',
    '.mln-voice-btn{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1.5px solid ' + ORANGE + ';color:' + ORANGE + ';font-family:inherit;font-size:13.5px;font-weight:600;padding:9px 16px;border-radius:999px;cursor:pointer;transition:all .15s ease;-webkit-tap-highlight-color:transparent;}',
    '.mln-voice-btn:hover{background:rgba(233,118,75,.08);}',
    '.mln-voice-btn:active{transform:scale(.98);}',
    '.mln-voice-btn.rec{background:' + ORANGE + ';color:#fff;}',
    '.mln-voice-btn.busy{opacity:.6;pointer-events:none;}',
    '.mln-voice-ico{width:15px;height:15px;display:block;}',
    '.mln-voice-dot{width:9px;height:9px;border-radius:50%;background:#fff;animation:mlnVoicePulse 1s ease-in-out infinite;}',
    '@keyframes mlnVoicePulse{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}',
    '.mln-voice-hint{font-family:inherit;font-size:12px;font-style:italic;color:#8a7f85;}',
    '.mln-voice-spin{width:14px;height:14px;border:2px solid rgba(233,118,75,.3);border-top-color:' + ORANGE + ';border-radius:50%;animation:mlnVoiceSpin .7s linear infinite;}',
    '@keyframes mlnVoiceSpin{to{transform:rotate(360deg)}}'
  ].join('');
  document.head.appendChild(css);

  var MIC_SVG = '<svg class="mln-voice-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>';

  function pickMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    var cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg'];
    for (var i = 0; i < cands.length; i++) if (MediaRecorder.isTypeSupported(cands[i])) return cands[i];
    return '';
  }
  function extFor(mime) {
    if (mime.indexOf('mp4') > -1) return 'm4a';
    if (mime.indexOf('mpeg') > -1) return 'mp3';
    if (mime.indexOf('ogg') > -1) return 'ogg';
    return 'webm';
  }

  function attach(textarea) {
    if (!textarea || textarea.__mlnVoice) return;
    textarea.__mlnVoice = true;

    var bar = document.createElement('div');
    bar.className = 'mln-voice';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mln-voice-btn';
    var hint = document.createElement('span');
    hint.className = 'mln-voice-hint';
    hint.textContent = 'or tap to speak your answer';
    setIdle();
    bar.appendChild(btn);
    bar.appendChild(hint);
    textarea.parentNode.insertBefore(bar, textarea.nextSibling);

    var rec = null, chunks = [], stream = null, mime = '';

    function setIdle() { btn.className = 'mln-voice-btn'; btn.innerHTML = MIC_SVG + '<span>Speak</span>'; }
    function setRec() { btn.className = 'mln-voice-btn rec'; btn.innerHTML = '<span class="mln-voice-dot"></span><span>Tap to stop</span>'; }
    function setBusy() { btn.className = 'mln-voice-btn busy'; btn.innerHTML = '<span class="mln-voice-spin"></span><span>Writing…</span>'; }
    function say(msg) { hint.textContent = msg; }

    function stopStream() { if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } }

    function insert(text) {
      text = (text || '').trim();
      if (!text) { say('Didn’t catch that — try again.'); return; }
      var cur = textarea.value.trim();
      textarea.value = cur ? (cur + ' ' + text) : text;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.focus();
      say('Added ✓ you can edit it or speak more.');
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        say('Mic blocked — allow microphone access to use this.');
        return;
      }
      mime = pickMime();
      try {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch (e) {
        try { rec = new MediaRecorder(stream); mime = ''; } catch (e2) { say('Voice not supported on this browser.'); stopStream(); return; }
      }
      chunks = [];
      rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
      rec.onstop = send;
      rec.start();
      setRec();
      say('Listening… speak naturally.');
    }

    function stop() {
      if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch (e) {} }
      stopStream();
    }

    async function send() {
      setBusy();
      say('Turning your words into text…');
      try {
        var type = (rec && rec.mimeType) || mime || 'audio/webm';
        var blob = new Blob(chunks, { type: type });
        if (!blob.size) { setIdle(); say('Nothing recorded — try again.'); return; }
        var fd = new FormData();
        fd.append('audio', blob, 'answer.' + extFor(type));
        var r = await fetch(ENDPOINT, { method: 'POST', body: fd });
        var j = await r.json().catch(function () { return {}; });
        if (!r.ok || j.error) { setIdle(); say(j.error ? ('Error: ' + j.error) : 'Transcription failed — try again.'); return; }
        insert(j.text);
      } catch (e) {
        say('Network error — try again.');
      }
      setIdle();
    }

    btn.addEventListener('click', function () {
      if (rec && rec.state === 'recording') stop(); else start();
    });
  }

  function init() {
    TARGETS.forEach(function (id) { attach(document.getElementById(id)); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
