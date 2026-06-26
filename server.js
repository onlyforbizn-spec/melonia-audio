const express = require('express');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
const upload = multer({ dest: os.tmpdir() });
const anyFile = upload.any();
app.use(express.json({ limit: '10mb' }));

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
  const baseName = filename.replace(/\.[^.]+$/, '');
  const queries = [
    `filename:${filename}`,
    `filename:*${baseName}*`,
    baseName
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
        for (const edge of edges) {
          if (!edge.node || !edge.node.url) continue;
          const url = edge.node.url;
          if (!url.includes(filename)) continue;
          if (!isPreview && url.includes('preview_')) continue;
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

async function uploadToShopify(filePath, filename, mimeType) {
  const fileBuffer = fs.readFileSync(filePath);
  const size = fileBuffer.length;
  const mt = mimeType || 'application/octet-stream';

  const staged = await shopifyGraphQL({
    query: `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { message }
      }
    }`,
    variables: { input: [{ filename, mimeType: mt, resource: 'FILE', httpMethod: 'POST', fileSize: String(size) }] }
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

// =========== Génération PDF des lyrics ===========
function generateLyricsPDF(outPath, recipientName, lyrics) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 72, bottom: 72, left: 72, right: 72 }
    });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const CREAM = '#F4EEE5';
    const PLUM = '#3D1A33';
    const pageW = doc.page.width;
    const pageH = doc.page.height;

    // Fond crème + repeint sur chaque nouvelle page
    const paintBackground = () => {
      doc.save();
      doc.rect(0, 0, pageW, pageH).fill(CREAM);
      doc.restore();
      doc.fillColor(PLUM);
    };
    paintBackground();
    doc.on('pageAdded', paintBackground);

    // Header "Melonia"
    doc.font('Times-Bold').fontSize(36).fillColor(PLUM)
      .text('Melonia', { align: 'center' });
    doc.moveDown(0.3);

    // Filet décoratif
    const lineY = doc.y;
    doc.moveTo(pageW / 2 - 30, lineY).lineTo(pageW / 2 + 30, lineY)
      .lineWidth(0.7).strokeColor(PLUM).stroke();
    doc.moveDown(1.2);

    // Subtitle "A Song for X"
    doc.font('Times-Italic').fontSize(20).fillColor(PLUM)
      .text(`A Song for ${recipientName}`, { align: 'center' });
    doc.moveDown(2);

    // Lyrics : strophes séparées par lignes vides
    doc.font('Times-Roman').fontSize(12).fillColor(PLUM);
    const stanzas = String(lyrics).split(/\n\s*\n/);
    stanzas.forEach((stanza, i) => {
      const text = stanza.trim();
      if (!text) return;
      doc.text(text, { align: 'center', lineGap: 4 });
      if (i < stanzas.length - 1) doc.moveDown(1);
    });

    // Footer
    doc.moveDown(2.5);
    doc.font('Times-Italic').fontSize(9).fillColor(PLUM)
      .text('Created with love by the Melonia team — melonia-song.com', {
        align: 'center'
      });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// =========== Endpoints ===========

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
    const url = await uploadToShopify(file.path, `${leadId}.mp3`, 'audio/mpeg');
    fs.unlink(file.path, () => {});
    res.json({ lead_id: leadId, url });
  } catch (e) { console.log('SAVE ERROR:', e.message); res.status(500).send('upload error: ' + e.message); }
});

app.post('/save_preview', anyFile, async (req, res) => {
  const file = pickFile(req);
  if (!file) return res.status(400).send('no file received');
  const leadId = req.body.lead_id || 'unknown';
  try {
    const url = await uploadToShopify(file.path, `preview_${leadId}.mp3`, 'audio/mpeg');
    fs.unlink(file.path, () => {});
    res.json({ lead_id: leadId, url });
  } catch (e) { console.log('SAVE ERROR:', e.message); res.status(500).send('upload error: ' + e.message); }
});

app.post('/save_lyrics', async (req, res) => {
  const { lead_id, lyrics } = req.body || {};
  if (!lead_id || !lyrics) return res.status(400).json({ error: 'lead_id and lyrics required' });
  const tmp = path.join(os.tmpdir(), `${lead_id}_${Date.now()}.txt`);
  try {
    fs.writeFileSync(tmp, String(lyrics), 'utf8');
    const url = await uploadToShopify(tmp, `${lead_id}.txt`, 'text/plain');
    fs.unlink(tmp, () => {});
    res.json({ lead_id, url });
  } catch (e) { console.log('SAVE LYRICS ERROR:', e.message); res.status(500).send('upload error: ' + e.message); }
});

app.post('/save_pdf', async (req, res) => {
  const { lead_id, recipient_name, lyrics } = req.body || {};
  if (!lead_id || !recipient_name || !lyrics) {
    return res.status(400).json({ error: 'lead_id, recipient_name and lyrics required' });
  }
  const tmp = path.join(os.tmpdir(), `${lead_id}_${Date.now()}.pdf`);
  try {
    await generateLyricsPDF(tmp, recipient_name, lyrics);
    const url = await uploadToShopify(tmp, `${lead_id}.pdf`, 'application/pdf');
    fs.unlink(tmp, () => {});
    res.json({ lead_id, url });
  } catch (e) {
    console.log('SAVE PDF ERROR:', e.message);
    res.status(500).send('pdf error: ' + e.message);
  }
});

app.get('/ready', async (req, res) => {
  const leadId = req.query.lead_id;
  if (!leadId) return res.status(400).json({ ready: false, error: 'no lead_id' });
  try {
    const url = await findFileUrl(`preview_${leadId}.mp3`);
    if (url) return res.json({ ready: true, url });
    res.json({ ready: false });
  } catch (e) { console.log('READY ERROR:', e.message); res.json({ ready: false }); }
});

app.get('/full', async (req, res) => {
  const leadId = req.query.lead_id;
  if (!leadId) return res.status(400).json({ ready: false, error: 'no lead_id' });
  try {
    const url = await findFileUrl(`${leadId}.mp3`);
    if (url) return res.json({ ready: true, url });
    res.json({ ready: false });
  } catch (e) { console.log('FULL ERROR:', e.message); res.json({ ready: false }); }
});

app.get('/lyrics', async (req, res) => {
  const leadId = req.query.lead_id;
  if (!leadId) return res.status(400).json({ ready: false, error: 'no lead_id' });
  try {
    const url = await findFileUrl(`${leadId}.txt`);
    if (url) return res.json({ ready: true, url });
    res.json({ ready: false });
  } catch (e) { console.log('LYRICS ERROR:', e.message); res.json({ ready: false }); }
});

app.get('/pdf', async (req, res) => {
  const leadId = req.query.lead_id;
  if (!leadId) return res.status(400).json({ ready: false, error: 'no lead_id' });
  try {
    const url = await findFileUrl(`${leadId}.pdf`);
    if (url) return res.json({ ready: true, url });
    res.json({ ready: false });
  } catch (e) { console.log('PDF ERROR:', e.message); res.json({ ready: false }); }
});

app.get('/', (req, res) => res.send('Melonia audio server OK'));

app.use((err, req, res, next) => {
  console.log('GLOBAL ERROR:', err.message);
  res.status(400).send('error: ' + err.message);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on ' + PORT));
