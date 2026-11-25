const express = require("express");
const QRCode = require("qrcode");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

app.use(express.urlencoded({ extended: true }));
const transfers = new Map();

app.get("/", (req, res) => {
  res.send(`
    <!doctype html>
    <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>QR Aktarım</title>
      <style>
        body { font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 0 16px; }
        textarea { width: 100%; height: 120px; padding: 10px; font-size: 16px; }
        button { padding: 10px 18px; font-size: 16px; margin-top: 10px; }
      </style>
    </head>
    <body>
      <h2>QR Kod Aktarım</h2>
      <form method="POST" action="/create">
        <textarea name="content" required placeholder="Telefonuna göndermek istediğin metni veya linki yaz..."></textarea><br/>
        <button type="submit">QR Kod Üret</button>
      </form>
    </body>
    </html>
  `);
});

app.post("/create", async (req, res) => {
  const id = crypto.randomBytes(5).toString("hex");
  transfers.set(id, req.body.content.trim());

  const link = `${BASE_URL}/v/${id}`;
  const qr = await QRCode.toDataURL(link, { width: 260 });

  res.send(`
    <!doctype html>
    <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>QR Hazır</title>
    </head>
    <body style="font-family: sans-serif; text-align: center; padding: 30px;">
      <h2>Telefonla Okut</h2>
      <img src="${qr}" alt="QR" />
      <p><a href="${link}">${link}</a></p>
      <p><a href="/">Yeni QR oluştur</a></p>
    </body>
    </html>
  `);
});

app.get("/v/:id", (req, res) => {
  const text = transfers.get(req.params.id);
  if (!text) return res.status(404).send("Kayıt bulunamadı.");

  const safe = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  res.send(`
    <!doctype html>
    <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>İçerik</title>
    </head>
    <body style="font-family: sans-serif; padding: 24px;">
      <h3>Aktarılan İçerik</h3>
      <pre style="white-space: pre-wrap; background: #f2f2f2; padding: 14px;">${safe}</pre>
    </body>
    </html>
  `);
});

app.listen(PORT, () => console.log("Çalışıyor:", PORT));
