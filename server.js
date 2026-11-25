const express = require("express");
const QRCode = require("qrcode");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Oturumları bellekte tutar: sessionId -> { data: object | null, createdAt: number }
const sessions = new Map();

// 30 dakikadan eski oturumları temizle
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

// Ana sayfa: TV ekranı için yönlendirme veya doğrudan TV modu
app.get("/", (req, res) => {
  res.redirect("/tv");
});

// 1) TV EKRANI: QR kod üretir ve telefonun bilgi göndermesini bekler
app.get("/tv", async (req, res) => {
  const sessionId = crypto.randomBytes(4).toString("hex");
  sessions.set(sessionId, { data: null, createdAt: Date.now() });

  const phoneUrl = `${BASE_URL}/fill/${sessionId}`;
  const qrDataUrl = await QRCode.toDataURL(phoneUrl, { width: 280 });

  res.send(`
    <!doctype html>
    <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>TV QR Giriş Ekranı</title>
      <style>
        body {
          font-family: system-ui, sans-serif;
          background: #111827;
          color: #f9fafb;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          padding: 20px;
          text-align: center;
        }
        .box {
          background: #1f2937;
          padding: 28px;
          border-radius: 16px;
          max-width: 520px;
          width: 100%;
        }
        img {
          background: #fff;
          padding: 12px;
          border-radius: 12px;
          margin: 16px 0;
        }
        pre {
          text-align: left;
          background: #0f172a;
          padding: 16px;
          border-radius: 10px;
          white-space: pre-wrap;
          word-break: break-all;
          font-size: 16px;
        }
        .url { font-size: 13px; color: #9ca3af; word-break: break-all; }
      </style>
    </head>
    <body>
      <div class="box" id="waiting">
        <h2>Bilgileri Telefondan Girmek İçin QR Kodu Okut</h2>
        <img src="${qrDataUrl}" alt="QR Kod" />
        <p class="url">${phoneUrl}</p>
        <p>Telefon ekranından bilgileri gönderdiğinde burada görünecek...</p>
      </div>

      <div class="box" id="result" style="display:none;">
        <h2>Bilgiler Alındı</h2>
        <pre id="output"></pre>
      </div>

      <script>
        const sessionId = "${sessionId}";
        const timer = setInterval(async () => {
          try {
            const res = await fetch("/api/session/" + sessionId);
            if (!res.ok) return;
            const json = await res.json();
            if (json.data) {
              clearInterval(timer);
              document.getElementById("waiting").style.display = "none";
              document.getElementById("result").style.display = "block";
              document.getElementById("output").textContent =
                "Kullanıcı Adı / ID : " + (json.data.username || "-") + "\\n" +
                "Şifre / Kod       : " + (json.data.password || "-") + "\\n" +
                "Sunucu / URL      : " + (json.data.serverUrl || "-") + "\\n" +
                "Ek Not            : " + (json.data.extra || "-");
            }
          } catch (e) {}
        }, 1500);
      </script>
    </body>
    </html>
  `);
});

// 2) TELEFON EKRANI: QR okutulunca açılan form
app.get("/fill/:id", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).send("Oturum bulunamadı veya süresi doldu. TV ekranını yenileyin.");
  }

  res.send(`
    <!doctype html>
    <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>TV Bilgilerini Gir</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 480px; margin: 24px auto; padding: 0 16px; }
        label { display: block; margin-top: 14px; font-weight: 600; }
        input, textarea {
          width: 100%;
          box-sizing: border-box;
          padding: 10px;
          margin-top: 6px;
          font-size: 16px;
          border: 1px solid #ccc;
          border-radius: 8px;
        }
        button {
          width: 100%;
          padding: 12px;
          font-size: 17px;
          margin-top: 20px;
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <h2>TV Kullanıcı Bilgilerini Gönder</h2>
      <form method="POST" action="/fill/${req.params.id}">
        <label>Kullanıcı Adı / E-posta / ID</label>
        <input type="text" name="username" autocomplete="off" />

        <label>Şifre / PIN / Kod</label>
        <input type="text" name="password" autocomplete="off" />

        <label>Sunucu Adresi / URL (varsa)</label>
        <input type="text" name="serverUrl" autocomplete="off" />

        <label>Ek Bilgi / Not (varsa)</label>
        <textarea name="extra" rows="3"></textarea>

        <button type="submit">TV'ye Gönder</button>
      </form>
    </body>
    </html>
  `);
});

// 3) FORM GÖNDERİMİ: Telefondan gelen veriyi oturuma kaydeder
app.post("/fill/:id", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).send("Oturum süresi dolmuş.");
  }

  session.data = {
    username: (req.body.username || "").trim(),
    password: (req.body.password || "").trim(),
    serverUrl: (req.body.serverUrl || "").trim(),
    extra: (req.body.extra || "").trim()
  };

  res.send(`
    <!doctype html>
    <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Gönderildi</title>
    </head>
    <body style="font-family: sans-serif; text-align: center; padding: 40px;">
      <h2>Bilgiler TV'ye Gönderildi</h2>
      <p>TV ekranını kontrol edebilirsin.</p>
    </body>
    </html>
  `);
});

// 4) TV'NİN SORGULADIĞI UÇ NOKTA
app.get("/api/session/:id", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json({ data: session.data });
});

app.listen(PORT, () => console.log("TV QR sunucusu çalışıyor:", PORT));
