# 🚀 Netlify Deployment - Gyorsútmutató

## 📦 Lépések

### 1️⃣ GitHub Push

```bash
git add .
git commit -m "feat: React 19 root fix, backend API, error handling"
git push origin main
```

### 2️⃣ Netlify Dashboard

1. Menj a [Netlify](https://app.netlify.com)
2. Kattints: **"Add new site"** → **"Import an existing project"**
3. Válaszd: **GitHub**
4. Keresd meg: **`HeR_WiNnEr`** repository-t
5. Kattints: **"Deploy site"**

### 3️⃣ Környezeti Változók

**Site settings** → **Environment variables** → **Add a variable**

Adj hozzá:

| Key | Value |
|-----|-------|
| `VITE_GEMINI_API_KEY` | `your_actual_gemini_api_key` |
| `GEMINI_API_KEY` | `your_actual_gemini_api_key` |

⚠️ **Fontos:** Mindkét változót állítsd be!

### 4️⃣ Redeploy

A környezeti változók hozzáadása után:
- **Deploys** tab → **Trigger deploy** → **Deploy site**

---

## ✅ Ellenőrzés

Deployment után:

1. 🌐 **Nyisd meg az URL-t** (pl. `https://your-site.netlify.app`)
2. 🔍 **F12** → **Console** → Nézd meg, van-e hiba
3. 🎯 **Teszteld a navigációt** az alsó menüben
4. 🤖 **AI Asszisztens** → Küldjél egy tesztüzenetet

---

## 🐛 Problémák?

### Üres képernyő
- ✅ **Megoldva:** React root inicializáció hozzáadva
- 🔍 Nézd meg a böngésző konzolt
- 📋 Ellenőrizd a Netlify build log-ot

### API kulcs hiba
- 🔑 Állítsd be a `VITE_GEMINI_API_KEY` változót
- 🔄 Trigger új deploy-t
- 🚫 Ne használd sima `GEMINI_API_KEY` nevet (Vite-ban kell a `VITE_` prefix!)

### Build hiba
```bash
# Helyi gépen teszteld:
npm run build
npm run preview
```

---

## 📁 Build Beállítások (már kész)

A `netlify.toml` már tartalmazza:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## 🎉 Kész!

Ha minden rendben, az app élőben elérhető lesz és használható!

**Következő lépés:** Adatbázis hozzáadása (Supabase) 🚀
