/* Melonia — Revision widget (self-injecting, external).
   Install : <script src=".../revision-widget.js"></script> collé n'importe où dans la page.
   - Se place tout seul JUSTE AVANT la section "What's Included" (.mln-included), sinon avant les
     avis (#mln-reviews), sinon sous le lecteur (.mln-player-card).
   - Thème auto (page preview orange / page VSL prune). Surcharge : ?theme=pv|vsl.
   - Porte : visible seulement si l'URL a ?rev=1 (test). ?gate=off => toujours visible (live).
   - Lit lead / name / be dans l'URL. POST la demande au webhook n8n Revision.
   Toute modif = git push (auto-deploy Railway). Aucune édition Shopify ensuite. */
(function () {
  var me = document.currentScript;
  var sq; try { sq = new URL(me.src).searchParams; } catch (e) { sq = new URLSearchParams(); }
  var THEME = sq.get('theme') || (document.querySelector('.mln-press-play, #mln-timer-clock, #mln-generating') ? 'vsl' : 'pv');
  var GATEOFF = sq.get('gate') === 'off';
  var WEBHOOK = 'https://n8n.melodineapi.com/webhook/melonia-revision';

  function qp(n) { try { return new URL(location.href).searchParams.get(n) || ''; } catch (e) { return ''; } }
  if (!GATEOFF && qp('rev') !== '1') return;

  var leadId = (qp('lead') || qp('lead_id') || qp('id') || '').trim().toUpperCase();
  var briefEmail = qp('be') || '';

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', run); }
  else { run(); }

  function run() {

  var CSS = [
'.mlnrev{font-family:var(--mlnrev-font-body);color:var(--mlnrev-text);position:relative;overflow:hidden;background:var(--mlnrev-section-bg);border:1px solid var(--mlnrev-border);border-radius:26px;padding:34px 26px 30px;margin:6px 0 30px;box-shadow:0 12px 40px var(--mlnrev-shadow)}',
'.mlnrev *{box-sizing:border-box}',
'.mlnrev::before{content:"";position:absolute;top:0;left:0;right:0;height:6px;background:linear-gradient(90deg,var(--mlnrev-accent) 0%,var(--mlnrev-accent2) 60%,rgba(0,0,0,0) 100%)}',
'.mlnrev-eyebrow{text-align:center;color:var(--mlnrev-accent-deep);font-size:12.5px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;margin-bottom:9px}',
'.mlnrev-title{font-family:var(--mlnrev-font-head);font-weight:700;font-size:clamp(24px,6vw,29px);letter-spacing:-.3px;text-align:center;color:var(--mlnrev-ink);line-height:1.18;margin:0 0 8px}',
'.mlnrev-sub{text-align:center;color:var(--mlnrev-muted);font-size:16px;line-height:1.5;margin:0 auto 22px;max-width:430px}',
'.mlnrev-choices{display:grid;grid-template-columns:1fr;gap:11px}',
'.mlnrev-choice{display:flex;align-items:center;gap:14px;cursor:pointer;background:var(--mlnrev-card);border:2px solid var(--mlnrev-border);border-radius:16px;padding:16px 16px;text-align:left;width:100%;font-family:var(--mlnrev-font-body);color:var(--mlnrev-text);transition:border-color .15s ease,background .15s ease,box-shadow .15s ease,transform .1s ease}',
'.mlnrev-choice:hover{transform:translateY(-1px);box-shadow:0 8px 22px var(--mlnrev-shadow)}',
'.mlnrev-choice.on{border-color:var(--mlnrev-accent);background:var(--mlnrev-accent-tint);box-shadow:0 8px 24px var(--mlnrev-shadow)}',
'.mlnrev-choice .ic{width:44px;height:44px;border-radius:12px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:21px;background:var(--mlnrev-accent-tint)}',
'.mlnrev-choice.on .ic{background:var(--mlnrev-accent)}',
'.mlnrev-choice .tx{flex:1;min-width:0}',
'.mlnrev-choice .tx b{display:block;font-size:16.5px;font-weight:700;color:var(--mlnrev-ink)}',
'.mlnrev-choice .tx small{display:block;font-size:13.5px;color:var(--mlnrev-muted);margin-top:2px}',
'.mlnrev-choice .rad{margin-left:auto;width:23px;height:23px;border-radius:999px;border:2px solid var(--mlnrev-border);flex:0 0 auto;position:relative}',
'.mlnrev-choice.on .rad{border-color:var(--mlnrev-accent)}',
'.mlnrev-choice.on .rad::after{content:"";position:absolute;inset:4px;border-radius:999px;background:var(--mlnrev-accent)}',
'.mlnrev-fields{margin-top:18px;display:none}',
'.mlnrev-fields.show{display:block;animation:mlnrevIn .3s ease}',
'@keyframes mlnrevIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
'.mlnrev-field{margin-bottom:14px}',
'.mlnrev-field label{display:block;font-size:14px;font-weight:600;margin-bottom:7px;color:var(--mlnrev-ink)}',
'.mlnrev-input,.mlnrev-area{width:100%;background:var(--mlnrev-card);color:var(--mlnrev-text);border:2px solid var(--mlnrev-border);border-radius:13px;padding:14px 15px;font-family:var(--mlnrev-font-body);font-size:16px;transition:border-color .15s ease}',
'.mlnrev-input:focus,.mlnrev-area:focus{outline:none;border-color:var(--mlnrev-accent)}',
'.mlnrev-input::placeholder,.mlnrev-area::placeholder{color:var(--mlnrev-muted);opacity:.75}',
'.mlnrev-hint{font-size:12.5px;color:var(--mlnrev-muted);margin-top:6px}',
'.mlnrev-area{min-height:80px;resize:vertical}',
'.mlnrev-chips{display:flex;flex-wrap:wrap;gap:9px}',
'.mlnrev-chip{cursor:pointer;border:2px solid var(--mlnrev-border);background:var(--mlnrev-card);color:var(--mlnrev-text);border-radius:999px;padding:10px 18px;font-size:15px;font-family:var(--mlnrev-font-body);transition:all .12s ease}',
'.mlnrev-chip.on{border-color:var(--mlnrev-accent);background:var(--mlnrev-accent);color:var(--mlnrev-accent-ink);font-weight:600}',
'.mlnrev-extra-label{font-size:14px;font-weight:600;color:var(--mlnrev-ink);margin:20px 0 6px}',
'.mlnrev-reassure{display:flex;gap:9px;align-items:flex-start;margin-top:16px;font-size:13.5px;color:var(--mlnrev-muted);line-height:1.45}',
'.mlnrev-reassure svg{flex:0 0 auto;margin-top:1px;color:var(--mlnrev-success)}',
'.mlnrev-submit{width:100%;margin-top:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:11px;background:var(--mlnrev-accent);color:var(--mlnrev-accent-ink);border:none;border-radius:16px;padding:19px 22px;font-family:var(--mlnrev-font-body);font-size:18px;font-weight:800;letter-spacing:.2px;box-shadow:0 12px 30px var(--mlnrev-cta-shadow);transition:transform .12s ease,filter .15s ease,opacity .15s ease}',
'.mlnrev-submit svg{display:block}',
'.mlnrev-submit:hover:not(:disabled){transform:translateY(-2px);filter:brightness(1.04)}',
'.mlnrev-submit:disabled{opacity:.4;cursor:not-allowed;box-shadow:none}',
'.mlnrev-err{color:#b23;font-size:13px;margin-top:12px;text-align:center;display:none}',
'.mlnrev-done{text-align:center;padding:12px 6px}',
'.mlnrev-done .badge{width:66px;height:66px;border-radius:999px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;background:var(--mlnrev-accent-tint);font-size:31px}',
'.mlnrev-done h4{font-family:var(--mlnrev-font-head);font-size:23px;margin:0 0 8px;color:var(--mlnrev-ink);font-weight:700}',
'.mlnrev-done p{font-size:15.5px;color:var(--mlnrev-muted);margin:0 auto;max-width:360px;line-height:1.55}',
'.mlnrev-done .mail{font-weight:700;color:var(--mlnrev-text)}',
'.mlnrev-done .eta{display:inline-block;margin-top:16px;font-size:14px;padding:9px 18px;border-radius:999px;background:var(--mlnrev-accent-tint);color:var(--mlnrev-accent-deep);font-weight:700}',
'.mlnrev[data-theme="vsl"]{--mlnrev-font-head:"Fraunces",Georgia,serif;--mlnrev-font-body:"DM Sans",system-ui,sans-serif;--mlnrev-section-bg:#FAF6F0;--mlnrev-card:#FFFFFF;--mlnrev-ink:#3D1A33;--mlnrev-text:#3D1A33;--mlnrev-muted:rgba(61,26,51,.6);--mlnrev-border:rgba(61,26,51,.14);--mlnrev-accent:#6B2D5C;--mlnrev-accent2:#8E4076;--mlnrev-accent-deep:#5A2350;--mlnrev-accent-ink:#FFF;--mlnrev-accent-tint:rgba(107,45,92,.10);--mlnrev-success:#2C5F3D;--mlnrev-shadow:rgba(61,26,51,.08);--mlnrev-cta-shadow:rgba(107,45,92,.34)}',
'.mlnrev[data-theme="pv"]{--mlnrev-font-head:"Playfair Display",Georgia,serif;--mlnrev-font-body:"Poppins",system-ui,sans-serif;--mlnrev-section-bg:#FFF7F0;--mlnrev-card:#FFFFFF;--mlnrev-ink:#17181C;--mlnrev-text:#5E5F66;--mlnrev-muted:#9A9BA1;--mlnrev-border:rgba(23,24,28,.10);--mlnrev-accent:#EC7949;--mlnrev-accent2:#F39865;--mlnrev-accent-deep:#C2571F;--mlnrev-accent-ink:#FFF;--mlnrev-accent-tint:rgba(236,121,73,.12);--mlnrev-success:#21A45C;--mlnrev-shadow:rgba(23,24,28,.07);--mlnrev-cta-shadow:rgba(236,121,73,.4)}'
  ].join('');
  var st = document.createElement('style'); st.appendChild(document.createTextNode(CSS)); document.head.appendChild(st);

  var HTML =
    '<div class="mlnrev-eyebrow">Free revisions</div>'
  + '<h2 class="mlnrev-title">Not quite perfect? We\'ll fix it.</h2>'
  + '<p class="mlnrev-sub">Tell us what to change and we\'ll send a fresh preview to your inbox — free, as many times as you need.</p>'
  + '<div class="mlnrev-choices">'
  + '<button class="mlnrev-choice" type="button" data-kind="name"><span class="ic">🗣️</span><span class="tx"><b>A name sounds off</b><small>Wrong pronunciation or spelling</small></span><span class="rad"></span></button>'
  + '<button class="mlnrev-choice" type="button" data-kind="line"><span class="ic">✍️</span><span class="tx"><b>Change a word or a line</b><small>Swap a phrase in the lyrics</small></span><span class="rad"></span></button>'
  + '<button class="mlnrev-choice" type="button" data-kind="vibe"><span class="ic">🎚️</span><span class="tx"><b>Different vibe / music</b><small>A brand-new take in a new style</small></span><span class="rad"></span></button>'
  + '</div>'
  + '<div class="mlnrev-fields"></div>'
  + '<div class="mlnrev-extra-label">Anything else? <span style="font-weight:400;color:var(--mlnrev-muted)">(optional)</span></div>'
  + '<textarea class="mlnrev-area mlnrev-free" placeholder="Say it in your own words — even a complex request. We read every one."></textarea>'
  + '<div class="mlnrev-reassure" style="display:none"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg><span class="mlnrev-reassure-tx"></span></div>'
  + '<button class="mlnrev-submit" type="button" disabled>Send my free revision'
  + '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg></button>'
  + '<div class="mlnrev-err">Something went wrong — please try again in a moment.</div>';

  var DONE =
    '<div class="mlnrev-done"><div class="badge">🎵</div>'
  + '<h4>On it — your new preview is being crafted</h4>'
  + '<p>We\'ll email it to <span class="mail">your inbox</span> in about <b>20 minutes</b>. Same song, tuned exactly the way you want.</p>'
  + '<span class="eta">⏱ New preview in ~20 min</span></div>';

  var root = document.createElement('div');
  root.className = 'mlnrev'; root.setAttribute('data-theme', THEME);
  root.innerHTML = HTML;

  // Placement : avant "What's Included", sinon avant les avis, sinon sous le lecteur.
  var before = document.querySelector('.mln-included') || document.querySelector('#mln-reviews') || document.querySelector('.mln-testimonials');
  if (before && before.parentNode) { before.parentNode.insertBefore(root, before); }
  else {
    var pc = document.querySelector('.mln-player-card');
    if (pc && pc.parentNode) pc.parentNode.insertBefore(root, pc.nextSibling);
    else me.parentNode.insertBefore(root, me);
  }

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
      root.innerHTML = DONE;
      var m = root.querySelector('.mail'); if (m && briefEmail) m.textContent = briefEmail;
      try { root.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    }
    var t = setTimeout(showDone, 2500);
    fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function () { clearTimeout(t); showDone(); })
      .catch(function () { clearTimeout(t); showDone(); });
  });

  } // fin run()
})();
