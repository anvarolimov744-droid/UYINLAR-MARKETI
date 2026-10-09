
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const COVER_DIR = path.join(UPLOAD_DIR, "covers");
const GAME_DIR = path.join(UPLOAD_DIR, "games");
const DB_FILE = path.join(DATA_DIR, "games.json");

for (const dir of [DATA_DIR, COVER_DIR, GAME_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, "[]", "utf8");
}

function readGames() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeGames(games) {
  const temp = DB_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(games, null, 2), "utf8");
  fs.renameSync(temp, DB_FILE);
}

app.disable("x-powered-by");
app.use(express.json({ limit: "30kb" }));
app.use(express.static(ROOT, {
  index: "index.html",
  dotfiles: "ignore"
}));

// Muqova rasmlari alohida katalogda saqlanadi.
app.use("/covers", express.static(COVER_DIR, {
  dotfiles: "deny",
  index: false
}));

const imageExtensions = new Set([
  ".jpg", ".jpeg", ".png", ".webp"
]);

const gameExtensions = new Set([
  ".zip", ".apk", ".html"
]);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    if (file.fieldname === "cover") {
      return cb(null, COVER_DIR);
    }

    if (file.fieldname === "gameFile") {
      return cb(null, GAME_DIR);
    }

    cb(new Error("Noma'lum fayl turi."));
  },

  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomUUID() + ext);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 2,
    fields: 10
  },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();

    if (file.fieldname === "cover" && imageExtensions.has(ext)) {
      return cb(null, true);
    }

    if (file.fieldname === "gameFile" && gameExtensions.has(ext)) {
      return cb(null, true);
    }

    cb(new Error(
      "Rasm uchun JPG, PNG yoki WEBP; o'yin uchun ZIP, APK yoki HTML."
    ));
  }
});

function validHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function removeUploadedFiles(files) {
  for (const list of Object.values(files || {})) {
    for (const file of list) {
      try {
        fs.unlinkSync(file.path);
      } catch {}
    }
  }
}

// Katalog
app.get("/api/games", (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const category = String(req.query.category || "").trim();
  const platform = String(req.query.platform || "").trim();

  let games = readGames();

  if (q) {
    games = games.filter(g =>
      [g.title, g.description, g.category, g.platform]
        .some(v => String(v || "").toLowerCase().includes(q))
    );
  }

  if (category && category !== "Barchasi") {
    games = games.filter(g => g.category === category);
  }

  if (platform && platform !== "Barchasi") {
    games = games.filter(g => g.platform === platform);
  }

  games.sort((a, b) => b.createdAt - a.createdAt);
  res.json(games);
});

// Bitta o'yin
app.get("/api/games/:id", (req, res) => {
  const game = readGames().find(g => g.id === req.params.id);

  if (!game) {
    return res.status(404).json({ error: "O'yin topilmadi." });
  }

  res.json(game);
});

// Yangi o'yin qo'shish
app.post(
  "/api/games",
  upload.fields([
    { name: "cover", maxCount: 1 },
    { name: "gameFile", maxCount: 1 }
  ]),
  (req, res) => {
    const files = req.files || {};

    try {
      const title = String(req.body.title || "").trim();
      const description = String(req.body.description || "").trim();
      const category = String(req.body.category || "").trim();
      const platform = String(req.body.platform || "").trim();
      const url = String(req.body.url || "").trim();

      const categories = [
        "Ekshen", "Poyga", "Sarguzasht",
        "Strategiya", "Sport", "Boshqotirma", "Boshqa"
      ];

      const platforms = ["Android", "PC", "Brauzer"];

      if (title.length < 2 || title.length > 70) {
        removeUploadedFiles(files);
        return res.status(400).json({
          error: "O'yin nomi 2–70 belgi bo'lishi kerak."
        });
      }

      if (description.length > 2000) {
        removeUploadedFiles(files);
        return res.status(400).json({
          error: "Tavsif 2000 belgidan oshmasin."
        });
      }

      if (!categories.includes(category)) {
        removeUploadedFiles(files);
        return res.status(400).json({
          error: "Kategoriyani to'g'ri tanlang."
        });
      }

      if (!platforms.includes(platform)) {
        removeUploadedFiles(files);
        return res.status(400).json({
          error: "Platformani to'g'ri tanlang."
        });
      }

      const cover = files.cover?.[0];
      const gameFile = files.gameFile?.[0];

      if (!cover && !gameFile && !url) {
        removeUploadedFiles(files);
        return res.status(400).json({
          error: "O'yin fayli yoki yuklab olish havolasini kiriting."
        });
      }

      if (url && !validHttpUrl(url)) {
        removeUploadedFiles(files);
        return res.status(400).json({
          error: "Havola http:// yoki https:// bilan boshlanishi kerak."
        });
      }

      const game = {
        id: crypto.randomUUID(),
        title,
        description,
        category,
        platform,
        cover: cover ? "/covers/" + cover.filename : "",
        fileName: gameFile ? gameFile.filename : "",
        originalFileName: gameFile
          ? path.basename(gameFile.originalname).slice(0, 180)
          : "",
        url,
        createdAt: Date.now()
      };

      const games = readGames();
      games.push(game);
      writeGames(games);

      res.status(201).json(game);
    } catch (err) {
      removeUploadedFiles(files);
      console.error(err);
      res.status(500).json({
        error: "O'yinni saqlashda xatolik yuz berdi."
      });
    }
  }
);

// Faylni xavfsiz tarzda yuklab olish
app.get("/api/games/:id/download", (req, res) => {
  const game = readGames().find(g => g.id === req.params.id);

  if (!game) {
    return res.status(404).send("O'yin topilmadi.");
  }

  if (game.fileName) {
    const filePath = path.join(GAME_DIR, game.fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Fayl topilmadi.");
    }

    return res.download(filePath, game.originalFileName || "oyin-fayli");
  }

  if (game.url && validHttpUrl(game.url)) {
    return res.redirect(game.url);
  }

  res.status(404).send("Yuklab olish manzili mavjud emas.");
});

// Yuklash xatolari
app.use((err, req, res, next) => {
  console.error(err.message);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: err.code === "LIMIT_FILE_SIZE"
        ? "Fayl hajmi 100 MB dan oshmasin."
        : "Yuklangan fayllar soni yoki hajmi cheklovdan oshdi."
    });
  }

  res.status(400).json({
    error: err.message || "So'rovni bajarib bo'lmadi."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("🎮 UYINLAR MARKETI ishga tushdi!");
  console.log(`Sayt: http://localhost:${PORT}`);
});