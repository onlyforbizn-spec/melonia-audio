const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
const upload = multer({ dest: os.tmpdir() });
const anyFile = upload.any();

const SHOP = process.env.SHOPIFY_SHOP;
const TOKEN = process.env.SHOPIFY_TOKEN;
const API = '2026-04';

function pickFile(req) {
  if (req.file) return req.file;
  if (req.files && req.files.length) return req.files[0];
  return null;
}

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  console.log(`>>> ${req.method} ${req.url} | content-type: ${req.headers['content-type']}`);
  next();
});

function shopifyGraphQL(body) {
  const authHeader = TOKEN && TOKEN.startsWith('atkn_')
    ? { 'Authorization': `Bearer ${TOKEN}` }
    : { 'X-Shopify-Access-Token': TOKEN };
  return fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify(body)
  }).then(r => r.json());
}

// cherche un fichier dans Shopify par son nom, renvoie son URL CDN si trouvé
async function findFileUrl(filename) {
  const isPreview = filename.startsWith('preview_');
  const isTxt = filename.endsWith('.txt');
  const base = filename.replace(/\.(mp3|txt)$/, '');
  const queries = [
    `filename:${filename}`,
    `filename:*${base}*`,
    base
  ];

  for (const queryStr of queries) {
    const q = {
      query: `query($query: String!) {
        files(first: 20, query: $query) {
          edges { node { ... on GenericFile { url } } }
        }
      }`,
      variables: { query: queryStr }
    };
    try {
      const r = await shopifyGraphQL(q);
      console.log(`FIND attempt "${queryStr}":`, JSON.stringify(r).substring(0, 500));
      if (r.errors) {
        console.log('FIND GraphQL errors:', JSON.stringify(r.errors));
        continue;
      }
      const edges = r.data && r.data.files && r.data.files.edges;
      if (edges && edges.length > 0) {
        // Cherche un match exact sur le filename dans l'URL,
        // en excluant les fichiers preview_* quand on cherche la full song.
        for (const edge of edges) {
          if (!edge.node || !edge.node.url) continue;
          const url = edge.node.url;
          if (!url.includes(filename)) continue;
          if (!isPreview && !isTxt && url.includes('preview_')) continue; // skip previews when looking for full mp3
          console.log(`FIND MATCH via "${queryStr}":`, url);
          return url;
        }
      }
    } catch (e) {
      console.log(`FIND ERROR for "${queryStr}":`, e.message);
    }
  }
  console.log(`FIND: no result for ${filename}`);
  return null;
}

async function pollFileUrl(fileId) {
  const q = {
    query: `query($id: ID!) { node(id: $id) { ... on GenericFile { url } } }`,
    variables: { id: fileId }
  };
  for (let i = 0; i < 10; i++) {
    const r = await shopifyGraphQL(q);
    const node = r.data && r.data.node;
    if (node && node.url) return node.url;
    await new Promise(res => setTimeout(res, 1500));
  }
  return null;
}

async function uploadToShopify(filePath, filename) {
  const fileBuffer = fs.readFileSync(filePath);
  const size = fileBuffer.length;

  const staged = await shopifyGraphQL({
    query: `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { message }
      }
    }`,
    variables: { input: [{ filename, mimeType: 'audio/mpeg', resource: 'FILE', httpMethod: 'POST', fileSize: String(size) }] }
  });
  const target = staged.data.stagedUploadsCreate.stagedTargets[0];

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([fileBuffer]), filename);
  await fetch(target.url, { method: 'POST', body: form });

  const created = await shopifyGraphQL({
    query: `mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) { files { id ... on GenericFile { url } } userErrors { message } }
    }`,
    variables: { files: [{ originalSource: target.resourceUrl, contentType: 'FILE' }] }
  });
  const file = created.data.fileCreate.files[0];

  let finalUrl = file && file.url;
  if (!finalUrl && file && file.id) finalUrl = await pollFileUrl(file.id);
  return finalUrl || target.resourceUrl;
}

async function uploadTextToShopify(filePath, filename) {
  const fileBuffer = fs.readFileSync(filePath);
  const size = fileBuffer.length;

  const staged = await shopifyGraphQL({
    query: `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { message }
      }
    }`,
    variables: { input: [{ filename, mimeType: 'text/plain', resource: 'FILE', httpMethod: 'POST', fileSize: String(size) }] }
  });
  const target = staged.data.stagedUploadsCreate.stagedTargets[0];

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([fileBuffer]), filename);
  await fetch(target.url, { method: 'POST', body: form });

  const created = await shopifyGraphQL({
    query: `mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) { files { id ... on GenericFile { url } } userErrors { message } }
    }`,
    variables: { files: [{ originalSource: target.resourceUrl, contentType: 'FILE' }] }
  });
  const file = created.data.fileCreate.files[0];

  let finalUrl = file && file.url;
  if (!finalUrl && file && file.id) finalUrl = await pollFileUrl(file.id);
  return finalUrl || target.resourceUrl;
}

app.post('/trim', anyFile, (req, res) => {
  const file = pickFile(req);
  console.log('TRIM: file =', file ? file.originalname + ' / ' + file.size + ' bytes' : 'NONE');
  if (!file) return res.status(400).send('no file received');
  const out = path.join(os.tmpdir(), `trim_${Date.now()}.mp3`);
  execFile('ffmpeg', ['-y', '-i', file.path, '-t', '50', '-acodec', 'copy', out], (err) => {
    fs.unlink(file.path, () => {});
    if (err) { console.log('FFMPEG ERROR:', err.message); return res.status(500).send('ffmpeg error: ' + err.message); }
    res.sendFile(out, () => fs.unlink(out, () => {}));
  });
});

// Sauvegarde des lyrics en .txt sur Shopify Files
app.post('/save_lyrics', express.json(), async (req, res) => {
  const leadId = req.body.lead_id;
  const lyrics = req.body.lyrics;
  if (!leadId || !lyrics) return res.status(400).json({ error: 'lead_id and lyrics required' });
  try {
    const tmpPath = path.join(os.tmpdir(), `${leadId}.txt`);
    fs.writeFileSync(tmpPath, lyrics, 'utf8');
    const url = await uploadTextToShopify(tmpPath, `${leadId}.txt`);
    fs.unlink(tmpPath, () => {});
    res.json({ lead_id: leadId, url });
  } catch (e) {
    console.log('SAVE_LYRICS ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// /lyrics : lit le .txt sur Shopify Files
app.get('/lyrics', async (req, res) => {
  const leadId = req.query.lead_id;
  if (!leadId) return res.status(400).json({ ready: false, error: 'no lead_id' });
  try {
    const url = await findFileUrl(`${leadId}.txt`);
    if (!url) return res.json({ ready: false });
    const r = await fetch(url);
    const text = await r.text();
    res.json({ ready: true, lyrics: text, url });
  } catch (e) {
    console.log('LYRICS ERROR:', e.message);
    res.json({ ready: false });
  }
});

app.post('/save_audio', anyFile, async (req, res) => {
  const file = pickFile(req);
  if (!file) return res.status(400).send('no file received');
  const leadId = req.body.lead_id || 'unknown';
  try {
    const url = await uploadToShopify(file.path, `${leadId}.mp3`);
    fs.unlink(file.path, () => {});
    res.json({ lead_id: leadId, url });
  } catch (e) { console.log('SAVE ERROR:', e.message); res.status(500).send('upload error: ' + e.message); }
});

app.post('/save_preview', anyFile, async (req, res) => {
  const file = pickFile(req);
  if (!file) return res.status(400).send('no file received');
  const leadId = req.body.lead_id || 'unknown';
  try {
    const url = await uploadToShopify(file.path, `preview_${leadId}.mp3`);
    fs.unlink(file.path, () => {});
    res.json({ lead_id: leadId, url });
  } catch (e) { console.log('SAVE ERROR:', e.message); res.status(500).send('upload error: ' + e.message); }
});

// /ready : demande à Shopify si la preview du lead existe, renvoie son URL durable
app.get('/ready', async (req, res) => {
  const leadId = req.query.lead_id;
  if (!leadId) return res.status(400).json({ ready: false, error: 'no lead_id' });
  try {
    const url = await findFileUrl(`preview_${leadId}.mp3`);
    if (url) return res.json({ ready: true, url });
    res.json({ ready: false });
  } catch (e) {
    console.log('READY ERROR:', e.message);
    res.json({ ready: false });
  }
});

// /full : pareil mais pour la chanson complète (après achat)
app.get('/full', async (req, res) => {
  const leadId = req.query.lead_id;
  if (!leadId) return res.status(400).json({ ready: false, error: 'no lead_id' });
  try {
    const url = await findFileUrl(`${leadId}.mp3`);
    if (url) return res.json({ ready: true, url });
    res.json({ ready: false });
  } catch (e) {
    console.log('FULL ERROR:', e.message);
    res.json({ ready: false });
  }
});

app.get('/', (req, res) => res.send('Melonia audio server OK'));

app.use((err, req, res, next) => {
  console.log('GLOBAL ERROR:', err.message);
  res.status(400).send('error: ' + err.message);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on ' + PORT));
