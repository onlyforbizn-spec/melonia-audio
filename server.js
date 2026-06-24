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

async function uploadToShopify(filePath, filename) {
  const fileBuffer = fs.readFileSync(filePath);
  const size = fileBuffer.length;

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

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([fileBuffer]), filename);
  await fetch(target.url, { method: 'POST', body: form });

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
  return created.data.fileCreate.files[0]?.url || target.resourceUrl;
}

app.post('/trim', anyFile, (req, res) => {
  const file = pickFile(req);
  if (!file) return res.status(400).send('no file');
  const out = path.join(os.tmpdir(), `trim_${Date.now()}.mp3`);
  execFile('ffmpeg', ['-y', '-i', file.path, '-t', '50', '-acodec', 'copy', out], (err) => {
    fs.unlink(file.path, () => {});
    if (err) return res.status(500).send('ffmpeg error: ' + err.message);
    res.sendFile(out, () => fs.unlink(out, () => {}));
  });
});

app.post('/save_audio', anyFile, async (req, res) => {
  const file = pickFile(req);
  if (!file) return res.status(400).send('no file');
  const leadId = req.body.lead_id || 'unknown';
  try {
    const url = await uploadToShopify(file.path, `${leadId}.mp3`);
    fs.unlink(file.path, () => {});
    res.json({ lead_id: leadId, url });
  } catch (e) {
    res.status(500).send('upload error: ' + e.message);
  }
});

app.post('/save_preview', anyFile, async (req, res) => {
  const file = pickFile(req);
  if (!file) return res.status(400).send('no file');
  const leadId = req.body.lead_id || 'unknown';
  try {
    const url = await uploadToShopify(file.path, `preview_${leadId}.mp3`);
    fs.unlink(file.path, () => {});
    res.json({ lead_id: leadId, url });
  } catch (e) {
    res.status(500).send('upload error: ' + e.message);
  }
});

app.get('/', (req, res) => res.send('Melonia audio server OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on ' + PORT));
