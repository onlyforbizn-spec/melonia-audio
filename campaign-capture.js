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

  // ⭐ 09/09/2026 — Reconnaissance d'un numéro AUSTRALIEN saisi alors que le sélecteur de pays
  //    est resté sur son défaut US. Mesuré sur 40 générations du 09/09 : 9 leads australiens,
  //    dont 7 avec un numéro cassé (« +10449638646 », « +161429322645 ») — injoignables, et le
  //    mauvais numéro partait aussi dans Klaviyo.
  //    Les 4 motifs ci-dessous sont IMPOSSIBLES en numérotation nord-américaine (NANP) :
  //      · 10 chiffres commençant par 04  -> aucun indicatif régional NANP ne commence par 0
  //      · 11 chiffres commençant par 61  -> un US/CA à 11 chiffres commence par le 1 du pays
  //                                          (un vrai 617…/619… fait 10 chiffres, pas 11)
  //      · 12 chiffres commençant par 161 -> aucun numéro NANP ne fait 12 chiffres
  //      ·  9 chiffres commençant par 4   -> AU sans son 0 ; un US à 9 chiffres est de toute
  //                                          façon incomplet, donc rien de valide n'est dégradé
  //    C'est la seule raison pour laquelle on peut se permettre de ne pas croire le sélecteur.
  function mlnLooksAU(digits) {
    var d = String(digits || '');
    return (d.length === 10 && d.slice(0, 2) === '04')
        || (d.length === 11 && d.slice(0, 2) === '61')
        || (d.length === 12 && d.slice(0, 3) === '161')
        || (d.length === 9  && d.charAt(0) === '4');
  }
  // Exposé : le bloc « sélecteur de pays » plus bas est une AUTRE closure et doit appliquer
  // exactement le même critère. Deux copies du test finiraient par diverger.
  try { window.__mlnLooksAU = mlnLooksAU; } catch (e) {}

  // ⭐ 10/09/2026 — UNE SEULE normalisation du telephone, partagee par le submit et par la
  //    validation. Elle etait ecrite en clair dans le patch fetch ; deux copies auraient
  //    diverge, exactement comme le critere mlnLooksAU l'aurait fait sans la ligne ci-dessus.
  //    Rend {country, dial, local, e164} : `local` = numero NATIONAL, sans 0 ni indicatif.
  function mlnPhoneParts(raw, selValue) {
    var DIAL = { US: '1', CA: '1', AU: '61', NZ: '64' };
    var country = selValue || 'US';
    var local = String(raw || '').replace(/\D/g, '');
    // Bascule AU seulement si le client est reste sur le defaut US (ou CA, meme indicatif) :
    // un choix EXPLICITE de AU ou NZ est respecte tel quel, et les numeros US/CA valides ne
    // matchent aucun des 4 motifs -> jamais touches.
    var switched = false;
    if ((country === 'US' || country === 'CA') && mlnLooksAU(local)) { country = 'AU'; switched = true; }
    var dial = DIAL[country] || '1';
    if (country === 'US' || country === 'CA') {
      if (local.length === 11 && local.charAt(0) === '1') local = local.slice(1);
    } else {
      local = local.replace(/^0+/, '');            // AU/NZ : retire le 0 de prefixe national
      // Indicatif deja tape par le client (61…/161…, 64…/164…) : on ne le double pas.
      if (dial === '61') local = local.replace(/^1?61/, '');
      if (dial === '64') local = local.replace(/^1?64/, '');
    }
    return {
      country: country, dial: dial, local: local, switched: switched,
      e164: local ? ('+' + dial + local) : ''
    };
  }

  // ⭐ 10/09/2026 — LONGUEUR du numero, par pays. Pourquoi ce garde-fou existe :
  //    du 09 au 10/09, 17 leads australiens sur 64 (27 %) n'ont JAMAIS recu leur SMS d'extrait.
  //    ClickSend les rejetait en `INVALID_RECIPIENT` — un statut PAR MESSAGE, renvoye dans un
  //    HTTP 200, donc invisible cote n8n. Cause : un chiffre de trop (« +614023938545 » :
  //    10 chiffres apres le 61 la ou un numero australien en fait 9). Rien ne l'arretait :
  //    `isValidPhone` de /pages/summary exige AU MOINS 10 chiffres et n'a aucune borne haute,
  //    et le format national n'a rien a voir d'un pays a l'autre.
  //    On bloque le submit plutot que d'envoyer : un numero faux d'un chiffre est le numero de
  //    QUELQU'UN D'AUTRE, on ne « repare » jamais en devinant le chiffre a retirer.
  function mlnPhoneProblem(parts) {
    var d = (parts && parts.local) || '';
    var n = d.length;
    if (!n) return null;                            // champ vide : la page a deja son message
    var US = 'Please double-check your phone number: a US number has 10 digits, like (555) 123-4567.';
    if (parts.country === 'AU') {
      // Mobiles en 4, fixes en 2/3/7/8. Toujours 9 chiffres une fois le 0 national retire.
      if (n !== 9 || '23478'.indexOf(d.charAt(0)) === -1)
        return 'Please double-check your Australian number: it should be 10 digits, like 0412 345 678.';
    } else if (parts.country === 'NZ') {
      if (n < 7 || n > 10) return 'Please double-check your New Zealand number, like 021 234 5678.';
    } else {
      if (n !== 10) return US;
      // ⭐ 10/09/2026 — La LONGUEUR ne suffit pas. Vu le meme jour : « 1602316091 » (10 chiffres,
      //    donc accepte) part en +11602316091 et Klaviyo le refuse -> profil sans telephone, client
      //    perdu en silence. En numerotation nord-americaine, l'indicatif regional ET le prefixe
      //    d'abonne commencent par 2 a 9 (format NXX-NXX-XXXX) : un 0 ou un 1 en 1re ou 4e position
      //    est impossible, c'est toujours un chiffre en trop ou un 1 de pays mal place.
      if ('01'.indexOf(d.charAt(0)) !== -1 || '01'.indexOf(d.charAt(3)) !== -1) return US;
    }
    return null;
  }
  try {
    window.__mlnPhoneParts = mlnPhoneParts;
    window.__mlnPhoneProblem = mlnPhoneProblem;
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
              var parts = mlnPhoneParts(payload.phone, sel && sel.value);
              // Le selecteur suit la bascule, pour que le client voie le pays reellement utilise.
              if (parts.switched) { try { if (sel) sel.value = parts.country; } catch (e3) {} }
              if (parts.local) {
                var NAME = { US: 'United States', CA: 'Canada', AU: 'Australia', NZ: 'New Zealand' };
                var cname = NAME[parts.country] || parts.country;
                payload.phone = parts.e164;
                payload.phone_country = parts.country;   // code (US|CA|AU|NZ)
                payload.phone_country_name = cname;      // nom lisible (Canada, Australia…)
                if (typeof payload.message === 'string') {
                  // Nom du pays en clair : +1 est partagé US/Canada, le numéro seul ne suffit pas.
                  payload.message = payload.message.replace(/Phone:[^\n]*/, 'Phone: ' + parts.e164 + ' (' + cname + ')');
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

/* Melonia — sélecteur de pays de /pages/summary : le bon pays est posé AVANT que le client tape.
   Le problème n'était pas le format du numéro, c'était l'abandon : un Australien qui voit « 🇺🇸 +1 »
   à côté du champ ne devine pas qu'il peut en changer — il laisse le champ vide et on perd le
   numéro, parfois la demande. Deux couches, dans cet ordre :
     1. AU CHARGEMENT — pays déduit du FUSEAU HORAIRE du navigateur. Instantané, aucune requête
        réseau (donc rien à rate-limiter, contrairement au geo-IP retiré le 01/09), disponible
        partout, et `Australia/*` est sans ambiguïté. Le placeholder suit, pour que le client
        reconnaisse le format qu'on attend de lui.
     2. À LA SAISIE — filet pour le cas où le fuseau ment (VPN, appareil mal réglé) : un numéro
        de forme australienne rebascule le sélecteur.
   Le submit refait la détection de toute façon (mlnLooksAU), donc ces deux couches servent
   uniquement à ce que le client VOIE le bon pays. On ne repasse jamais un sélecteur sur US :
   seul le client peut annuler son propre choix. */
(function () {
  try {
    if ((location.pathname || '').toLowerCase().indexOf('summary') === -1) return;

    var CA_TZ = {
      'America/Toronto': 1, 'America/Montreal': 1, 'America/Vancouver': 1, 'America/Edmonton': 1,
      'America/Winnipeg': 1, 'America/Halifax': 1, 'America/St_Johns': 1, 'America/Regina': 1,
      'America/Moncton': 1, 'America/Whitehorse': 1, 'America/Yellowknife': 1, 'America/Iqaluit': 1,
      'America/Dawson_Creek': 1, 'America/Glace_Bay': 1, 'America/Goose_Bay': 1, 'America/Dawson': 1,
      'America/Blanc-Sablon': 1, 'America/Rankin_Inlet': 1, 'America/Resolute': 1, 'America/Creston': 1,
      'America/Atikokan': 1, 'America/Fort_Nelson': 1, 'America/Inuvik': 1, 'America/Nipigon': 1,
      'America/Pangnirtung': 1, 'America/Rainy_River': 1, 'America/Swift_Current': 1,
      'America/Thunder_Bay': 1, 'America/Cambridge_Bay': 1
    };
    function guessCountry() {
      var tz = '';
      try { tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || ''; } catch (e) { return null; }
      if (!tz) return null;
      if (tz.indexOf('Australia/') === 0) return 'AU';
      if (tz === 'Pacific/Auckland' || tz === 'Pacific/Chatham') return 'NZ';
      if (CA_TZ[tz]) return 'CA';
      return null;
    }
    var PH = { AU: '0412 345 678', NZ: '021 234 5678' };

    // `code` peut valoir 'US' : c'est la marche arriere du filet de saisie, et elle n'annule
    // qu'une bascule automatique (l'appelant verifie __mlnUserPicked avant d'appeler).
    function setCountry(sel, inp, code) {
      if (!sel || sel.value === code) return;
      var ok = false;
      for (var k = 0; k < sel.options.length; k++) if (sel.options[k].value === code) ok = true;
      if (!ok) return;                       // la page ne propose pas ce pays : on ne force rien
      sel.value = code;
      // Le 'change' qu'on dispatche ici passait pour un choix du client (il arme __mlnUserPicked)
      // et gelait la presélection. On le marque le temps du dispatch, qui est synchrone.
      sel.__mlnAuto = true;
      try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
      sel.__mlnAuto = false;
      sel.__mlnAutoSet = code;               // ce pays vient de nous
      if (inp && PH[code] && !inp.value) inp.setAttribute('placeholder', PH[code]);
    }

    var run = function () {
      var inp = document.getElementById('mlnCpPhone');
      var sel = document.getElementById('mlnCpCountry');
      if (!inp || !sel) return;

      // 1) Présélection au chargement, tant que le client n'a rien choisi lui-même.
      if (!sel.__mlnUserPicked && (sel.value === 'US' || !sel.value)) {
        var g = guessCountry();
        if (g) setCountry(sel, inp, g);
      }
      // Dès que le client touche le sélecteur, on ne le contredit plus jamais.
      if (!sel.__mlnBound) {
        sel.__mlnBound = true;
        sel.addEventListener('change', function () { if (!sel.__mlnAuto) sel.__mlnUserPicked = true; });
      }

      // 2) Filet à la saisie : un numéro de forme australienne rebascule le sélecteur.
      //    🔴 10/09/2026 — CE FILET RENVOYAIT DES AMERICAINS EN AUSTRALIE. Il utilisait les 4
      //    motifs de mlnLooksAU, dont « 9 chiffres commencant par 4 ». Or un numero americain
      //    d'indicatif 4xx (402 Nebraska, 415 San Francisco, 478 Georgia, 440 Ohio…) PASSE PAR
      //    CET ETAT en cours de frappe, au 9e chiffre. Le selecteur basculait sur AU, le 10e
      //    chiffre arrivait, et comme on ne revenait jamais en arriere le numero partait en
      //    « +61 » + 10 chiffres : injoignable partout (17 leads sur 64 du 09 au 10/09), et
      //    faux jusque dans Klaviyo. Deux regles depuis :
      //      · a la SAISIE, seuls les motifs NON AMBIGUS basculent (jamais le 9 chiffres :
      //        un numero en cours de frappe est incomplet par nature) ;
      //      · une bascule qu'on a faite NOUS-MEMES est reversible tant que le client n'a pas
      //        choisi son pays : le 10e chiffre doit pouvoir ramener le drapeau americain.
      //    Le submit, lui, garde les 4 motifs : la, le numero est fini.
      function looksAUTyping(x) {
        x = String(x || '');
        return (x.length === 10 && x.slice(0, 2) === '04')
            || (x.length === 11 && x.slice(0, 2) === '61')
            || (x.length === 12 && x.slice(0, 3) === '161');
      }
      if (!inp.__mlnAuBound) {
        inp.__mlnAuBound = true;
        inp.addEventListener('input', function () {
          try {
            if (sel.__mlnUserPicked) return;          // choix du client : on ne le contredit jamais
            var d = String(inp.value || '').replace(/\D/g, '');
            if (looksAUTyping(d)) { setCountry(sel, inp, 'AU'); return; }
            // Plus de motif australien, et c'est nous qui avions pose le pays -> on defait.
            if (sel.__mlnAutoSet === 'AU' && d.length) setCountry(sel, inp, guessCountry() || 'US');
          } catch (e) {}
        });
      }

      // 3) ⭐ 10/09/2026 — GARDE-FOU DE LONGUEUR (voir mlnPhoneProblem plus haut). Un numero
      //    d'un chiffre de trop passait le submit sans rien casser de visible, puis mourait
      //    en `INVALID_RECIPIENT` chez ClickSend : 27 % des leads australiens du premier jour.
      //    On bloque EN CAPTURE sur `document`, jamais sur le formulaire : sur l'element cible
      //    la phase ne departage pas les listeners, c'est l'ordre d'enregistrement qui gagne,
      //    et le script inline de la page s'enregistre avant ce fichier externe.
      //    Rien ne bloque si le bloc du dessus n'a pas tourne : sans __mlnPhoneParts, on laisse
      //    passer. Un garde-fou muet vaut mieux qu'un funnel ferme.
      var mlnErrBox = function () { return document.getElementById('mlnCpErr'); };
      var mlnLastMsg = null;
      var mlnPhoneMsg = function (el, s2) {
        if (typeof window.__mlnPhoneParts !== 'function' || typeof window.__mlnPhoneProblem !== 'function') return null;
        var raw = String(el.value || '').replace(/\D/g, '');
        // Cas AMBIGU : 9 chiffres commencant par 4, c'est A LA FOIS un mobile australien prive
        // de son 0 et un numero americain ampute d'un chiffre. Le motif tranche pour AU depuis
        // le 09/09 — on ne le suit que si le client n'a pas choisi son pays lui-meme ET que le
        // fuseau dit l'Australie. Sinon on renvoie corriger : un numero faux d'un chiffre est
        // le numero de QUELQU'UN D'AUTRE, et l'envoyer coute plus cher que de le perdre.
        if (raw.length === 9 && raw.charAt(0) === '4'
            && !(s2 && s2.__mlnUserPicked && (s2.value === 'AU' || s2.value === 'NZ'))
            && guessCountry() !== 'AU') {
          return 'Please double-check your phone number: a US number has 10 digits, like (555) 123-4567.';
        }
        return window.__mlnPhoneProblem(window.__mlnPhoneParts(el.value, s2 && s2.value));
      };
      var mlnShowMsg = function (msg) {
        var box = mlnErrBox();
        if (!box) return;
        if (msg) { box.textContent = msg; box.classList.add('show'); mlnLastMsg = msg; }
        // On n'efface QUE notre propre message : celui de l'email appartient a la page.
        else if (mlnLastMsg && box.textContent === mlnLastMsg) { box.classList.remove('show'); mlnLastMsg = null; }
      };
      if (!window.__mlnPhoneGuard) {
        window.__mlnPhoneGuard = true;
        document.addEventListener('submit', function (ev) {
          try {
            var t = ev.target;
            if (!t || t.id !== 'mlnCpForm') return;
            var i2 = document.getElementById('mlnCpPhone');
            var s3 = document.getElementById('mlnCpCountry');
            if (!i2 || !i2.value) return;          // champ vide : la page a deja son message
            var msg = mlnPhoneMsg(i2, s3);
            if (!msg) return;
            ev.preventDefault();
            ev.stopImmediatePropagation();
            mlnShowMsg(msg);
            try { i2.focus(); } catch (e7) {}
          } catch (e8) {}
        }, true);
      }
      // Le client corrige AVANT de cliquer : message a la sortie du champ, efface des que c'est bon.
      if (!inp.__mlnLenBound) {
        inp.__mlnLenBound = true;
        inp.addEventListener('blur', function () { try { if (inp.value) mlnShowMsg(mlnPhoneMsg(inp, sel)); } catch (e9) {} });
        inp.addEventListener('input', function () { try { if (!mlnPhoneMsg(inp, sel)) mlnShowMsg(null); } catch (e10) {} });
        sel.addEventListener('change', function () { try { if (inp.value) mlnShowMsg(mlnPhoneMsg(inp, sel)); } catch (e11) {} });
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
    setTimeout(run, 1200);   // le champ est parfois rendu après coup
    setTimeout(run, 3000);
  } catch (e) {}
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
