<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 🏆 HeR WiNnEr - AI-Powered Productivity App

**Verzió:** 1.0.0  
**Státusz:** ✅ Production Ready (in-memory backend)

Modern produktivitási alkalmazás Gemini AI asszisztenssel, pénzügyi követéssel, naptárral és projekt managementtel.

## 🆕 Legfrissebb Frissítések (2025.12.11)

- ✅ **Netlify üres képernyő probléma MEGOLDVA**
- ✅ **Backend API struktúra implementálva**
- ✅ **Error handling javítva**
- ✅ **Build optimalizáció kész**
- 📚 **Részletes dokumentáció hozzáadva**

➡️ **Részletek:** [FEJLESZTESEK.md](FEJLESZTESEK.md)

---

## 🚀 Gyors Start

View your app in AI Studio: https://ai.studio/apps/drive/1sIeHeLiS7TTJMgjLVZMIsey_2GhRDXdb

## ⚡ Helyi Futtatás

**Előfeltételek:**  
- Node.js v18 vagy újabb
- npm vagy yarn package manager

### 1. Telepítés

```bash
# Clone repository (ha még nem tetted)
git clone <your-repo-url>
cd HeR_WiNnEr

# Függőségek telepítése
npm install
```

### 2. Környezeti Változók

```bash
# Másold át a példa fájlt
cp .env.example .env.local

# Szerkeszd a .env.local fájlt
# VITE_GEMINI_API_KEY=your_actual_api_key_here
```

**API kulcs szerzése:**
1. Látogass el: https://aistudio.google.com/app/apikey
2. Jelentkezz be Google fiókkal
3. Kattints "Create API key" gombra
4. Másold be a kulcsot a `.env.local` fájlba

### 3. Fejlesztői Szerver

```bash
# Indítás
npm run dev

# Az app elérhető lesz:
# http://localhost:3000
```

### 4. Production Build

```bash
# Build
npm run build

# Preview
npm run preview
```

---

## 🌐 Netlify Deployment

**Részletes útmutató:** [NETLIFY_DEPLOY.md](NETLIFY_DEPLOY.md)

### Gyors Deploy

```bash
# 1. Netlify CLI telepítése
npm install -g netlify-cli

# 2. Login
netlify login

# 3. Deploy
netlify deploy --prod
```

### GitHub Integráció

1. Push kód GitHub-ra
2. [Netlify Dashboard](https://app.netlify.com) → **"Add new site"**
3. Import from GitHub
4. **Környezeti változók beállítása:**
   - `VITE_GEMINI_API_KEY` = `your_api_key`
   - `GEMINI_API_KEY` = `your_api_key`
5. Deploy!

⚠️ **Fontos:** Mindkét környezeti változót állítsd be a Netlify Dashboard-on!

---

## 📚 Dokumentáció

- 📖 [FEJLESZTESEK.md](FEJLESZTESEK.md) - Elvégzett fejlesztések listája
- 🚀 [NETLIFY_DEPLOY.md](NETLIFY_DEPLOY.md) - Deployment útmutató
- 🛠️ [DEPLOYMENT.md](DEPLOYMENT.md) - Részletes deployment és hibaelhárítás
- 🔧 API dokumentáció - lásd: `netlify/functions/api.ts`

---

## 🎯 Funkciók

### ✨ Jelenleg Elérhető

- 🤖 **AI Asszisztens** - Gemini 2.0 Flash powered chatbot
- 💰 **Pénzügyi Követés** - Bevételek/kiadások kategorizálva
- 📊 **AI Pénzügyi Elemzés** - Gemini insights a kiadásokról
- 📅 **Naptár** - Havi/heti nézet eseményekkel
- 📧 **Gmail Preview** - Email értesítések
- 🗂️ **Projekt Kanban** - Tervezés/Fejlesztés/Kész oszlopok
- 🎨 **Modern UI** - Dark mode, glassmorphism design
- 📱 **Mobil Optimalizált** - Responsive layout

### 🔧 Backend API

- ✅ **REST API** Netlify Functions-zel
- ✅ **CRUD műveletek** transactions, events, projects-re
- ✅ **CORS támogatás**
- ✅ **Error handling**
- ⚠️ **In-memory storage** (éles környezethez DB szükséges)

---

## 🏗️ Technológiai Stack

### Frontend
- ⚛️ **React 19.1** - Latest React with new features
- 📘 **TypeScript 5.8** - Type safety
- ⚡ **Vite 6.2** - Lightning fast build tool
- 🎨 **Custom CSS** - No framework, pure CSS
- 🤖 **Google Gemini AI** - AI integration

### Backend
- 🌐 **Netlify Functions** - Serverless API
- 📦 **TypeScript** - Type-safe backend
- 🔄 **REST API** - Standard endpoints

### DevOps
- 🚀 **Netlify** - Hosting & CI/CD
- 🔐 **Environment Variables** - Secure config
- 📦 **Git-based Deployment**

---

## 🔐 Környezeti Változók

**Helyi fejlesztéshez** (`.env.local`):
```env
VITE_GEMINI_API_KEY=your_api_key_here
GEMINI_API_KEY=your_api_key_here
```

**Netlify production-höz:**
- Állítsd be a Dashboard-on: Site settings → Environment variables

---

## ⚡ Optimalizáció

### Build Optimalizáció
✅ **Code Splitting** - Vendor/Editor/Markdown chunks  
✅ **Tree Shaking** - Felesleges kód eltávolítása  
✅ **Minification** - esbuild gyors build-del  
✅ **Asset Caching** - 1 év cache static asset-ekre  

### Biztonság
✅ **Security Headers** - XSS, CSP, Frame Options  
✅ **HTTPS Redirect** - Automatikus  
✅ **CORS konfiguráció** - API védelem  
✅ **Input validáció** - Backend szinten  

### Performance
✅ **SPA Routing** - Client-side navigation  
✅ **Lazy Loading** - Komponensek igény szerint  
✅ **Responsive Design** - Mobil-first approach  
✅ **Optimized Fonts** - Google Fonts preconnect  

---

## 🐛 Ismert Korlátozások

⚠️ **In-memory backend** - Újraindításkor elvesznek az adatok  
⚠️ **Nincs autentikáció** - User ID placeholder  
⚠️ **Nincs adatbázis** - Perzisztens tároláshoz DB szükséges  
⚠️ **Gmail/Calendar** - Mock adatok, API integráció hiányzik  

**Megoldás:** Lásd "Következő Lépések" a [FEJLESZTESEK.md](FEJLESZTESEK.md) fájlban

---

## 🔜 Roadmap

### v1.1 (Tervezett)
- [ ] Supabase integráció
- [ ] User authentication (OAuth)
- [ ] Perzisztens adattárolás
- [ ] Profilok és beállítások

### v1.2 (Tervezett)
- [ ] Gmail API integráció
- [ ] Google Calendar API
- [ ] Valós email/esemény szinkronizáció

### v1.3 (Tervezett)
- [ ] PWA funkciók
- [ ] Offline mód
- [ ] Push notificationök
- [ ] Service Worker

### v2.0 (Jövőbeli)
- [ ] Multi-language support (EN/HU)
- [ ] Dark/Light mode toggle
- [ ] Custom themes
- [ ] Export/Import funkciók
- [ ] Dashboard analytics

---

## 🤝 Közreműködés

Hibát találtál? Van ötleted? Nyiss egy issue-t vagy pull request-et!

---

## 📄 Licensz

MIT License - Szabad felhasználás és módosítás

---

## 👨‍💻 Fejlesztő

**HeR WiNnEr Team**  
Powered by GitHub Copilot & Google Gemini AI

---

## 📞 Támogatás

Ha problémád van:
1. 📖 Olvasd el a [DEPLOYMENT.md](DEPLOYMENT.md) hibaelhárítási részét
2. 🔍 Nézd meg a Netlify build log-okat
3. 🌐 Ellenőrizd a böngésző konzolt (F12)
4. 🔐 Győződj meg róla, hogy a környezeti változók helyesek

---

<div align="center">

**⭐ Ha tetszik a projekt, adj egy csillagot! ⭐**

Made with ❤️ and ☕ in Hungary 🇭🇺

</div>
