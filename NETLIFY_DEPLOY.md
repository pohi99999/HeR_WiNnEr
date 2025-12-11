# 🚀 Netlify Deployment - Firebase-szel

## ⚠️ FONTOS: Előbb Firebase Setup!

**Még nincs Firebase projekted?**  
👉 Kezdd itt: [FIREBASE_QUICKSTART.md](FIREBASE_QUICKSTART.md)

---

## 📦 Deployment Lépések

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

### 3️⃣ Környezeti Változók (7 darab!)

**Site settings** → **Environment variables** → **Add a variable**

**MIND a 7 változót add hozzá:**

| Key | Value | Forrás |
|-----|-------|--------|
| `VITE_GEMINI_API_KEY` | `your_gemini_api_key` | Google AI Studio |
| `VITE_FIREBASE_API_KEY` | `AIza...` | Firebase Console |
| `VITE_FIREBASE_AUTH_DOMAIN` | `project-id.firebaseapp.com` | Firebase Console |
| `VITE_FIREBASE_PROJECT_ID` | `project-id` | Firebase Console |
| `VITE_FIREBASE_STORAGE_BUCKET` | `project-id.appspot.com` | Firebase Console |
| `VITE_Firebase Authorized Domains

**Firebase Console:**
1. **Authentication** → **Settings** → **Authorized domains**
2. Kattints: **"Add domain"**
3. Add hozzá: `your-app.netlify.app` (a Netlify URL-ed)
4. **Save**

⚠️ **Nélküle a Google Sign-In nem fog működni!**

### 5️⃣ Redeploy

A környezeti változók hozzáadása után:
- **Deploys** tab → **Trigger deploy** → **Deploy site**

---

## ✅ Ellenőrzés

Deployment után:

1. 🌐 **Nyisd meg az URL-t** (pl. `https://your-site.netlify.app`)
2. 🔐 **Login oldal jelenik meg**
3. 🔍 **F12** → **Console** → Nézd meg, van-e hiba
4. 🎯 **"Bejelentkezés Google fiókkal"** gomb
5. 📧 **Válaszd ki a Gmail fiókodat**
6. ✅ **Sikeres bejelentkezés!**
7. 🤖 **Teszteld a funkciókat**

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
