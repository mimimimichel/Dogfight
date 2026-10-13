// Journal de la qualité du chat vocal (envoyé par les téléphones pendant une partie à
// plusieurs) : visible dans les journaux de Vercel, pour comprendre une voix hachée.
module.exports = (req, res) => {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 4000) req.destroy(); });
  req.on('end', () => {
    try { console.log('NETLOG ' + JSON.stringify(JSON.parse(body)).slice(0, 3000)); } catch (e) { /* ignore */ }
    res.statusCode = 204;
    res.end();
  });
};
