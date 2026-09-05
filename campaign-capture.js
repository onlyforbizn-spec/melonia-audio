/* Melonia — campaign capture (script externe auto-injecté).
   Chargé via <script src="https://melonia-audio-production.up.railway.app/campaign-capture.js"></script>
   en bas du body de /pages/quiz (et quiz-big4 si créée) ET de /pages/summary.

   Attribution 100 % fiable, sans dépendre d'un param d'URL mutable :
   - La pub Big Four atterrit sur /pages/landing-page dont les boutons pointent vers
     /pages/quiz?c=big4 (lien interne codé en dur → param transmis à coup sûr).
   - Sur le quiz, ce ?c=big4 pose le tag. La pub US va sur /pages/quiz sans param → défaut "us".

   Stockage du TAG texte en sessionStorage (par onglet) ; l'ID de campagne Meta, lui, est
   TRIPLE-stocké (session + localStorage + cookie, TTL 7 j) — voir readCampaignId/writeCampaignId.
   - survit à toute la navigation du parcours (landing → quiz → summary, y compris le bouton "retour"),
   - meurt à la fermeture de l'onglet → jamais de tag périmé d'une session précédente.
   Règle : un ?c= explicite prime et écrit toujours ; sinon on ne pose le défaut que si RIEN n'est
   déjà stocké (donc le "retour" vers /pages/quiz n'écrase jamais un big4 déjà posé).

   Aucun impact sur la logique du wizard : capture passive + patch ciblé du seul appel Web3Forms. */
(function () {
  'use strict';
  var KEY = 'mln_campaign';
  var KEY_ID = 'mln_campaign_id'; // ID numérique de campagne Meta (utm_campaign), capté au quiz
  var ID_TTL_MS = 7 * 24 * 3600 * 1000; // fenêtre d'attribution clic Meta (7 j), dernier clic gagne
  var ALIAS = {
    big4: 'big4', bigfour: 'big4', 'big-4': 'big4', big_four: 'big4', bf: 'big4',
    us: 'us', usa: 'us', 'us-only': 'us'
  };

  function slug(v) {
    return String(v || '').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
  }
  // N'accepte QUE des valeurs connues (us|big4 via alias). Toute autre valeur (ex. un
  // utm_campaign = ID numérique de campagne Meta) est ignorée -> on retombe sur le défaut de page.
  function normalize(raw) {
    return ALIAS[slug(raw)] || '';
  }
  function ss() { try { return window.sessionStorage; } catch (e) { return null; } }
  function readCampaign() { var s = ss(); try { return (s && s.getItem(KEY)) || ''; } catch (e) { return ''; } }
  function writeCampaign(v) { var s = ss(); try { if (s) s.setItem(KEY, v); } catch (e) {} }
  // — ID de campagne : TRIPLE stockage (session + local + cookie), TTL 7 j, dernier clic gagne.
  //   sessionStorage seul perdait ~1 demande Facebook sur 5 (mesuré 31/08→04/09) : le client
  //   clique l'ad, ferme la webview FB, revient plus tard en direct → nouvelle session, ID perdu,
  //   demande attribuée « us » à tort. local + cookie survivent au retour ; le TTL borne à la
  //   même fenêtre que l'attribution Meta (7 j clic) → jamais de tag périmé au-delà.
  function ls() { try { return window.localStorage; } catch (e) { return null; } }
  function freshId(raw) { // "id.timestamp" → id si l'horodatage est dans la fenêtre, sinon ''
    var i = String(raw || '').split('.');
    if (i.length !== 2 || !/^\d{6,20}$/.test(i[0])) return '';
    var t = parseInt(i[1], 10);
    return (isFinite(t) && Date.now() - t <= ID_TTL_MS) ? i[0] : '';
  }
  function readCampaignId() {
    var s = ss(); try { var v = s && s.getItem(KEY_ID); if (v && /^\d{6,20}$/.test(v)) return v; } catch (e) {}
    var l = ls(); try { var w = freshId(l && l.getItem(KEY_ID)); if (w) return w; } catch (e) {}
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' + KEY_ID + '=([^;]*)'));
      var c = freshId(m && m[1]);
      if (c) return c;
    } catch (e) {}
    return '';
  }
  function writeCampaignId(v) {
    var now = Date.now();
    var s = ss(); try { if (s) s.setItem(KEY_ID, v); } catch (e) {}
    var l = ls(); try { if (l) l.setItem(KEY_ID, v + '.' + now); } catch (e) {}
    try {
      document.cookie = KEY_ID + '=' + v + '.' + now + '; max-age=' + Math.floor(ID_TTL_MS / 1000) + '; path=/; SameSite=Lax';
    } catch (e) {}
  }

  // Détecte la campagne depuis le nom de la page d'atterrissage quiz. null si ce n'est pas une
  // page quiz (ex. summary, landing-page) → on ne pose rien, on se contente de lire à l'injection.
  function landingCampaign() {
    var p = '';
    try { p = (location.pathname || '').toLowerCase(); } catch (e) { return null; }
    if (p.indexOf('quiz') === -1) return null;
    if (/big-?4|bigfour/.test(p)) return 'big4';   // page Big Four dédiée si un jour créée
    return 'us';                                    // page quiz standard → défaut US
  }

  // 1) Sur une page d'atterrissage quiz : pose le tag. ?c= explicite prime toujours ; sinon
  //    on ne met le défaut que si rien n'est déjà stocké (le "retour" n'écrase pas un big4).
  try {
    var landing = landingCampaign();
    if (landing !== null) {
      var q = new URLSearchParams(location.search);
      // UNIQUEMENT notre param dédié ?c= — surtout PAS utm_campaign (Meta y met l'ID de campagne FB).
      var override = normalize(q.get('c'));
      if (override) writeCampaign(override);
      else if (!readCampaign()) writeCampaign(landing);
      // L'ID de campagne Meta (utm_campaign numérique) est capté À PART, dans sa propre clé —
      // jamais dans le tag texte (leçon du 3/08 : l'ID dans le tag faisait disparaître des leads).
      // Le serveur le bucketise en us/big4 via les noms de campagne Meta (metaCampaignBucketMap),
      // ce qui répare l'attribution des demandes d'extrait quand l'ad atterrit direct sur
      // /pages/quiz sans ?c= (c'est le cas de TOUTES les ads — prouvé le 8/08).
      // Un nouvel ID explicite écrase (le dernier clic d'ad gagne) ; l'absence n'efface jamais.
      var cid = String(q.get('utm_campaign') || '').trim();
      if (/^\d{6,20}$/.test(cid)) writeCampaignId(cid);
    }
  } catch (e) {}

  // 1b) Enregistre `campaign` comme super-property PostHog → TOUS les events du quiz la portent
  //     (permet de splitter l'abandon du quiz par campagne). Retry tant que posthog n'est pas prêt.
  try {
    var campForPH = readCampaign() || 'us';
    var phTries = 0;
    var phReg = function () {
      try {
        if (window.posthog && typeof window.posthog.register === 'function') {
          window.posthog.register({ campaign: campForPH });
          return true;
        }
      } catch (e) {}
      return false;
    };
    if (!phReg()) {
      var phIv = setInterval(function () {
        phTries++;
        if (phReg() || phTries > 25) clearInterval(phIv);
      }, 200);
    }
  } catch (e) {}

  // 1c) Tracke l'initiation de checkout en first-party (clic sur un CTA .mln-cta ou lien /cart/).
  //     Immédiat et fiable → le dashboard compte les checkouts sans attendre le "panier abandonné"
  //     de Shopify (différé de plusieurs heures et seulement si l'email a été saisi). lead depuis ?lead=.
  try {
    document.addEventListener('click', function (e) {
      try {
        var el = e.target;
        var t = (el && el.closest) ? el.closest('.mln-cta, a[href*="/cart/"]') : null;
        if (!t) return;
        var lead = new URLSearchParams(location.search).get('lead') || '';
        if (!lead) return;
        var url = 'https://melonia-tracking-production.up.railway.app/track?lead='
          + encodeURIComponent(lead) + '&ev=checkout&src=preview';
        if (window.fetch) { window.fetch(url, { mode: 'no-cors', keepalive: true }).catch(function () {}); }
        else { var img = new Image(); img.src = url; }
      } catch (e2) {}
    }, true);
  } catch (e) {}

  // 1d) [RETIRÉ le 01/09/2026 — décision Ewen : tout s'affiche en USD, partout.]
  //     La localisation devise Big Four (geo-IP → ?country= + prix CAD/AUD/NZD via Storefront)
  //     vivait ici. Les 3 marchés Shopify CA/AU/NZ sont désormais en base currency USD :
  //     ne PAS réintroduire de conversion côté front, les prix codés en dur des pages font foi.

  // 2) Injecte campaign dans le submit Web3Forms — UNIQUEMENT sur la page summary.
  //    Ailleurs (produits, panier, landing) le script ne touche à rien : fetch n'est jamais patché.
  var onSummary = false;
  try { onSummary = (location.pathname || '').toLowerCase().indexOf('summary') !== -1; } catch (e) {}
  if (onSummary && window.fetch && !window.__mlnCampaignPatched) {
    window.__mlnCampaignPatched = true;
    var _fetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        if (url.indexOf('api.web3forms.com/submit') !== -1 && init && typeof init.body === 'string') {
          var c = readCampaign() || 'us';
          var payload = JSON.parse(init.body);
          if (payload && typeof payload === 'object') {
            payload.campaign = c;
            if (typeof payload.message === 'string' && payload.message.indexOf('Campaign:') === -1) {
              var withLine = payload.message.replace(
                /(NEW PREVIEW REQUEST[^\n]*\n)/,
                '$1Campaign: ' + c + '\n'
              );
              payload.message = (withLine.indexOf('Campaign:') !== -1)
                ? withLine
                : ('Campaign: ' + c + '\n' + payload.message);
            }
            // ID de campagne Meta capté au quiz → champ dédié + ligne « CampaignId: » dans le
            // message. La ligne voyage avec le brief jusqu'au POST /track du workflow Suno
            // (aucun node n8n à toucher — même mécanisme que « Funnel: country ») ; le serveur
            // la parse (parseBrief) et bucketise en us/big4. Rien n'est ajouté si pas d'ID.
            var cid = readCampaignId();
            if (/^\d{6,20}$/.test(cid)) {
              payload.campaign_id = cid;
              if (typeof payload.message === 'string' && payload.message.indexOf('CampaignId:') === -1) {
                var withId = payload.message.replace(
                  /(Campaign:[^\n]*\n)/,
                  '$1CampaignId: ' + cid + '\n'
                );
                payload.message = (withId.indexOf('CampaignId:') !== -1)
                  ? withId
                  : ('CampaignId: ' + cid + '\n' + payload.message);
              }
            }
            // Reformate le téléphone en E.164 selon le pays choisi (#mlnCpCountry) : US défaut, +CA/AU/NZ.
            // La page envoie le numéro local ; ici on préfixe le bon indicatif pour que le SMS Onoff
            // parte au bon pays (aujourd'hui tout était forcé en +1, cassait AU/NZ).
            try {
              var sel = document.getElementById('mlnCpCountry');
              var country = (sel && sel.value) || 'US';
              var DIAL = { US: '1', CA: '1', AU: '61', NZ: '64' };
              var dial = DIAL[country] || '1';
              var local = String(payload.phone || '').replace(/\D/g, '');
              if (country === 'US' || country === 'CA') {
                if (local.length === 11 && local.charAt(0) === '1') local = local.slice(1);
              } else {
                local = local.replace(/^0+/, ''); // AU/NZ : retire le 0 de préfixe national
              }
              if (local) {
                var e164 = '+' + dial + local;
                var NAME = { US: 'United States', CA: 'Canada', AU: 'Australia', NZ: 'New Zealand' };
                var cname = NAME[country] || country;
                payload.phone = e164;
                payload.phone_country = country;   // code (US|CA|AU|NZ)
                payload.phone_country_name = cname; // nom lisible (Canada, Australia…)
                if (typeof payload.message === 'string') {
                  // Nom du pays en clair : +1 est partagé US/Canada, le numéro seul ne suffit pas.
                  payload.message = payload.message.replace(/Phone:[^\n]*/, 'Phone: ' + e164 + ' (' + cname + ')');
                }
              }
            } catch (e2) {}
            var newInit = {};
            for (var k in init) newInit[k] = init[k];
            newInit.body = JSON.stringify(payload);
            return _fetch(input, newInit);
          }
        }
      } catch (e) {}
      return _fetch(input, init);
    };
  }
})();

/* Melonia — load the quiz voice-input widget (defensive: no-op on pages without the 3 quiz textareas) */
(function () {
  try {
    if (window.__mlnVoiceLoaded) return;
    window.__mlnVoiceLoaded = true;
    var s = document.createElement('script');
    s.src = 'https://melonia-audio-production.up.railway.app/voice-input.js';
    s.async = true;
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {}
})();
