/* Melonia — Revision widget (self-injecting).
   Chargé par les pages d'écoute via <script src=".../revision-widget.js?theme=pv|vsl&gate=off">.
   - gate=off -> toujours visible. Sinon -> visible seulement si l'URL de la page a ?rev=1 (test).
   - Lit lead / name / be dans l'URL de la page. POST la demande au webhook n8n Revision.
   Toute modif = git push (auto-deploy Railway). Aucune édition Shopify nécessaire ensuite. */
(function () {
  var me = document.currentScript;
  var sq; try { sq = new URL(me.src).searchParams; } catch (e) { sq = new URLSearchParams(); }
  var THEME = sq.get('theme') || 'pv';
  var GATEOFF = sq.get('gate') === 'off';
  var WEBHOOK = 'https://n8n.melodineapi.com/webhook/melonia-revision';

  function qp(n) { try { return new URL(location.href).searchParams.get(n) || ''; } catch (e) { return ''; } }
  if (!GATEOFF && qp('rev') !== '1') return; // porte : invisible aux clients tant que gate!=off

  var leadId = (qp('lead') || qp('lead_id') || qp('id') || '').trim().toUpperCase();
  var briefEmail = qp('be') || '';

  var CSS = [
'.mlnrev{--mlnrev-radius:16px;font-family:var(--mlnrev-font-body);color:var(--mlnrev-text);margin:14px 0 8px}',
'.mlnrev *{box-sizing:border-box}',
'.mlnrev-trigger{width:100%;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;background:var(--mlnrev-trigger-bg);color:var(--mlnrev-trigger-ink);border:1px solid var(--mlnrev-border);border-radius:999px;padding:12px 18px;font-family:var(--mlnrev-font-body);font-size:14.5px;font-weight:600;transition:transform .12s ease,box-shadow .18s ease}',
'.mlnrev-trigger:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.08)}',
'.mlnrev-trigger .chev{transition:transform .2s ease;opacity:.7}',
'.mlnrev.is-open .mlnrev-trigger .chev{transform:rotate(180deg)}',
'.mlnrev-trigger .dot{width:7px;height:7px;border-radius:999px;background:var(--mlnrev-accent);flex:0 0 auto}',
'.mlnrev-panel{overflow:hidden;max-height:0;opacity:0;transition:max-height .35s ease,opacity .3s ease,margin .3s ease}',
'.mlnrev.is-open .mlnrev-panel{max-height:1200px;opacity:1;margin-top:12px}',
'.mlnrev-card{background:var(--mlnrev-card);border:1px solid var(--mlnrev-border);border-radius:var(--mlnrev-radius);padding:18px 16px}',
'.mlnrev-title{font-family:var(--mlnrev-font-head);font-size:18px;font-weight:600;margin:0 0 3px;color:var(--mlnrev-ink)}',
'.mlnrev-sub{font-size:13px;color:var(--mlnrev-muted);margin:0 0 14px;line-height:1.45}',
'.mlnrev-choices{display:grid;grid-template-columns:1fr;gap:8px}',
'.mlnrev-choice{display:flex;align-items:center;gap:11px;cursor:pointer;background:var(--mlnrev-bg);border:1.5px solid var(--mlnrev-border);border-radius:13px;padding:12px 13px;text-align:left;width:100%;font-family:var(--mlnrev-font-body);color:var(--mlnrev-text);transition:border-color .15s ease,background .15s ease,transform .1s ease}',
'.mlnrev-choice:hover{transform:translateY(-1px)}',
'.mlnrev-choice.on{border-color:var(--mlnrev-accent);background:var(--mlnrev-accent-tint)}',
'.mlnrev-choice .ic{width:34px;height:34px;border-radius:10px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:17px;background:var(--mlnrev-accent-tint)}',
'.mlnrev-choice.on .ic{background:var(--mlnrev-accent)}',
'.mlnrev-choice .tx b{display:block;font-size:14.5px;font-weight:600}',
'.mlnrev-choice .tx small{display:block;font-size:12px;color:var(--mlnrev-muted);margin-top:1px}',
'.mlnrev-choice .rad{margin-left:auto;width:19px;height:19px;border-radius:999px;border:2px solid var(--mlnrev-border);flex:0 0 auto;position:relative}',
'.mlnrev-choice.on .rad{border-color:var(--mlnrev-accent)}',
'.mlnrev-choice.on .rad::after{content:"";position:absolute;inset:3px;border-radius:999px;background:var(--mlnrev-accent)}',
'.mlnrev-fields{margin-top:14px;display:none}',
'.mlnrev-fields.show{display:block;animation:mlnrevIn .28s ease}',
'@keyframes mlnrevIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
'.mlnrev-field{margin-bottom:10px}',
'.mlnrev-field label{display:block;font-size:12.5px;font-weight:600;margin-bottom:5px;color:var(--mlnrev-text)}',
'.mlnrev-input,.mlnrev-area{width:100%;background:var(--mlnrev-bg);color:var(--mlnrev-text);border:1.5px solid var(--mlnrev-border);border-radius:11px;padding:11px 13px;font-family:var(--mlnrev-font-body);font-size:14.5px;transition:border-color .15s ease}',
'.mlnrev-input:focus,.mlnrev-area:focus{outline:none;border-color:var(--mlnrev-accent)}',
'.mlnrev-input::placeholder,.mlnrev-area::placeholder{color:var(--mlnrev-muted);opacity:.8}',
'.mlnrev-hint{font-size:11.5px;color:var(--mlnrev-muted);margin-top:4px}',
'.mlnrev-area{min-height:66px;resize:vertical;margin-top:2px}',
'.mlnrev-chips{display:flex;flex-wrap:wrap;gap:7px}',
'.mlnrev-chip{cursor:pointer;border:1.5px solid var(--mlnrev-border);background:var(--mlnrev-bg);color:var(--mlnrev-text);border-radius:999px;padding:8px 14px;font-size:13.5px;font-family:var(--mlnrev-font-body);transition:all .12s ease}',
'.mlnrev-chip.on{border-color:var(--mlnrev-accent);background:var(--mlnrev-accent);color:var(--mlnrev-accent-ink);font-weight:600}',
'.mlnrev-reassure{display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:12.5px;color:var(--mlnrev-muted);line-height:1.4}',
'.mlnrev-reassure svg{flex:0 0 auto;margin-top:1px;opacity:.8}',
'.mlnrev-extra-label{font-size:12.5px;font-weight:600;margin:16px 0 4px}',
'.mlnrev-submit{width:100%;margin-top:15px;cursor:pointer;background:var(--mlnrev-accent);color:var(--mlnrev-accent-ink);border:none;border-radius:999px;padding:14px 18px;font-family:var(--mlnrev-font-head);font-size:15.5px;font-weight:600;transition:transform .12s ease,filter .15s ease,opacity .15s ease}',
'.mlnrev-submit:hover{transform:translateY(-1px);filter:brightness(1.05)}',
'.mlnrev-submit:disabled{opacity:.45;cursor:not-allowed;transform:none}',
'.mlnrev-done{display:none}',
'.mlnrev.is-done .mlnrev-panel{display:none}',
'.mlnrev.is-done .mlnrev-trigger{display:none}',
'.mlnrev.is-done .mlnrev-done{display:block;animation:mlnrevIn .4s ease}',
'.mlnrev-done-card{background:var(--mlnrev-card);border:1px solid var(--mlnrev-border);border-radius:var(--mlnrev-radius);padding:22px 18px;text-align:center}',
'.mlnrev-done .badge{width:52px;height:52px;border-radius:999px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;background:var(--mlnrev-accent-tint);font-size:24px}',
'.mlnrev-done h4{font-family:var(--mlnrev-font-head);font-size:19px;margin:0 0 6px;color:var(--mlnrev-ink);font-weight:600}',
'.mlnrev-done p{font-size:13.5px;color:var(--mlnrev-muted);margin:0 auto;max-width:320px;line-height:1.5}',
'.mlnrev-done .mail{font-weight:600;color:var(--mlnrev-text)}',
'.mlnrev-done .eta{display:inline-block;margin-top:12px;font-size:12.5px;padding:6px 13px;border-radius:999px;background:var(--mlnrev-accent-tint);color:var(--mlnrev-ink);font-weight:600}',
'.mlnrev-err{color:#b23;font-size:12.5px;margin-top:10px;display:none}',
'.mlnrev[data-theme="vsl"]{--mlnrev-font-head:"Fraunces",Georgia,serif;--mlnrev-font-body:"DM Sans",system-ui,sans-serif;--mlnrev-bg:#F4EEE5;--mlnrev-card:#FAF6F0;--mlnrev-ink:#3D1A33;--mlnrev-text:#3D1A33;--mlnrev-muted:rgba(61,26,51,0.55);--mlnrev-border:rgba(61,26,51,0.16);--mlnrev-accent:#6B2D5C;--mlnrev-accent-ink:#FFF;--mlnrev-accent-tint:rgba(107,45,92,0.10);--mlnrev-trigger-bg:#FAF6F0;--mlnrev-trigger-ink:#3D1A33}',
'.mlnrev[data-theme="pv"]{--mlnrev-font-head:"Playfair Display",Georgia,serif;--mlnrev-font-body:"Poppins",system-ui,sans-serif;--mlnrev-bg:#FBF7F3;--mlnrev-card:#FFFFFF;--mlnrev-ink:#23201d;--mlnrev-text:#2c2925;--mlnrev-muted:rgba(44,41,37,0.52);--mlnrev-border:rgba(44,41,37,0.14);--mlnrev-accent:#EC7949;--mlnrev-accent-ink:#FFF;--mlnrev-accent-tint:rgba(236,121,73,0.12);--mlnrev-trigger-bg:#FFFFFF;--mlnrev-trigger-ink:#2c2925}'
  ].join('');
  var st = document.createElement('style'); st.appendChild(document.createTextNode(CSS)); document.head.appendChild(st);

  var HTML =
  '<button class="mlnrev-trigger" type="button">'
  + '<span class="dot"></span>'
  + '<span>Not quite right? Fine-tune your preview</span>'
  + '<svg class="chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>'
  + '</button>'
  + '<div class="mlnrev-panel"><div class="mlnrev-card">'
  + '<h3 class="mlnrev-title">What should we change?</h3>'
  + '<p class="mlnrev-sub">Tell us and we\'ll send a fresh preview to your inbox — free, as many times as you need.</p>'
  + '<div class="mlnrev-choices">'
  + '<button class="mlnrev-choice" type="button" data-kind="name"><span class="ic">🗣️</span><span class="tx"><b>A name sounds off</b><small>Wrong pronunciation or spelling</small></span><span class="rad"></span></button>'
  + '<button class="mlnrev-choice" type="button" data-kind="line"><span class="ic">✍️</span><span class="tx"><b>Change a word or a line</b><small>Swap a phrase in the lyrics</small></span><span class="rad"></span></button>'
  + '<button class="mlnrev-choice" type="button" data-kind="vibe"><span class="ic">🎚️</span><span class="tx"><b>Different vibe / music</b><small>New style — makes a fresh take</small></span><span class="rad"></span></button>'
  + '</div>'
  + '<div class="mlnrev-fields"></div>'
  + '<div class="mlnrev-extra-label">Anything else? <span style="font-weight:400;opacity:.65">(optional)</span></div>'
  + '<textarea class="mlnrev-area mlnrev-free" placeholder="Say it in your own words — even a complex request. We read every one."></textarea>'
  + '<div class="mlnrev-reassure" style="display:none"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg><span class="mlnrev-reassure-tx"></span></div>'
  + '<button class="mlnrev-submit" type="button" disabled>Send my new preview</button>'
  + '<div class="mlnrev-err">Something went wrong — please try again in a moment.</div>'
  + '</div></div>'
  + '<div class="mlnrev-done"><div class="mlnrev-done-card"><div class="badge">🎵</div>'
  + '<h4>On it — your new preview is being crafted</h4>'
  + '<p>We\'ll email it to <span class="mail">your inbox</span> in about <b>20 minutes</b>. Same song, tuned the way you want.</p>'
  + '<span class="eta">⏱ New preview in ~20 min</span></div></div>';

  var root = document.createElement('div');
  root.className = 'mlnrev'; root.setAttribute('data-theme', THEME);
  root.innerHTML = HTML;
  me.parentNode.insertBefore(root, me);

  var trigger = root.querySelector('.mlnrev-trigger');
  var fieldsEl = root.querySelector('.mlnrev-fields');
  var freeEl = root.querySelector('.mlnrev-free');
  var submit = root.querySelector('.mlnrev-submit');
  var reassure = root.querySelector('.mlnrev-reassure');
  var reassureTx = root.querySelector('.mlnrev-reassure-tx');
  var state = { kind: null, genre: null, voice: null };

  var TPL = {
    name: '<div class="mlnrev-field"><label>Which name?</label><input class="mlnrev-input" data-f="name" placeholder="e.g. Sarah"></div>'
        + '<div class="mlnrev-field"><label>How should it sound?</label><input class="mlnrev-input" data-f="name_say" placeholder="Spell it out — e.g. Sah-rah, or SAIR-uh"><div class="mlnrev-hint">Write it the way you would say it out loud.</div></div>',
    line: '<div class="mlnrev-field"><label>What it says now</label><input class="mlnrev-input" data-f="from" placeholder="The current word or line"></div>'
        + '<div class="mlnrev-field"><label>What it should say</label><input class="mlnrev-input" data-f="to" placeholder="The new word or line"></div>',
    vibe: '<div class="mlnrev-field"><label>Pick a style</label><div class="mlnrev-chips" data-g="genre">'
        + ['Pop','Country','Rock','R&B','Jazz','Worship','Rap'].map(function (g) { return '<button type="button" class="mlnrev-chip" data-v="' + g + '">' + g + '</button>'; }).join('')
        + '</div></div><div class="mlnrev-field"><label>Voice</label><div class="mlnrev-chips" data-g="voice">'
        + ['Female','Male'].map(function (v) { return '<button type="button" class="mlnrev-chip" data-v="' + v + '">' + v + '</button>'; }).join('') + '</div></div>'
  };
  var REASSURE = {
    name: 'Same melody, same voice, same music — we only re-sing that part.',
    line: 'Same melody, same voice, same music — we only re-sing that part.',
    vibe: 'This one makes a brand-new take in your chosen style.'
  };
  function fval(f) { var e = fieldsEl.querySelector('[data-f="' + f + '"]'); return e ? e.value.trim() : ''; }
  function validate() {
    var ok = false;
    if (state.kind === 'name') ok = fval('name') && fval('name_say');
    else if (state.kind === 'line') ok = fval('from') && fval('to');
    else if (state.kind === 'vibe') ok = state.genre && state.voice;
    if (!ok && freeEl.value.trim()) ok = true;
    submit.disabled = !(ok && leadId);
  }
  trigger.addEventListener('click', function () { root.classList.toggle('is-open'); });
  root.querySelectorAll('.mlnrev-choice').forEach(function (btn) {
    btn.addEventListener('click', function () {
      root.querySelectorAll('.mlnrev-choice').forEach(function (c) { c.classList.remove('on'); });
      btn.classList.add('on');
      state.kind = btn.getAttribute('data-kind'); state.genre = null; state.voice = null;
      fieldsEl.innerHTML = TPL[state.kind]; fieldsEl.classList.add('show');
      reassure.style.display = 'flex'; reassureTx.textContent = REASSURE[state.kind];
      fieldsEl.querySelectorAll('.mlnrev-input').forEach(function (i) { i.addEventListener('input', validate); });
      fieldsEl.querySelectorAll('.mlnrev-chip').forEach(function (ch) {
        ch.addEventListener('click', function () {
          var grp = ch.parentNode.getAttribute('data-g');
          ch.parentNode.querySelectorAll('.mlnrev-chip').forEach(function (x) { x.classList.remove('on'); });
          ch.classList.add('on');
          state[grp] = ch.getAttribute('data-v');
          validate();
        });
      });
      validate();
    });
  });
  freeEl.addEventListener('input', validate);

  submit.addEventListener('click', function () {
    if (submit.disabled) return;
    var fields = {};
    if (state.kind === 'name') { fields.name = fval('name'); fields.name_say = fval('name_say'); }
    else if (state.kind === 'line') { fields.from = fval('from'); fields.to = fval('to'); }
    else if (state.kind === 'vibe') { fields.genre = state.genre; fields.voice = state.voice; }
    var payload = { lead_id: leadId, kind: state.kind || 'free', fields: fields, free_text: freeEl.value.trim(), email: briefEmail };
    submit.disabled = true; submit.textContent = 'Sending…';
    var done = false;
    function showDone() {
      if (done) return; done = true;
      var m = root.querySelector('.mail'); if (m && briefEmail) m.textContent = briefEmail;
      root.classList.add('is-done');
      try { root.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    }
    var t = setTimeout(showDone, 2500);
    fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function () { clearTimeout(t); showDone(); })
      .catch(function () { clearTimeout(t); showDone(); });
  });
})();
