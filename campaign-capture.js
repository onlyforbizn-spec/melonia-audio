/* Melonia — campaign capture (script externe auto-injecté).
   Chargé via <script src="https://melonia-audio-production.up.railway.app/campaign-capture.js"></script>
   en bas du body de /pages/quiz (et quiz-big4 si créée) ET de /pages/summary.

   Attribution 100 % fiable, sans dépendre d'un param d'URL mutable :
   - La pub Big Four atterrit sur /pages/landing-page dont les boutons pointent vers
     /pages/quiz?c=big4 (lien interne codé en dur → param transmis à coup sûr).
   - Sur le quiz, ce ?c=big4 pose le tag. La pub US va sur /pages/quiz sans param → défaut "us".

   Stockage en sessionStorage (par onglet) :
   - survit à toute la navigation du parcours (landing → quiz → summary, y compris le bouton "retour"),
   - meurt à la fermeture de l'onglet → jamais de tag périmé d'une session précédente.
   Règle : un ?c= explicite prime et écrit toujours ; sinon on ne pose le défaut que si RIEN n'est
   déjà stocké (donc le "retour" vers /pages/quiz n'écrase jamais un big4 déjà posé).

   Aucun impact sur la logique du wizard : capture passive + patch ciblé du seul appel Web3Forms. */
(function () {
  'use strict';
  var KEY = 'mln_campaign';
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
