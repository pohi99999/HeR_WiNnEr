# 🔥 Firebase Setup - Részletes Lépésről-Lépésre

## 🎯 1. Firebase Projekt Létrehozása

### 1.1 Firebase Console Megnyitása
1. Nyisd meg: **https://console.firebase.google.com/**
2. Jelentkezz be **Gmail fiókoddal**
3. Kattints: **"Add project"** vagy **"Projekt hozzáadása"**

### 1.2 Projekt Beállítása
1. **Project name:** `HeR-WiNnEr` (vagy bármilyen név)
2. Kattints: **"Continue"**
3. **Google Analytics:** Kikapcsolhatod (nem kötelező)
4. Kattints: **"Create project"**
5. Várj 30 másodpercet...
6. Kattints: **"Continue"**

---

## 🔐 2. Authentication Beállítása

### 2.1 Authentication Engedélyezése
1. Bal menü: **"Build"** → **"Authentication"**
2. Kattints: **"Get started"**

### 2.2 Google Sign-In Bekapcsolása
1. Kattints: **"Sign-in method"** tab
2. Keresd meg: **"Google"**
3. Kattints a **Google** sorra
4. **Enable** kapcsoló → **BE**
5. **Project support email:** Válaszd ki a Gmail fiókodat
6. Kattints: **"Save"**

### 2.3 Authorized Domains (később Netlify-nál)
1. **Settings** tab (fogaskerék ikon)
2. Görgess le: **"Authorized domains"**
3. Alapból `localhost` és `firebaseapp.com` már ott van
4. **Később** add hozzá a Netlify domain-t (pl. `your-app.netlify.app`)

---

## 💾 3. Firestore Database Létrehozása

### 3.1 Firestore Indítása
1. Bal menü: **"Build"** → **"Firestore Database"**
2. Kattints: **"Create database"**

### 3.2 Location Kiválasztása
1. **Location:** `europe-west3` (Frankfurt) - legközelebbi
2. Kattints: **"Next"**

### 3.3 Security Rules
1. Válaszd: **"Start in test mode"** (átmenetileg)
2. Kattints: **"Enable"**

### 3.4 Security Rules Frissítése (FONTOS!)
1. Kattints: **"Rules"** tab
2. Töröld az összes meglévő szabályt
3. **Másold be ezt:**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Csak bejelentkezett felhasználók
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // Transactions - csak saját adatok
    match /transactions/{transactionId} {
      allow read, write: if request.auth != null 
        && request.resource.data.userId == request.auth.uid;
    }
    
    // Events - csak saját adatok
    match /events/{eventId} {
      allow read, write: if request.auth != null 
        && request.resource.data.userId == request.auth.uid;
    }
    
    // Projects - csak saját adatok
    match /projects/{projectId} {
      allow read, write: if request.auth != null 
        && request.resource.data.userId == request.auth.uid;
    }
  }
}
```

4. Kattints: **"Publish"**

---

## ⚙️ 4. Firebase Config Kimásolása

### 4.1 SDK Setup
1. Bal menü: **Fogaskerék ⚙️** → **"Project settings"**
2. Görgess le: **"Your apps"**
3. Ha még nincs app, kattints: **"</> Web"** (webalkalmazás ikon)
4. **App nickname:** `HeR-WiNnEr Web`
5. **NINCS** szükség Firebase Hosting-ra
6. Kattints: **"Register app"**

### 4.2 Config Értékek Kimásolása
Látni fogsz egy ilyen kódot:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyB1234567890abcdefgh",
  authDomain: "her-winner-12345.firebaseapp.com",
  projectId: "her-winner-12345",
  storageBucket: "her-winner-12345.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};
```

**Másold ki ezeket az értékeket!**

---

## 📝 5. .env.local Fájl Kitöltése

### 5.1 Fájl Megnyitása
Nyisd meg: `.env.local` fájlt a projekt gyökérben

### 5.2 Értékek Beillesztése
Cseréld le az összes `your_...` értéket:

```bash
# Gemini API Key (már megvan)
VITE_GEMINI_API_KEY=your_existing_gemini_key

# Firebase Config (Firebase Console-ból másold)
VITE_FIREBASE_API_KEY=AIzaSyB1234567890abcdefgh
VITE_FIREBASE_AUTH_DOMAIN=her-winner-12345.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=her-winner-12345
VITE_FIREBASE_STORAGE_BUCKET=her-winner-12345.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123def456
```

### 5.3 Fájl Mentése
**Ctrl+S** vagy **File → Save**

---

## 🚀 6. Helyi Tesztelés

### 6.1 Dev Server Indítása
```powershell
npm run dev
```

### 6.2 Böngészőben Megnyitás
1. Nyisd meg: **http://localhost:5173**
2. Látnod kell a **"Bejelentkezés Google fiókkal"** gombot
3. Kattints rá
4. Válaszd ki a Gmail fiókodat
5. **Engedélyezd** a hozzáférést
6. ✅ **Bejelentkeztél!**

---

## 🌐 7. Netlify Deployment

### 7.1 Git Push
```powershell
git add .
git commit -m "Firebase backend integration"
git push origin main
```

### 7.2 Netlify Environment Variables
**Netlify Dashboard → Site settings → Environment variables:**

Adj hozzá **MIND a 7 változót:**
- `VITE_GEMINI_API_KEY`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

### 7.3 Authorized Domain Hozzáadása
**Firebase Console → Authentication → Settings → Authorized domains:**
1. Kattints: **"Add domain"**
2. Írd be: `your-app.netlify.app` (a saját Netlify URL-ed)
3. **Add**

### 7.4 Redeploy
**Netlify → Deploys → Trigger deploy → Deploy site**

---

## ✅ Ellenőrzés

- [ ] Firebase projekt létrehozva
- [ ] Google Sign-In engedélyezve
- [ ] Firestore database létrehozva
- [ ] Security rules publikálva
- [ ] .env.local kitöltve
- [ ] `npm run dev` működik
- [ ] Google bejelentkezés működik helyben
- [ ] Netlify ENV változók beállítva
- [ ] Netlify domain hozzáadva Firebase-hez
- [ ] Production deployment működik

---

## 🆘 Hibaelhárítás

### "Firebase: Error (auth/unauthorized-domain)"
→ Authorized domains-hoz add hozzá a domain-t

### "Firebase: Error (auth/configuration-not-found)"
→ Ellenőrizd az .env.local értékeket

### Üres képernyő Netlify-on
→ F12 → Console → nézd meg a hibaüzenetet
→ Ellenőrizd, hogy mind a 7 ENV változó be van-e állítva

### "Permission denied" Firestore-ban
→ Ellenőrizd a Security Rules-t
→ Publishold újra a rules-t

---

## 📞 Segítség

Ha elakadtál, küldj screenshot-ot a hibáról! 🙂
