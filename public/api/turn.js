// Serveurs relais (TURN) pour le chat vocal et le jeu à plusieurs : quand deux téléphones
// n'arrivent pas à se parler directement (4G, box), tout passe par ce relais.
// Fournisseur au choix, réglé dans les variables d'environnement de Vercel :
//   METERED_DOMAIN + METERED_KEY   (metered.ca, offre gratuite)
//   CF_TURN_KEY_ID + CF_TURN_TOKEN (Cloudflare Realtime TURN)
//   TURN_URLS + TURN_USER + TURN_PASS (n'importe quel relais à identifiants fixes ;
//                                      TURN_URLS séparées par des virgules)
// Sans réglage : liste vide (le jeu garde ses serveurs par défaut).
module.exports = async (req, res) => {
  let iceServers = [];
  try {
    const { METERED_DOMAIN, METERED_KEY, CF_TURN_KEY_ID, CF_TURN_TOKEN, TURN_URLS, TURN_USER, TURN_PASS } = process.env;
    if (TURN_URLS && TURN_USER && TURN_PASS) {
      iceServers = [{ urls: TURN_URLS.split(',').map(u => u.trim()).filter(Boolean), username: TURN_USER, credential: TURN_PASS }];
    } else if (METERED_DOMAIN && METERED_KEY) {
      const r = await fetch(`https://${METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${encodeURIComponent(METERED_KEY)}`);
      if (r.ok) iceServers = await r.json();
    } else if (CF_TURN_KEY_ID && CF_TURN_TOKEN) {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${CF_TURN_KEY_ID}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CF_TURN_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 86400 }),
      });
      if (r.ok) iceServers = (await r.json()).iceServers || [];
    }
  } catch (e) { iceServers = []; }
  if (!Array.isArray(iceServers)) iceServers = [iceServers];
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ iceServers }));
};
