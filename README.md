# WallaceAI: 100% free setup

Everything below is free: Groq (AI), Neon (database), GitHub (code), Render (hosting).

1. Groq key: https://console.groq.com/keys -> create key -> copy it.
2. Neon database: https://console.neon.tech/signup -> create project -> copy the connection string
   (starts with postgresql://). Needed because Render's free disk is wiped, which would reset accounts and free-message counts.
3. GitHub: new repo, upload this folder's files (NOT .env). Free account at github.com.
4. Render: https://render.com -> New -> Web Service -> pick the repo.
   Runtime Python, Instance type FREE.
   Build Command:  pip install -r requirements.txt
   Start Command:  uvicorn server:app --host 0.0.0.0 --port $PORT
5. Environment Variables on Render:
   API_KEY = your Groq key
   DATABASE_URL = your Neon connection string
   SECRET_KEY = any long random string (keep it fixed, or everyone gets logged out on restart)
   PRODUCTION = 1
6. Deploy. Your site is at https://<name>.onrender.com

Optional local test: pip install -r requirements.txt; cp .env.example .env; fill it in; uvicorn server:app --reload
Limits are changed with env vars: FREE_MESSAGES, MEMBER_DAILY, GLOBAL_DAILY_CAP.
