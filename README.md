# Oura Scores — Pebble Time 2 Watchface

Displays your daily **Sleep**, **Readiness**, and **Activity** scores from Oura on your Pebble Time 2.

Built with the [Alloy (Moddable) SDK](https://developer.repebble.com/docs/) for [rePebble](https://repebble.com).

---

## Setup

### 1. Create an Oura OAuth application

1. Go to [cloud.ouraring.com/oauth/applications](https://cloud.ouraring.com/oauth/applications)
2. Create a new application
3. Set the **redirect URI** to your hosted callback page URL (see step 3)
4. Note down your **Client ID** and **Client Secret**
5. Ensure the **`daily`** scope is enabled

### 2. Host the OAuth callback page

The `config/index.html` file is a tiny page that receives the OAuth redirect
from Oura and passes the auth code back to the Pebble app.

**Easiest option — GitHub Pages:**
1. Push this repo to GitHub
2. In your repo settings → Pages, set source to `main` branch, `/ (root)` folder
3. Your callback URL will be: `https://YOUR-USERNAME.github.io/REPO-NAME/config/`

Register this URL as the redirect URI in your Oura app (step 1 above).

### 3. Configure `src/pkjs/index.js`

Open `src/pkjs/index.js` and fill in the three constants at the top:

```js
const CLIENT_ID     = 'YOUR_OURA_CLIENT_ID';
const CLIENT_SECRET = 'YOUR_OURA_CLIENT_SECRET';
const REDIRECT_URI  = 'https://YOUR-USERNAME.github.io/oura-pebble/config/';
```

### 4. Build and install

```bash
# Install the Pebble SDK toolchain first if you haven't already
pebble build
pebble install --emulator emery          # test in emulator
pebble install --phone YOUR_PHONE_IP     # install on device
```

### 5. Authorize Oura

1. Open the **Pebble** app on your phone
2. Find **Oura Scores** in your watchface list and tap the **settings** (⚙) icon
3. The Oura authorization page will open in a browser
4. Log in and approve access
5. You'll be returned to the Pebble app, and scores will load on the watch

---

## How it works

```
Watch (embeddedjs)          Phone (pkjs)              Oura API
─────────────────           ──────────────            ────────
 Launches watchface
 ↓
 onWritable() fires  ──→   appmessage received
                           withValidToken()
                           fetchAndSend() ──────────→ /daily_sleep
                                                       /daily_readiness
                                         ←──────────   /daily_activity
                           sendAppMessage(scores)
 ←──────────────────────── {SLEEP_SCORE, ...}
 onReadable() fires
 draw() updates display
```

**Authentication flow (first run):**
1. User taps ⚙ in Pebble app → `showConfiguration` event fires in pkjs
2. pkjs opens Oura's authorization URL in the phone's webview
3. User logs in and approves → Oura redirects to `config/index.html?code=...`
4. That page passes the code back: `pebblejs://close#{"code":"..."}`
5. pkjs exchanges the code for access + refresh tokens (stored in `localStorage`)
6. Tokens are silently refreshed on expiry — no re-auth needed

---

## Score colours

| Range  | Colour      | Meaning   |
|--------|-------------|-----------|
| 85–100 | Green       | Excellent |
| 70–84  | Yellow-green| Good      |
| 60–69  | Orange      | Fair      |
| 0–59   | Red         | Poor      |
| `--`   | Grey        | No data   |

Scores may show `--` if Oura hasn't computed them yet (e.g. sleep score
appears after your morning sync).

---

## Project structure

```
package.json              Project manifest (Alloy/Moddable)
wscript                   Build configuration
src/
  embeddedjs/
    main.js               Watch-side code (Poco rendering + messaging)
  pkjs/
    index.js              Phone-side code (OAuth + Oura API + sendAppMessage)
config/
  index.html              OAuth callback page (host on GitHub Pages)
```
