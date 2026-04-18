# Recipe App — Complete Setup Guide

## Overview
- **Frontend**: React PWA → hosted on Netlify
- **Backend**: Node.js/Express → hosted on Render
- **Database**: Supabase (PostgreSQL)
- **AI**: Anthropic Claude API (scraping + nutrition scores)

---

## Step 1 — Supabase (Database)

1. Go to https://supabase.com and create a free account
2. Click **New Project**, give it a name (e.g. "recipe-app")
3. Wait ~2 minutes for the project to spin up
4. Go to **SQL Editor** (left sidebar)
5. Paste the entire contents of `supabase-schema.sql` and click **Run**
6. You should see "Success" and the categories table seeded with 5 rows

**Collect these values** (from Settings → API):
- Project URL → `https://xxxx.supabase.co`
- `anon` public key → for the frontend `.env.local`
- `service_role` secret key → for the backend `.env`

---

## Step 2 — Anthropic API Key

1. Go to https://console.anthropic.com
2. Sign up / log in
3. Go to **API Keys** → **Create Key**
4. Copy the key (starts with `sk-ant-...`)
5. Add a small amount of credit ($5 is plenty to start)

---

## Step 3 — Backend on Render

1. Push the `recipe-backend/` folder to a GitHub repo
   ```bash
   cd recipe-backend
   git init
   git add .
   git commit -m "Initial backend"
   # Create a new repo on github.com, then:
   git remote add origin https://github.com/YOUR_USERNAME/recipe-backend.git
   git push -u origin main
   ```

2. Go to https://render.com → **New** → **Web Service**
3. Connect your GitHub repo
4. Configure:
   - **Name**: recipe-backend (or anything)
   - **Runtime**: Node
   - **Build command**: `npm install`
   - **Start command**: `npm start`
   - **Instance type**: Free

5. Add Environment Variables (in Render dashboard → Environment):
   ```
   ANTHROPIC_API_KEY    = sk-ant-your-key-here
   SUPABASE_URL         = https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY = your-service-role-key
   FRONTEND_URL         = https://your-app.netlify.app
   ```

6. Click **Deploy** — wait ~3 minutes
7. Test it: visit `https://your-backend.onrender.com/health`
   You should see: `{"status":"ok","timestamp":"...","version":"1.0.0"}`

---

## Step 4 — Frontend on Netlify

1. Push the `recipe-app/` folder to a GitHub repo
   ```bash
   cd recipe-app
   git init
   git add .
   git commit -m "Initial frontend"
   git remote add origin https://github.com/YOUR_USERNAME/recipe-app.git
   git push -u origin main
   ```

2. Go to https://netlify.com → **Add new site** → **Import from Git**
3. Connect your GitHub repo
4. Configure:
   - **Build command**: `npm run build`
   - **Publish directory**: `build`

5. Add Environment Variables (in Netlify → Site Settings → Environment Variables):
   ```
   REACT_APP_API_URL            = https://your-backend.onrender.com
   REACT_APP_SUPABASE_URL       = https://xxxx.supabase.co
   REACT_APP_SUPABASE_ANON_KEY  = your-anon-key
   ```

6. Click **Deploy site** — wait ~2 minutes
7. Your app is live at `https://random-name.netlify.app`
   (you can set a custom name in Site Settings → General)

---

## Step 5 — Install on your phones (PWA)

### iPhone (Safari only):
1. Open your Netlify URL in **Safari**
2. Tap the **Share** button (box with arrow)
3. Tap **Add to Home Screen**
4. Tap **Add** — done! It opens fullscreen like a native app.

### Android (Chrome):
1. Open your Netlify URL in **Chrome**
2. Tap the **three dots** menu
3. Tap **Add to Home screen**
4. Tap **Add** — done!

---

## Local Development

### Backend
```bash
cd recipe-backend
npm install
cp .env.example .env
# Fill in your values in .env
npm run dev
# Runs on http://localhost:4000
```

### Frontend
```bash
cd recipe-app
npm install
cp .env.example .env.local
# Fill in .env.local:
#   REACT_APP_API_URL=http://localhost:4000
#   REACT_APP_SUPABASE_URL=https://xxxx.supabase.co
#   REACT_APP_SUPABASE_ANON_KEY=your-anon-key
npm start
# Opens http://localhost:3000
```

---

## Architecture Summary

```
Your phone / laptop (browser)
        ↓  HTTPS
   Netlify (React PWA)
        ↓  API calls
   Render (Node.js/Express)
     ↙          ↘
Supabase      Anthropic
(database)    (Claude AI)
```

---

## Costs (all free to start)

| Service    | Free tier                        | Paid if needed        |
|------------|----------------------------------|-----------------------|
| Netlify    | 100GB bandwidth/month            | $19/month             |
| Render     | 750 hours/month (sleeps)         | $7/month (always on)  |
| Supabase   | 500MB DB, 2GB bandwidth          | $25/month             |
| Anthropic  | Pay per use (~$0.01 per scrape)  | —                     |
