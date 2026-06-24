const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
const upload = multer({ dest: os.tmpdir() });

const SHOP = process.env.SHOPIFY_SHOP;
const TOKEN = process.env.SHOPIFY_TOKEN;
const API = '2026-04';

// Upload un fichier local vers Shopify Files, renvoie l'URL publique
async function uploadToShopify(filePath, filename) {
  const fileBuffer = fs.readFileSync(filePath);
  const size = fileBuffer.length;

  // 1) staged upload
  const stagedQuery = {
    query: `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { message }
      }
    }`,
    variables: { input: [{ filename, mimeType: 'audio/mpeg', resource: 'FILE', httpMethod: 'POST', fileSize: String(size) }] }
  };
  const stagedRes = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify(stagedQuery)
  });
  const staged = await stagedRes.json();
  const target = staged.data.stagedUploadsCreate.stagedTargets[0];

  // 2) upload du fichier vers le target
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([fileBuffer]), filename);
  await fetch(target.url, { method: 'POST', body: form });

  // 3) fileCreate
  const fileCreate = {
    query: `mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) { files { ... on GenericFile { url } } userErrors { message } }
    }`,
    variables: { files: [{ originalSource: target.resourceUrl, contentType: 'FILE' }] }
  };
  const createRes = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify(fileCreate)
  });
  const created = await createRes.json();

  // l'URL n'est pas toujours immédiate, on interroge le resourceUrl
  return created.data.fileCreate.files[0]?.url || target.resourceUrl;
}

// /trim : reçoit un MP3, renvoie les 50 premières secondes
app.post('/trim', upload.single('data'), (req, res) => {
  if (!req.file) return res.status(400).send('no file');
  const out = path.join(os.tmpdir(), `trim_${Date.now()}.mp3`);
  execFile('ffmpeg', ['-y', '-i', req.file.path, '-t', '50', '-acodec', 'copy', out], (err) => {
    fs.unlink(req.file.path, () => {});
    if (err) return res.status(500).send('ffmpeg error: ' + err.message);
    res.sendFile(out, () => fs.unlink(out, () => {}));
  });
});

// /save_audio : reçoit un MP3 + lead_id, l'upload dans Shopify, renvoie l'URL
app.post('/save_audio', upload.single('data'), async (req, res) => {
  if (!req.file) return res.status(400).send('no file');
  const leadId = req.body.lead_id || 'unknown';
  try {
    const url = await uploadToShopify(req.file.path, `${leadId}.mp3`);
    fs.unlink(req.file.path, () => {});
    res.json({ lead_id: leadId, url });
  } catch (e) {
    res.status(500).send('upload error: ' + e.message);
  }
});

// /save_preview : pareil mais pour l'extrait (préfixe preview_)
app.post('/save_preview', upload.single('data'), async (req, res) => {
  if (!req.file) return res.status(400).send('no file');
  const leadId = req.body.lead_id || 'unknown';
  try {
    const url = await uploadToShopify(req.file.path, `preview_${leadId}.mp3`);
    fs.unlink(req.file.path, () => {});
    res.json({ lead_id: leadId, url });
  } catch (e) {
    res.status(500).send('upload error: ' + e.message);
  }
});

app.get('/', (req, res) => res.send('Melonia audio server OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on ' + PORT));
