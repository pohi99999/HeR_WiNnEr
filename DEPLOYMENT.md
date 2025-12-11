# HeR WiNnEr - Deployment útmutató

## 🚀 Netlify Deployment

### 1. Környezeti változók beállítása

A Netlify Dashboard-on állítsd be a következő környezeti változókat:

```
VITE_GEMINI_API_KEY=your_actual_gemini_api_key
GEMINI_API_KEY=your_actual_gemini_api_key
```

**Fontos:** Mindkét változót állítsd be!

### 2. Build beállítások

A `netlify.toml` fájl már tartalmazza a helyes beállításokat:

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Functions directory:** `netlify/functions`

### 3. Deploy lépések

#### GitHub integráció:
1. Push-old a kódot GitHub-ra
2. Netlify Dashboard → "Add new site" → "Import from Git"
3. Válaszd ki a repository-t
4. Állítsd be a környezeti változókat
5. Deploy!

#### CLI deploy:
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Deploy
netlify deploy --prod
```

## 🔧 Fejlesztési környezet

### Helyi futtatás

```bash
# Telepítés
npm install

# .env.local fájl létrehozása
cp .env.example .env.local

# Szerkeszd a .env.local fájlt és add meg az API kulcsot
# VITE_GEMINI_API_KEY=your_api_key_here

# Fejlesztői szerver indítása
npm run dev
```

### Helyi build tesztelés

```bash
# Build
npm run build

# Preview
npm run preview
```

## 🐛 Hibaelhárítás

### Üres képernyő a Netlify-on

**Probléma:** A build után üres oldal jelenik meg.

**Megoldás:**
1. ✅ **React 19 root inicializáció hozzáadva** - Az app most már megfelelően renderelődik
2. ✅ **Ellenőrizd a környezeti változókat** - A Netlify Dashboard-on állítsd be a `VITE_GEMINI_API_KEY` értéket
3. ✅ **Konzol hibák** - Nyisd meg a böngésző Developer Tools-t és nézd meg a Console tab-ot

### API kulcs hibaüzenet

Ha ezt látod: "API kulcs nincs beállítva"

**Megoldás:**
1. Netlify Dashboard → Site settings → Environment variables
2. Add hozzá: `VITE_GEMINI_API_KEY` = `your_api_key`
3. Redeploy the site

### Build hibák

```bash
# Cache tisztítása
rm -rf node_modules dist
npm install
npm run build
```

## 📦 Backend API

Az alkalmazás Netlify Functions-t használ backend-ként:

**Endpoints:**

- `GET /api/transactions` - Összes tranzakció lekérése
- `POST /api/transactions` - Új tranzakció létrehozása
- `PUT /api/transactions/:id` - Tranzakció frissítése
- `DELETE /api/transactions/:id` - Tranzakció törlése

- `GET /api/events` - Események lekérése
- `POST /api/events` - Új esemény létrehozása
- `PUT /api/events/:id` - Esemény frissítése
- `DELETE /api/events/:id` - Esemény törlése

- `GET /api/projects` - Projektek lekérése
- `POST /api/projects` - Új projekt létrehozása
- `PUT /api/projects/:id` - Projekt frissítése
- `DELETE /api/projects/:id` - Projekt törlése

**Megjegyzés:** Jelenleg in-memory tárolást használ. Éles környezetben cseréld le egy valódi adatbázisra (pl. Supabase, MongoDB Atlas, stb.).

## 🔐 Biztonság

Az alkalmazás a következő biztonsági beállításokat használja:

- XSS védelem
- Frame Options
- Content Security Policy
- HTTPS redirect
- Secure headers (lásd: netlify.toml)

## 📱 Optimalizálás

- Code splitting a nagyobb komponensekhez
- Asset caching (1 év)
- Minification
- Tree-shaking
- Lazy loading

## 🎨 Fejlesztési tippek

1. **Mock adatok:** Az alkalmazás mock adatokkal indul. A backend integráció után cseréld ki az API hívásokra.

2. **Komponens architektúra:** A komponensek már készen állnak a backend integrációra.

3. **Hiba kezelés:** Minden API hívás try-catch blokkban van error handling-gel.

4. **Loading states:** Az alkalmazás jelzi a loading állapotokat a felhasználónak.

## 🚀 Következő lépések

1. ✅ React root inicializáció - **KÉSZ**
2. ✅ Backend API struktura - **KÉSZ**
3. ✅ Error handling javítása - **KÉSZ**
4. 🔄 Adatbázis integráció (Supabase ajánlott)
5. 🔄 User authentication
6. 🔄 Gmail API integráció
7. 🔄 Google Calendar API integráció

## 📞 Támogatás

Ha bármilyen problémád van, ellenőrizd:
1. A Netlify build log-okat
2. A böngésző konzolt
3. A környezeti változókat

Sikeres deploy-t! 🎉
