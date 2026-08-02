/* Melonia — campaign capture (script externe auto-injecté).
   Chargé via <script src="https://melonia-audio-production.up.railway.app/campaign-capture.js"></script>
   en bas du body de /pages/quiz, /pages/quiz-2 et /pages/summary.

   Rôle :
   1) À l'atterrissage depuis une pub, lit le paramètre de campagne de l'URL (?c= ou ?utm_campaign=)
      et le persiste en localStorage (mln_campaign) — il survit tout le parcours quiz -> summary.
   2) Sur la summary, injecte `campaign` dans le POST Web3Forms + une ligne "Campaign:" dans le
      message, pour que n8n attribue la demande d'extrait à la bonne campagne. Défaut = "us".

   Aucun impact sur la logique du wizard : capture passive + patch ciblé du seul appel Web3Forms. */
(function () {
  'use strict';
  var KEY = 'mln_campaign';
  // Alias connus -> valeur canonique. Toute autre valeur non vide est gardée telle quelle
  // (slugifiée) pour ne pas bloquer une future campagne sans toucher au code.
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

  // 1) Capture depuis l'URL au chargement, persiste.
  try {
    var q = new URLSearchParams(location.search);
    var c = normalize(q.get('c') || q.get('utm_campaign') || q.get('campaign'));
    if (c) { try { localStorage.setItem(KEY, c); } catch (e) {} }
  } catch (e) {}

  // 2) Injecte campaign dans le submit Web3Forms (page summary). Patch étroit de fetch.
  if (window.fetch && !window.__mlnCampaignPatched) {
    window.__mlnCampaignPatched = true;
    var _fetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        if (url.indexOf('api.web3forms.com/submit') !== -1 && init && typeof init.body === 'string') {
          var camp = readCampaign() || 'us';
          var payload = JSON.parse(init.body);
          if (payload && typeof payload === 'object') {
            payload.campaign = camp;
            if (typeof payload.message === 'string' && payload.message.indexOf('Campaign:') === -1) {
              var withLine = payload.message.replace(
                /(NEW PREVIEW REQUEST[^\n]*\n)/,
                '$1Campaign: ' + camp + '\n'
              );
              payload.message = (withLine.indexOf('Campaign:') !== -1)
                ? withLine
                : ('Campaign: ' + camp + '\n' + payload.message);
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
