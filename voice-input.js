/* Melonia — Voice input for the quiz open-ended questions.
   Adds a prominent round mic button (bottom-right, inside the field, MeCantara-style)
   under the 3 story textareas (#mlnQeQualities, #mlnQeMemories, #mlnQeMessage).
   Records audio, sends it to /transcribe (OpenAI), drops the text into the field.
   Injected on /pages/quiz by campaign-capture.js. */
(function () {
  'use strict';
  if (window.__mlnVoiceInit) return;
  window.__mlnVoiceInit = true;

  var ENDPOINT = 'https://melonia-audio-production.up.railway.app/transcribe';
  var TARGETS = ['mlnQeQualities', 'mlnQeMemories', 'mlnQeMessage'];
  var ORANGE = '#E9764B';

  var css = document.createElement('style');
  css.textContent = [
    '.mln-voice-wrap{position:relative;}',
    '.mln-qe-textarea.mln-has-voice{padding-bottom:64px !important;}',
    '.mln-voice{position:absolute;right:14px;bottom:14px;display:flex;align-items:center;gap:11px;z-index:3;}',
    '.mln-voice-hint{font-family:inherit;font-size:14px;font-weight:600;color:#B5623B;white-space:nowrap;text-align:right;max-width:150px;line-height:1.2;}',
    '.mln-voice-btn{width:52px;height:52px;border-radius:50%;background:' + ORANGE + ' !important;color:#fff !important;border:none !important;display:inline-flex !important;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 18px rgba(233,118,75,.45);transition:transform .15s ease,box-shadow .15s ease,background .15s ease;-webkit-tap-highlight-color:transparent;flex-shrink:0;padding:0;}',
    '.mln-voice-btn:hover{box-shadow:0 8px 22px rgba(233,118,75,.55);}',
    '.mln-voice-btn:active{transform:scale(.94);}',
    '.mln-voice-btn.rec{background:#d9403a !important;animation:mlnVoiceRing 1.4s ease-out infinite;}',
    '@keyframes mlnVoiceRing{0%{box-shadow:0 0 0 0 rgba(217,64,58,.5)}70%{box-shadow:0 0 0 15px rgba(217,64,58,0)}100%{box-shadow:0 0 0 0 rgba(217,64,58,0)}}',
    '.mln-voice-btn.busy{background:#c9beb6 !important;pointer-events:none;box-shadow:none;}',
    '.mln-voice-ico{width:23px;height:23px;display:block;}',
    '.mln-voice-spin{width:20px;height:20px;border:2.5px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:mlnVoiceSpin .7s linear infinite;}',
    '@keyframes mlnVoiceSpin{to{transform:rotate(360deg)}}',
    '@media (max-width:480px){.mln-voice-hint{font-size:13px;max-width:120px;}.mln-voice-btn{width:50px;height:50px;}}'
  ].join('');
  document.head.appendChild(css);

  var MIC_SVG = '<svg class="mln-voice-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>';
  var STOP_SVG = '<svg class="mln-voice-ico" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5"></rect></svg>';

  function pickMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    var c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg'];
    for (var i = 0; i < c.length; i++) if (MediaRecorder.isTypeSupported(c[i])) return c[i];
    return '';
  }
  function extFor(m) { if (m.indexOf('mp4') > -1) return 'm4a'; if (m.indexOf('mpeg') > -1) return 'mp3'; if (m.indexOf('ogg') > -1) return 'ogg'; return 'webm'; }

  function attach(textarea) {
    if (!textarea || textarea.__mlnVoice) return;
    textarea.__mlnVoice = true;
    textarea.classList.add('mln-has-voice');

    var wrap = document.createElement('div');
    wrap.className = 'mln-voice-wrap';
    textarea.parentNode.insertBefore(wrap, textarea);
    wrap.appendChild(textarea);

    var ctrl = document.createElement('div');
    ctrl.className = 'mln-voice';
    var hint = document.createElement('span');
    hint.className = 'mln-voice-hint';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Speak your answer');
    ctrl.appendChild(hint);
    ctrl.appendChild(btn);
    wrap.appendChild(ctrl);

    function setIdle() { btn.className = 'mln-voice-btn'; btn.innerHTML = MIC_SVG; hint.textContent = 'Speak your answer'; }
    function setRec() { btn.className = 'mln-voice-btn rec'; btn.innerHTML = STOP_SVG; hint.textContent = 'Listening… tap to stop'; }
    function setBusy() { btn.className = 'mln-voice-btn busy'; btn.innerHTML = '<span class="mln-voice-spin"></span>'; hint.textContent = 'Writing…'; }
    function say(m) { hint.textContent = m; }
    setIdle();

    var rec = null, chunks = [], stream = null, mime = '';
    function stopStream() { if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } }

    function insert(text) {
      text = (text || '').trim();
      if (!text) { say('Didn’t catch that'); setTimeout(setIdle, 1600); return; }
      var cur = textarea.value.trim();
      textarea.value = cur ? (cur + ' ' + text) : text;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      say('Added ✓'); setTimeout(setIdle, 1400);
    }

    async function start() {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (e) { say('Allow mic access'); setTimeout(setIdle, 2000); return; }
      mime = pickMime();
      try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
      catch (e) { try { rec = new MediaRecorder(stream); mime = ''; } catch (e2) { say('Not supported here'); stopStream(); setTimeout(setIdle, 2000); return; } }
      chunks = [];
      rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
      rec.onstop = send;
      rec.start();
      setRec();
    }
    function stop() { if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch (e) {} } stopStream(); }

    async function send() {
      setBusy();
      try {
        var type = (rec && rec.mimeType) || mime || 'audio/webm';
        var blob = new Blob(chunks, { type: type });
        if (!blob.size) { say('Nothing recorded'); setTimeout(setIdle, 1600); return; }
        var fd = new FormData();
        fd.append('audio', blob, 'answer.' + extFor(type));
        var r = await fetch(ENDPOINT, { method: 'POST', body: fd });
        var j = await r.json().catch(function () { return {}; });
        if (!r.ok || j.error) { say('Try again'); setTimeout(setIdle, 1800); return; }
        insert(j.text);
      } catch (e) { say('Network error'); setTimeout(setIdle, 1800); }
    }

    btn.addEventListener('click', function () { if (rec && rec.state === 'recording') stop(); else start(); });
  }

  function init() { TARGETS.forEach(function (id) { attach(document.getElementById(id)); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
