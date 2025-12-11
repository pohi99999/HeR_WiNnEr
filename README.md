<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 🏆 HeR WiNnEr - AI-Powered Productivity App

**Verzió:** 2.0.0 🔥  
**Státusz:** ✅ Production Ready (Firebase Backend)

Modern produktivitási alkalmazás **Gmail fiókos bejelentkezéssel**, Gemini AI asszisztenssel, pénzügyi követéssel, naptárral és projekt managementtel.

## 🔥 ÚJ: Firebase Integráció!

✅ **Google Sign-In** - Bejelentkezés Gmail fiókkal  
✅ **Cloud Firestore** - Perzisztens adattárolás  
✅ **Security Rules** - Biztonságos adatvédelem  
✅ **Real-time sync** - Automatikus frissítés  

👉 **Kezdd itt:** [FIREBASE_QUICKSTART.md](FIREBASE_QUICKSTART.md) - 3 lépésben kész!

## 🆕 Legfrissebb Frissítések (2025.12.11)

### v2.0.0 - Firebase Integráció 🔥
- ✅ **Firebase Authentication** - Google Sign-In Gmail fiókkal
- ✅ **Firestore Database** - Perzisztens adattárolás
- ✅ **Security Rules** - User-alapú adatvédelem
- ✅ **Gmail/Calendar API** scope-ok előkészítve
- 🎯 **Login oldal** és user profil UI

### v1.0.0 - Alapok
- ✅ Netlify üres képernyő probléma megoldva
- ✅ React 19 root fix
- ✅ Error handling javítva
- ✅ Build optimalizáció

➡️ **Firebase Setup:** [FIREBASE_SETUP.md](FIREBASE_SETUP.md)  
➡️ **Migráció Részletek:** [FIREBASE_MIGRATION.md](FIREBASE_MIGRATION.md)

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

### Backend & Authentication

- ✅ **Firebase Firestore** - Cloud NoSQL adatbázis
- ✅ **Google Sign-In** - Gmail fiókkal bejelentkezés
- ✅ **Security Rules** - User-szintű adatvédelem
- ✅ **Real-time sync** - Automatikus adatfrissítés
- ✅ **Perzisztens tárolás** - Adatok megmaradnak
- 🔄 **Gmail/Calendar API** - Scope-ok előkészítve

---

## 🏗️ Technológiai Stack

### Frontend
- ⚛️ **React 19.1** - Latest React with new features
- 📘 **TypeScript 5.8** - Type safety
- ⚡ **Vite 6.2** - Lightning fast build tool
- 🎨 **Custom CSS** - No framework, pure CSS
- 🤖 **Google Gemini AI** - AI integration

### Backend & Database
- 🔥 **Firebase** - Google Cloud Platform
- 🗄️ **Firestore** - NoSQL cloud database
- 🔐 **Firebase Auth** - Google Sign-In
- ⚡ **Real-time** - Live data synchronization
- 🛡️ **Security Rules** - Row-level security

### DevOps
- 🚀 **Netlify** - Hosting & CI/CD
- 🔐 **Environment Variables** - Secure config
- 📦 **Git-based Deployment**

---

## 🔐 Környezeti Változók

# Gemini AI
VITE_GEMINI_API_KEY=your_api_key_here

# Firebase (6 változó szükséges!)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=project-id
VITE_FIREBASE_STORAGE_BUCKET=project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

**Firebase Setup:**  
👉 Részletes útmutató: [FIREBASE_SETUP.md](FIREBASE_SETUP.md)

**Netlify production:**
- Állítsd be MINDEN változót a Dashboard-on
-
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
✅ *✅ Firebase Integráció Előnyei

✅ **Perzisztens adatok** - Firestore cloud database  
✅ **Google Authentication** - Gmail fiókkal bejelentkezés  
✅ **Security Rules** - User-alapú adatvédelem  
✅ **Real-time sync** - Automatikus adatfrissítés  
✅ **Offline support** - Cache mechanizmus  
✅ **Skalálható** - Automatikus scaling  

## ⚠️ Folyamatban

🔄 **Gmail API integráció** - Valós emailek (scope előkészítve)  
🔄 **Calendar API integráció** - Valós események (scope előkészítve)  
🔄 *✅ v2.0.0 - Firebase (KÉSZ)
- [x] Firebase Authentication
- [x] Firestore Database
- [x] Google Sign-In
- [x] Security Rules
- [x] Gmail/Calendar scope-ok

### v2.1 (Következő)
- [ ] Gmail API - Valós emailek olvasása
- [ ] Calendar API - Valós események szinkronizálása
- [ ] Email értesítések
- [ ] Naptár sync beállítások

### v2.2 (Tervezett)
- [ ] Push notifications (FCM)
- [ ] PWA funkciók
- [ ] Offline mód javítása
- [ ] Service Worker
- [ ] Add to Home Screen

### v3.0 (Jövőbeli)
- [ ] Multi-language support (EN/HU)
- [ ] Dark/Light mode toggle
- [ ] Custom themes
- [ ] Export/Import funkciók
- [ ] Dashboard analytics
- [ ] Budget tracking
- [ ] AI-powered insightrolás
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
