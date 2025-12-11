# 🔥 FIREBASE - START HERE!

## 🎯 Mit csináltam?

Az alkalmazás **teljes backend átállítása Firebase-re**:

### Előtte ❌
- In-memory storage (adatok elvésztek)
- Nincs bejelentkezés
- Nincs perzisztens tárolás

### Most ✅
- **Firebase Firestore** - Cloud database
- **Google Sign-In** - Gmail fiókkal bejelentkezés
- **Perzisztens adatok** - Megmaradnak
- **Biztonságos** - User-alapú hozzáférés

---

## 🚀 GYORS START (3 LÉPÉS)

### 1️⃣ Firebase Projekt Létrehozása

1. Menj: https://console.firebase.google.com/
2. **"Add project"** → Név: `HeR-WiNnEr`
3. Google Analytics: **IGEN**
4. Kattints: **"Create project"**

### 2️⃣ Beállítások

**Authentication:**
1. Firebase Console → **Authentication**
2. **"Get started"** → **Sign-in method** tab
3. **Google** → **Enable** → Email választása → **Save**

**Firestore:**
1. Firebase Console → **Firestore Database**
2. **"Create database"**
3. **Location:** `europe-west3` (Frankfurt)
4. **Rules:** "Start in production mode"
5. **"Enable"**

**Security Rules (FONTOS!):**
1. **Firestore** → **Rules** tab
2. Másold be:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }
    
    function isOwner(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }
    
    match /transactions/{id} {
      allow read, write: if isOwner(resource.data.userId);
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
    }
    
    match /events/{id} {
      allow read, write: if isOwner(resource.data.userId);
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
    }
    
    match /projects/{id} {
      allow read, write: if isOwner(resource.data.userId);
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
    }
  }
}
```

3. **"Publish"**

### 3️⃣ Config Beállítása

**Firebase Console:**
1. Project settings (⚙️) → **Your apps**
2. Web app `</>` → **"Register app"**
3. Név: `HeR-WiNnEr-Web`
4. **Másold ki a config-ot!**

**Lokális .env.local:**
```bash
# Másold át
cp .env.example .env.local

# Töltsd ki (Firebase Console-ból):
VITE_GEMINI_API_KEY=your_gemini_api_key

VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=project-id
VITE_FIREBASE_STORAGE_BUCKET=project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456
VITE_FIREBASE_APP_ID=1:123456:web:abc123
```

**Indítás:**
```bash
npm run dev
# http://localhost:3000
```

---

## ✅ Tesztelés

1. **Nyisd meg:** http://localhost:3000
2. **Login oldal** látszik
3. **"Bejelentkezés Google fiókkal"** gomb
4. **Gmail fiók választása**
5. ✅ **Belépés sikeres!**
6. **User profil** látszik a tetején

---

## 📦 Netlify Deploy Firebase-szel

### Környezeti változók (MIND a 7!)

Netlify Dashboard → Site settings → Environment variables:

```
VITE_GEMINI_API_KEY = your_gemini_api_key
VITE_FIREBASE_API_KEY = AIza...
VITE_FIREBASE_AUTH_DOMAIN = project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID = project-id
VITE_FIREBASE_STORAGE_BUCKET = project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID = 123456
VITE_FIREBASE_APP_ID = 1:123456:web:abc123
```

### Authorized Domains

Firebase Console → Authentication → Settings → Authorized domains:

- `localhost` ✅ (már benne)
- `your-app.netlify.app` ⬅️ **ADD EZT!**

### Deploy

```bash
# Push GitHub-ra
git add .
git commit -m "feat: Firebase integration"
git push

# Netlify auto-deploy-ol!
```

---

## 🐛 Problémák?

### "Firebase not configured"
❌ Környezeti változók hiányoznak  
✅ Töltsd ki a `.env.local` fájlt

### "Permission denied" Firestore
❌ Security rules nem publikálva  
✅ Firestore → Rules → Publish

### Google Sign-In nem működik
❌ Authorized domains  
✅ Authentication → Settings → Add `localhost` és Netlify domain

---

## 📚 Részletes Dokumentáció

- 🔥 **[FIREBASE_SETUP.md](FIREBASE_SETUP.md)** - Teljes Firebase útmutató
- 📋 **[FIREBASE_MIGRATION.md](FIREBASE_MIGRATION.md)** - Mit változott?
- 🚀 **[README.md](README.md)** - Projekt áttekintés

---

## 🎉 Kész!

✅ Firebase projekt létrehozva  
✅ Authentication beállítva  
✅ Firestore engedélyezve  
✅ Security rules publikálva  
✅ Config beállítva  
✅ **Gmail fiókkal bejelentkezhetsz!** 🚀

---

**🔥 Indulhat a teszt! Jelentkezz be Gmail fiókkal!**

*Frissítve: 2025.12.11 | Verzió: 2.0.0*
