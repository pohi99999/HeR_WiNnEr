# 🔥 Firebase Setup Útmutató - HeR WiNnEr

## 📋 Áttekintés

Ez az útmutató végigvezet a Firebase projekt beállításán, amely tartalmazza:
- ✅ **Firebase Authentication** (Google Sign-In)
- ✅ **Cloud Firestore** (Adatbázis)
- ✅ **Security Rules** (Adatvédelem)
- ✅ **Gmail/Calendar API** előkészítés

---

## 🚀 1. Firebase Projekt Létrehozása

### Lépések:

1. **Menj a Firebase Console-ra:**  
   👉 https://console.firebase.google.com/

2. **Új projekt létrehozása:**
   - Kattints: **"Add project"** / **"Projekt hozzáadása"**
   - Projekt név: `HeR-WiNnEr` (vagy saját név)
   - Google Analytics: **ENGEDÉLYEZD** (ajánlott)
   - Kattints: **"Create project"**

3. **Várj ~30 másodpercet** a projekt inicializálására

---

## 🔐 2. Authentication Beállítása

### Google Sign-In Engedélyezése:

1. **Firebase Console** → **Authentication** (bal menü)
2. Kattints: **"Get started"**
3. **Sign-in method** tab → **Google**
4. **Enable** kapcsoló → BE
5. **Project support email:** Válaszd ki a Gmail címed
6. Kattints: **"Save"**

### Jogosult Domain-ek (Production):

1. **Authentication** → **Settings** → **Authorized domains**
2. Add hozzá:
   - `localhost` (már benne van)
   - `your-app.netlify.app` (Netlify domain)
   - Saját domain (ha van)

---

## 🗄️ 3. Firestore Database Létrehozása

### Database Inicializálása:

1. **Firebase Console** → **Firestore Database**
2. Kattints: **"Create database"**
3. **Location:** Válassz földrajzi régiót (pl. `europe-west3` - Frankfurt)
4. **Security rules:** 
   - Válaszd: **"Start in production mode"** (később állítjuk be)
5. Kattints: **"Enable"**

### Kollekciók (Auto-létrejönnek első használatkor):

Az app automatikusan létrehozza ezeket:
- `transactions` - Pénzügyi tranzakciók
- `events` - Naptár események
- `projects` - Projekt feladatok

---

## 🛡️ 4. Security Rules Beállítása

### Firestore Security Rules:

1. **Firestore Database** → **Rules** tab
2. Másold be ezt a kódot:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function: check if user is authenticated
    function isSignedIn() {
      return request.auth != null;
    }
    
    // Helper function: check if user owns the document
    function isOwner(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }
    
    // Transactions collection
    match /transactions/{transactionId} {
      allow read: if isOwner(resource.data.userId);
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      allow update, delete: if isOwner(resource.data.userId);
    }
    
    // Events collection
    match /events/{eventId} {
      allow read: if isOwner(resource.data.userId);
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      allow update, delete: if isOwner(resource.data.userId);
    }
    
    // Projects collection
    match /projects/{projectId} {
      allow read: if isOwner(resource.data.userId);
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      allow update, delete: if isOwner(resource.data.userId);
    }
  }
}
```

3. Kattints: **"Publish"**

**Mit csinálnak ezek a szabályok?**
- ✅ Csak bejelentkezett userek írhatnak/olvashatnak
- ✅ Minden user csak a saját adatait látja
- ✅ Nem lehet más user adatait módosítani

---

## ⚙️ 5. Firebase Config Lekérése

### SDK Configuration:

1. **Project Overview** (bal felső sarok, fogaskerék ikon) → **Project settings**
2. Görgess le: **"Your apps"** szekcióig
3. Kattints a **Web app** ikonra: `</>`
4. **App nickname:** `HeR-WiNnEr-Web`
5. **Firebase Hosting:** NE pipáld be (Netlify-t használunk)
6. Kattints: **"Register app"**

7. **Másold ki a config értékeket:**

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "her-winner.firebaseapp.com",
  projectId: "her-winner",
  storageBucket: "her-winner.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

---

## 📝 6. Környezeti Változók Beállítása

### Helyi Fejlesztéshez (.env.local):

Hozd létre a `.env.local` fájlt:

```env
# Gemini AI
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# Firebase
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=her-winner.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=her-winner
VITE_FIREBASE_STORAGE_BUCKET=her-winner.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

### Netlify Production:

1. **Netlify Dashboard** → Your site → **Site settings**
2. **Environment variables** → **Add a variable**
3. Add hozzá mindegyiket:

| Változó Név | Érték |
|-------------|-------|
| `VITE_GEMINI_API_KEY` | Your Gemini API key |
| `VITE_FIREBASE_API_KEY` | AIza... |
| `VITE_FIREBASE_AUTH_DOMAIN` | project-id.firebaseapp.com |
| `VITE_FIREBASE_PROJECT_ID` | project-id |
| `VITE_FIREBASE_STORAGE_BUCKET` | project-id.appspot.com |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | 123456789 |
| `VITE_FIREBASE_APP_ID` | 1:123456789:web:abc |

4. **Deploy site** → Újra deploy!

---

## 🧪 7. Tesztelés

### Helyi Tesztelés:

```bash
# Indítsd el az app-ot
npm run dev

# Nyisd meg: http://localhost:3000
# Próbáld ki a Google Sign-In-t
```

### Ellenőrizd:

1. ✅ **Login oldal** megjelenik
2. ✅ **Google Sign-In gomb** működik
3. ✅ Bejelentkezés után **user profil** látszik
4. ✅ **Firestore Console**-ban látszanak az adatok

---

## 🔧 8. Gmail & Calendar API (Opcionális)

Ha szeretnéd a Gmail/Calendar integrációt:

### Gmail API Engedélyezése:

1. **Google Cloud Console:**  
   👉 https://console.cloud.google.com/

2. Válaszd ki a Firebase projekt-et (automatikusan létrejött)

3. **APIs & Services** → **Enable APIs and Services**

4. Keresd meg és engedélyezd:
   - **Gmail API**
   - **Google Calendar API**

5. **OAuth Consent Screen:**
   - Állítsd be az alkalmazás nevét
   - Add hozzá a scope-okat:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/calendar.readonly`

### Firestore-ban már beállítottuk!

A `firebase.ts` fájl már tartalmazza a scope-okat:
```typescript
googleProvider.addScope('https://www.googleapis.com/auth/gmail.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/calendar.readonly');
```

---

## 🐛 Hibaelhárítás

### "Firebase not configured" hiba

**Megoldás:**
- Ellenőrizd a `.env.local` fájlt
- Minden `VITE_FIREBASE_*` változó ki van töltve?
- Újraindítás: `npm run dev`

### "Permission denied" Firestore-ban

**Megoldás:**
- Ellenőrizd a Security Rules-t (4. lépés)
- User be van jelentkezve?
- Firestore Console → Rules → Publish

### Google Sign-In nem működik

**Megoldás:**
- Authentication → Settings → Authorized domains
- `localhost` és a Netlify domain benne van?
- Chrome Incognito mód kipróbálása

### "API key not valid" hiba

**Megoldás:**
- Firebase Console → Project Settings
- API key másolva helyes-e?
- Netlify-on környezeti változók beállítva?

---

## 📊 Adatbázis Struktúra

### Transactions:

```json
{
  "id": "auto-generated",
  "userId": "user-uid",
  "title": "Bevásárlás",
  "amount": 15000,
  "type": "expense",
  "category": "Élelmiszer",
  "date": "2025-12-11",
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp"
}
```

### Events:

```json
{
  "id": "auto-generated",
  "userId": "user-uid",
  "title": "Meeting",
  "date": "2025-12-15",
  "time": "10:00",
  "type": "work",
  "status": "todo",
  "createdAt": "Timestamp"
}
```

### Projects:

```json
{
  "id": "auto-generated",
  "userId": "user-uid",
  "title": "Weboldal",
  "description": "Frontend fejlesztés",
  "tag": "Frontend",
  "status": "development",
  "createdAt": "Timestamp"
}
```

---

## 🎯 Következő Lépések

1. ✅ **Firebase projekt létrehozva**
2. ✅ **Authentication beállítva**
3. ✅ **Firestore engedélyezve**
4. ✅ **Security rules publikálva**
5. ✅ **Környezeti változók beállítva**
6. 🔄 **Gmail/Calendar API** (opcionális)
7. 🚀 **Deploy Netlify-ra**

---

## 📞 Támogatás

**Problémád van?**
1. Nézd meg a Firebase Console **Logs** szekciót
2. Chrome DevTools → Console → Figyeld a hibákat
3. Firestore Rules Simulator: Teszteld a szabályokat

**Hasznos Linkek:**
- 📖 [Firebase Docs](https://firebase.google.com/docs)
- 🔐 [Auth Docs](https://firebase.google.com/docs/auth)
- 🗄️ [Firestore Docs](https://firebase.google.com/docs/firestore)
- 📧 [Gmail API](https://developers.google.com/gmail/api)

---

🎉 **Gratulálok! A Firebase projekt készen áll!**

**Indítsd el az app-ot és jelentkezz be Gmail fiókkal!** 🚀
