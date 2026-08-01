/* Melonia — Revision widget (self-injecting, external).
   Install : <script src=".../revision-widget.js"></script> collé n'importe où dans la page.
   - Se place avant "What's Included" (.mln-included), sinon avant les avis, sinon sous le lecteur.
   - Thème auto (preview orange / VSL prune). Porte ?rev=1 (test) ; ?gate=off = live.
   - 2 temps : hero (GRATUIT + 20 min + gros bouton) -> formulaire au clic. Minimal, aéré.
   Toute modif = git push. */
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
'.mlnrev{font-family:var(--mlnrev-font-body);color:var(--mlnrev-text);position:relative;overflow:hidden;background:var(--mlnrev-section-bg);border:1px solid var(--mlnrev-border);border-radius:26px;padding:52px 34px 48px;margin:10px 0 34px;box-shadow:0 14px 44px var(--mlnrev-shadow)}',
'.mlnrev *{box-sizing:border-box}',
'.mlnrev::before{content:"";position:absolute;top:0;left:0;right:0;height:7px;background:var(--mlnrev-accent)}',
'.mlnrev-badges{display:flex;justify-content:center;flex-wrap:wrap;gap:12px;margin:0 0 28px}',
'.mlnrev-badge{display:inline-flex;align-items:center;gap:7px;background:var(--mlnrev-accent-tint);color:var(--mlnrev-accent-deep);font-weight:700;font-size:14px;letter-spacing:.2px;padding:10px 18px;border-radius:999px}',
'.mlnrev-title{font-family:var(--mlnrev-font-head);font-weight:700;font-size:clamp(25px,6.4vw,32px);letter-spacing:-.4px;text-align:center;color:var(--mlnrev-ink);line-height:1.25;margin:0 0 18px}',
'.mlnrev-sub{text-align:center;color:var(--mlnrev-muted);font-size:17px;line-height:1.65;margin:0 auto 34px;max-width:380px}',
'.mlnrev-sub b{color:var(--mlnrev-accent-deep);font-weight:700}',
'.mlnrev-cta{width:100%;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:12px;background:var(--mlnrev-accent);color:var(--mlnrev-accent-ink);border:none;border-radius:16px;padding:21px 22px;font-family:var(--mlnrev-font-body);font-size:18.5px;font-weight:800;letter-spacing:.2px;box-shadow:0 14px 32px var(--mlnrev-cta-shadow);transition:transform .12s ease,filter .15s ease,opacity .15s ease}',
'.mlnrev-cta svg{display:block}',
'.mlnrev-cta:hover:not(:disabled){transform:translateY(-2px);filter:brightness(1.05)}',
'.mlnrev-cta:disabled{opacity:.4;cursor:not-allowed;box-shadow:none}',
'.mlnrev-form{display:none}',
'.mlnrev-form.show{display:block;animation:mlnrevIn .32s ease}',
'@keyframes mlnrevIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
'.mlnrev-q{font-family:var(--mlnrev-font-head);font-weight:700;font-size:20px;color:var(--mlnrev-ink);text-align:center;margin:0 0 18px}',
'.mlnrev-choices{display:grid;grid-template-columns:1fr;gap:13px}',
'.mlnrev-choice{display:flex;align-items:center;gap:15px;cursor:pointer;background:var(--mlnrev-card);border:2px solid var(--mlnrev-border);border-radius:16px;padding:18px 17px;text-align:left;width:100%;font-family:var(--mlnrev-font-body);color:var(--mlnrev-text);transition:border-color .15s ease,box-shadow .15s ease,transform .1s ease}',
'.mlnrev-choice:hover{transform:translateY(-1px);box-shadow:0 8px 22px var(--mlnrev-shadow)}',
'.mlnrev-choice.on{border-color:var(--mlnrev-accent);box-shadow:0 8px 24px var(--mlnrev-shadow)}',
'.mlnrev-choice .ic{width:46px;height:46px;border-radius:13px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:22px;background:var(--mlnrev-accent-tint)}',
'.mlnrev-choice .tx b{display:block;font-size:17px;font-weight:700;color:var(--mlnrev-ink);line-height:1.3}',
'.mlnrev-choice .rad{margin-left:auto;width:24px;height:24px;border-radius:999px;border:2px solid var(--mlnrev-border);flex:0 0 auto;position:relative}',
'.mlnrev-choice.on .rad{border-color:var(--mlnrev-accent)}',
'.mlnrev-choice.on .rad::after{content:"";position:absolute;inset:4px;border-radius:999px;background:var(--mlnrev-accent)}',
'.mlnrev-fields{margin-top:20px;display:none}',
'.mlnrev-fields.show{display:block;animation:mlnrevIn .28s ease}',
'.mlnrev-field{margin-bottom:16px}',
'.mlnrev-field label{display:block;font-size:14.5px;font-weight:600;margin-bottom:8px;color:var(--mlnrev-ink)}',
'.mlnrev-input,.mlnrev-area{width:100%;background:var(--mlnrev-card);color:var(--mlnrev-text);border:2px solid var(--mlnrev-border);border-radius:13px;padding:15px 16px;font-family:var(--mlnrev-font-body);font-size:16px;transition:border-color .15s ease}',
'.mlnrev-input:focus,.mlnrev-area:focus{outline:none;border-color:var(--mlnrev-accent)}',
'.mlnrev-input::placeholder,.mlnrev-area::placeholder{color:var(--mlnrev-muted);opacity:.7}',
'.mlnrev-hint{font-size:13px;color:var(--mlnrev-muted);margin-top:7px}',
'.mlnrev-area{min-height:74px;resize:vertical}',
'.mlnrev-chips{display:flex;flex-wrap:wrap;gap:10px}',
'.mlnrev-chip{cursor:pointer;border:2px solid var(--mlnrev-border);background:var(--mlnrev-card);color:var(--mlnrev-text);border-radius:999px;padding:11px 19px;font-size:15px;font-family:var(--mlnrev-font-body);transition:all .12s ease}',
'.mlnrev-chip.on{border-color:var(--mlnrev-accent);background:var(--mlnrev-accent);color:var(--mlnrev-accent-ink);font-weight:600}',
'.mlnrev-note-toggle{display:inline-block;margin-top:18px;color:var(--mlnrev-accent-deep);font-size:14.5px;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:3px}',
'.mlnrev-note{margin-top:12px;display:none}',
'.mlnrev-note.show{display:block}',
'.mlnrev-foot{margin-top:24px}',
'.mlnrev-foot .mlnrev-cta{margin:0}',
'.mlnrev-foot-note{text-align:center;color:var(--mlnrev-muted);font-size:13.5px;margin-top:12px}',
'.mlnrev-err{color:#b23;font-size:13px;margin-top:12px;text-align:center;display:none}',
'.mlnrev-done{text-align:center}',
'.mlnrev-done .badge{width:72px;height:72px;border-radius:999px;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;background:var(--mlnrev-accent-tint);font-size:34px}',
'.mlnrev-done h4{font-family:var(--mlnrev-font-head);font-size:25px;margin:0 0 10px;color:var(--mlnrev-ink);font-weight:700}',
'.mlnrev-done p{font-size:16px;color:var(--mlnrev-muted);margin:0 auto;max-width:340px;line-height:1.6}',
'.mlnrev-done .mail{font-weight:700;color:var(--mlnrev-text)}',
'.mlnrev[data-theme="vsl"]{--mlnrev-font-head:"Fraunces",Georgia,serif;--mlnrev-font-body:"DM Sans",system-ui,sans-serif;--mlnrev-section-bg:#FAF6F0;--mlnrev-card:#FFFFFF;--mlnrev-ink:#3D1A33;--mlnrev-text:#3D1A33;--mlnrev-muted:rgba(61,26,51,.6);--mlnrev-border:rgba(61,26,51,.14);--mlnrev-accent:#6B2D5C;--mlnrev-accent-deep:#5A2350;--mlnrev-accent-ink:#FFF;--mlnrev-accent-tint:rgba(107,45,92,.11);--mlnrev-shadow:rgba(61,26,51,.08);--mlnrev-cta-shadow:rgba(107,45,92,.32)}',
'.mlnrev[data-theme="pv"]{--mlnrev-font-head:"Playfair Display",Georgia,serif;--mlnrev-font-body:"Poppins",system-ui,sans-serif;--mlnrev-section-bg:#FFF7F0;--mlnrev-card:#FFFFFF;--mlnrev-ink:#17181C;--mlnrev-text:#5E5F66;--mlnrev-muted:#94959B;--mlnrev-border:rgba(23,24,28,.10);--mlnrev-accent:#EC7949;--mlnrev-accent-deep:#C2571F;--mlnrev-accent-ink:#FFF;--mlnrev-accent-tint:rgba(236,121,73,.12);--mlnrev-shadow:rgba(23,24,28,.07);--mlnrev-cta-shadow:rgba(236,121,73,.42)}'
  ].join('');
  // Injecté en fin de <body> (après le reset .mln-page * de la page) pour que nos marges/paddings gagnent.
  var st = document.createElement('style'); st.appendChild(document.createTextNode(CSS));
  (document.body || document.documentElement).appendChild(st);

  var arrow = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';

  var HTML =
    '<div class="mlnrev-hero">'
  +   '<div class="mlnrev-badges"><span class="mlnrev-badge">100% free</span><span class="mlnrev-badge">Ready in ~20 min</span></div>'
  +   '<h2 class="mlnrev-title">Not loving your preview?</h2>'
  +   '<p class="mlnrev-sub">We\'ll send you a fresh one — <b>free</b>, in about <b>20 minutes</b>.</p>'
  +   '<button class="mlnrev-cta mlnrev-open" type="button">Get my free revision' + arrow + '</button>'
  + '</div>'
  + '<div class="mlnrev-form">'
  +   '<div class="mlnrev-q">What should we change?</div>'
  +   '<div class="mlnrev-choices">'
  +     '<button class="mlnrev-choice" type="button" data-kind="name"><span class="ic">🗣️</span><span class="tx"><b>A name sounds off</b></span><span class="rad"></span></button>'
  +     '<button class="mlnrev-choice" type="button" data-kind="line"><span class="ic">✍️</span><span class="tx"><b>Change a word or a line</b></span><span class="rad"></span></button>'
  +     '<button class="mlnrev-choice" type="button" data-kind="vibe"><span class="ic">🎚️</span><span class="tx"><b>Different vibe / music</b></span><span class="rad"></span></button>'
  +   '</div>'
  +   '<div class="mlnrev-fields"></div>'
  +   '<span class="mlnrev-note-toggle">+ Add a note (optional)</span>'
  +   '<div class="mlnrev-note"><textarea class="mlnrev-area mlnrev-free" placeholder="Say it in your own words — even a complex request."></textarea></div>'
  +   '<div class="mlnrev-foot">'
  +     '<button class="mlnrev-cta mlnrev-submit" type="button" disabled>Send my free revision' + arrow + '</button>'
  +     '<div class="mlnrev-foot-note">Free · new preview in ~20 min</div>'
  +   '</div>'
  +   '<div class="mlnrev-err">Something went wrong — please try again in a moment.</div>'
  + '</div>';

  var DONE =
    '<div class="mlnrev-done"><div class="badge">🎵</div>'
  + '<h4>On it — your new preview is on the way</h4>'
  + '<p>We\'ll email it to <span class="mail">your inbox</span> in about <b>20 minutes</b>.</p></div>';

  var root = document.createElement('div');
  root.className = 'mlnrev'; root.setAttribute('data-theme', THEME);
  root.innerHTML = HTML;

  var before = document.querySelector('.mln-included') || document.querySelector('#mln-reviews') || document.querySelector('.mln-testimonials');
  if (before && before.parentNode) { before.parentNode.insertBefore(root, before); }
  else {
    var pc = document.querySelector('.mln-player-card');
    if (pc && pc.parentNode) pc.parentNode.insertBefore(root, pc.nextSibling);
    else me.parentNode.insertBefore(root, me);
  }

  var hero = root.querySelector('.mlnrev-hero');
  var form = root.querySelector('.mlnrev-form');
  var fieldsEl = root.querySelector('.mlnrev-fields');
  var noteToggle = root.querySelector('.mlnrev-note-toggle');
  var noteBox = root.querySelector('.mlnrev-note');
  var freeEl = root.querySelector('.mlnrev-free');
  var submit = root.querySelector('.mlnrev-submit');
  var state = { kind: null, genre: null, voice: null };

  var TPL = {
    name: '<div class="mlnrev-field"><label>Which name?</label><input class="mlnrev-input" data-f="name" placeholder="e.g. Sarah"></div>'
        + '<div class="mlnrev-field"><label>How should it sound?</label><input class="mlnrev-input" data-f="name_say" placeholder="Spell it out — e.g. Sah-rah"><div class="mlnrev-hint">Write it the way you would say it out loud.</div></div>',
    line: '<div class="mlnrev-field"><label>What it says now</label><input class="mlnrev-input" data-f="from" placeholder="The current word or line"></div>'
        + '<div class="mlnrev-field"><label>What it should say</label><input class="mlnrev-input" data-f="to" placeholder="The new word or line"></div>',
    vibe: '<div class="mlnrev-field"><label>Style</label><div class="mlnrev-chips" data-g="genre">'
        + ['Pop','Country','Rock','R&B','Jazz','Worship','Rap'].map(function (g) { return '<button type="button" class="mlnrev-chip" data-v="' + g + '">' + g + '</button>'; }).join('')
        + '</div></div><div class="mlnrev-field"><label>Voice</label><div class="mlnrev-chips" data-g="voice">'
        + ['Female','Male'].map(function (v) { return '<button type="button" class="mlnrev-chip" data-v="' + v + '">' + v + '</button>'; }).join('') + '</div></div>'
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
  root.querySelector('.mlnrev-open').addEventListener('click', function () {
    hero.style.display = 'none'; form.classList.add('show');
  });
  noteToggle.addEventListener('click', function () {
    noteBox.classList.add('show'); noteToggle.style.display = 'none'; freeEl.focus();
  });
  root.querySelectorAll('.mlnrev-choice').forEach(function (btn) {
    btn.addEventListener('click', function () {
      root.querySelectorAll('.mlnrev-choice').forEach(function (c) { c.classList.remove('on'); });
      btn.classList.add('on');
      state.kind = btn.getAttribute('data-kind'); state.genre = null; state.voice = null;
      fieldsEl.innerHTML = TPL[state.kind]; fieldsEl.classList.add('show');
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
