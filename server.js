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
  return fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify(body)
  }).then(r => r.json());
}

// cherche un fichier dans Shopify par son nom, renvoie son URL CDN si trouvé
async function findFileUrl(filename) {
  const q = {
    query: `query($query: String!) {
      files(first: 1, query: $query) {
        edges { node { ... on GenericFile { url } } }
      }
    }`,
    variables: { query: `filename:${filename}` }
  };
  try {
    const r = await shopifyGraphQL(q);
    const edge = r.data && r.data.files && r.data.files.edges[0];
    return edge && edge.node && edge.node.url ? edge.node.url : null;
  } catch (e) {
    console.log('FIND ERROR:', e.message);
    return null;
  }
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
