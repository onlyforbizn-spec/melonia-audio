/* Melonia — campaign capture (script externe auto-injecté).
   Chargé via <script src="https://melonia-audio-production.up.railway.app/campaign-capture.js"></script>
   en bas du body des pages d'atterrissage quiz (ex. /pages/quiz, /pages/quiz-big4) ET de /pages/summary.

   Principe (100 % fiable, aucune dépendance à un paramètre d'URL mutable) :
   La campagne est déterminée par LA PAGE D'ENTRÉE que le client franchit — ce que tu contrôles à
   100 % via le lien de la pub. Une page dont l'URL contient "big4" => campagne "big4" ; toute autre
   page quiz => "us" (défaut). Un ?c= dans l'URL reste accepté comme override explicite si besoin.

   Rôle :
   1) Sur une page d'atterrissage quiz : (ré)initialise localStorage.mln_campaign selon la page.
      Réinitialiser à chaque entrée écrase tout tag périmé d'un parcours précédent -> jamais de fuite.
   2) Sur /pages/summary : injecte `campaign` dans le POST Web3Forms + une ligne "Campaign:" dans le
      message, pour que n8n attribue la demande d'extrait à la bonne campagne. Défaut = "us".

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
  function normalize(raw) {
    var s = slug(raw);
    if (!s) return '';
    return ALIAS[s] || s;
  }
  function readCampaign() {
    try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }
  // Détecte la campagne depuis le nom de la page d'atterrissage. Renvoie null si ce n'est PAS
  // une page quiz (ex. summary) -> on ne touche pas au tag, on se contente de le lire.
  function landingCampaign() {
    var p = '';
    try { p = (location.pathname || '').toLowerCase(); } catch (e) { return null; }
    if (p.indexOf('quiz') === -1) return null;          // pas une page d'atterrissage
    if (/big-?4|bigfour/.test(p)) return 'big4';        // page Big Four dédiée
    return 'us';                                        // page quiz standard -> défaut US
  }

  // 1) Sur une page d'atterrissage : (ré)initialise le tag. Un ?c= explicite prime.
  try {
    var landing = landingCampaign();
    if (landing !== null) {
      var q = new URLSearchParams(location.search);
      var override = normalize(q.get('c') || q.get('utm_campaign') || q.get('campaign'));
      var camp = override || landing;
      try { localStorage.setItem(KEY, camp); } catch (e) {}
    }
  } catch (e) {}

  // 2) Injecte campaign dans le submit Web3Forms — UNIQUEMENT sur la page summary.
  // Ailleurs (produits, panier, etc.) le script ne touche à rien : fetch n'est jamais patché.
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
