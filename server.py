"""WallaceAI backend: keeps your API key private, enforces the free-message limit,
and handles email sign-up. Run: uvicorn server:app"""
import base64, hashlib, hmac, os, re, secrets, sqlite3, time, uuid
from datetime import date

from openai import OpenAI, RateLimitError
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()
MODEL = os.getenv("MODEL", "openai/gpt-oss-120b")
BASE_URL = os.getenv("BASE_URL", "https://api.groq.com/openai/v1")
GLOBAL_DAILY_CAP = int(os.getenv("GLOBAL_DAILY_CAP", 100))  # stay under your free quota
FREE_MESSAGES = int(os.getenv("FREE_MESSAGES", 10))       # per visitor, lifetime
MEMBER_DAILY = int(os.getenv("MEMBER_DAILY", 50))         # per signed-up user, per day
IP_DAILY_CAP = int(os.getenv("IP_DAILY_CAP", 40))         # anti-abuse, per IP, per day
SECRET = os.getenv("SECRET_KEY") or secrets.token_hex(32)  # set a fixed one in production!
DB_PATH = os.getenv("DB_PATH", "wallace.db")
SECURE = os.getenv("PRODUCTION", "0") == "1"

SYSTEM = (
    "You are WallaceAI, a sleek, friendly AI assistant built to help with coding and everyday tasks. "
    "You are especially strong in Lua (Roblox Luau, LOVE, Neovim, Lua 5.x) and Python (scripting, data, "
    "web, automation), and you also help with other languages, debugging, explanations, writing, planning "
    "and general questions. Give accurate, practical answers. Put code in fenced blocks with a language tag. "
    "Be concise unless the user wants depth, and say so honestly when you are unsure."
)

client = OpenAI(api_key=os.environ.get("API_KEY", "missing"), base_url=BASE_URL)  # any OpenAI-compatible provider
app = FastAPI()
# Database: free Neon Postgres in production (DATABASE_URL set), local SQLite file otherwise.
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    import psycopg2
    IntegrityError = psycopg2.IntegrityError

    def run(sql, params=(), one=False):
        con = psycopg2.connect(DATABASE_URL, connect_timeout=15)  # fresh connection: survives Neon sleeping
        try:
            with con, con.cursor() as cur:
                cur.execute(sql.replace("?", "%s"), params)
                return cur.fetchone() if one else None
        finally:
            con.close()
else:
    IntegrityError = sqlite3.IntegrityError
    _db = sqlite3.connect(DB_PATH, check_same_thread=False)

    def run(sql, params=(), one=False):
        cur = _db.execute(sql, params); _db.commit()
        return cur.fetchone() if one else None

run("CREATE TABLE IF NOT EXISTS users(email TEXT PRIMARY KEY, pw TEXT, created DOUBLE PRECISION)")
run("CREATE TABLE IF NOT EXISTS usage(k TEXT PRIMARY KEY, n INTEGER)")


# ---------- helpers ----------
def today(): return date.today().isoformat()

def count(k):
    r = run("SELECT n FROM usage WHERE k=?", (k,), one=True)
    return r[0] if r else 0

def bump(k):
    run("INSERT INTO usage(k,n) VALUES(?,1) ON CONFLICT(k) DO UPDATE SET n=usage.n+1", (k,))

def client_ip(req: Request):
    fwd = req.headers.get("x-forwarded-for")
    return (fwd.split(",")[0].strip() if fwd else req.client.host) or "?"

def sign(s): return hmac.new(SECRET.encode(), s.encode(), hashlib.sha256).hexdigest()

def make_token(email):
    body = base64.urlsafe_b64encode(f"{email}|{int(time.time()) + 30*86400}".encode()).decode()
    return f"{body}.{sign(body)}"

def current_user(req: Request):
    t = req.cookies.get("wsession", "")
    try:
        body, sig = t.split(".")
        if not hmac.compare_digest(sig, sign(body)): return None
        email, exp = base64.urlsafe_b64decode(body).decode().rsplit("|", 1)
        return email if int(exp) > time.time() else None
    except Exception:
        return None

def hash_pw(pw, salt=None):
    salt = salt or os.urandom(16)
    return salt.hex() + ":" + hashlib.scrypt(pw.encode(), salt=salt, n=2**14, r=8, p=1).hex()

def check_pw(pw, stored):
    salt, _ = stored.split(":")
    return hmac.compare_digest(hash_pw(pw, bytes.fromhex(salt)), stored)

def quota(req: Request):
    """Returns (key, used, limit)."""
    user = current_user(req)
    if user:
        return f"user:{user}:{today()}", count(f"user:{user}:{today()}"), MEMBER_DAILY
    aid = req.cookies.get("wanon") or ""
    key = f"anon:{aid}"
    used = count(key) if aid else 0
    if count(f"ip:{client_ip(req)}:{today()}") >= IP_DAILY_CAP:
        used = max(used, FREE_MESSAGES)
    return key, used, FREE_MESSAGES

def set_session(resp, email):
    resp.set_cookie("wsession", make_token(email), max_age=30*86400, httponly=True, samesite="lax", secure=SECURE)


# ---------- API ----------
@app.get("/api/status")
def status(req: Request):
    _, used, limit = quota(req)
    return {"remaining": max(0, limit - used), "signed_in": bool(current_user(req)), "email": current_user(req)}

class Auth(BaseModel):
    email: str
    password: str

@app.post("/api/signup")
def signup(a: Auth):
    email = a.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 200:
        return JSONResponse({"error": "Please enter a valid email."}, 400)
    if len(a.password) < 8:
        return JSONResponse({"error": "Password must be at least 8 characters."}, 400)
    try:
        run("INSERT INTO users VALUES(?,?,?)", (email, hash_pw(a.password), time.time()))
    except IntegrityError:
        return JSONResponse({"error": "That email already has an account. Try logging in."}, 409)
    resp = JSONResponse({"ok": True}); set_session(resp, email); return resp

@app.post("/api/login")
def login(a: Auth):
    email = a.email.strip().lower()
    r = run("SELECT pw FROM users WHERE email=?", (email,), one=True)
    if not r or not check_pw(a.password, r[0]):
        return JSONResponse({"error": "Wrong email or password."}, 401)
    resp = JSONResponse({"ok": True}); set_session(resp, email); return resp

@app.post("/api/logout")
def logout():
    resp = JSONResponse({"ok": True}); resp.delete_cookie("wsession"); return resp

class Msg(BaseModel):
    role: str
    content: str

class Chat(BaseModel):
    messages: list[Msg]

@app.post("/api/chat")
def chat(req: Request, body: Chat):
    key, used, limit = quota(req)
    if used >= limit:
        return JSONResponse({"error": "limit", "signed_in": bool(current_user(req))}, 402)
    msgs = [{"role": m.role, "content": m.content[:8000]} for m in body.messages[-8:]
            if m.role in ("user", "assistant") and m.content.strip()]
    if not msgs or msgs[-1]["role"] != "user":
        return JSONResponse({"error": "bad request"}, 400)

    if count(f"global:{today()}") >= GLOBAL_DAILY_CAP:
        return JSONResponse({"error": "capacity"}, 503)
    new_anon = None
    if not current_user(req):
        new_anon = req.cookies.get("wanon") or uuid.uuid4().hex
        key = f"anon:{new_anon}"
    bump(key); bump(f"ip:{client_ip(req)}:{today()}"); bump(f"global:{today()}")

    def gen():
        try:
            extra = {"reasoning_effort": "low"} if "gpt-oss" in MODEL else {}  # keeps replies fast
            stream = client.chat.completions.create(
                model=MODEL, max_tokens=2000, stream=True, extra_body=extra,
                messages=[{"role": "system", "content": SYSTEM}] + msgs)
            for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except RateLimitError:
            yield "\n\nWallaceAI is very busy right now. Please try again in a minute."
        except Exception:
            import traceback; traceback.print_exc()  # shows the real reason in Render > Logs
            yield "\n\nSorry, WallaceAI hit an error. Please try again."

    resp = StreamingResponse(gen(), media_type="text/plain; charset=utf-8")
    if new_anon:
        resp.set_cookie("wanon", new_anon, max_age=365*86400, httponly=True, samesite="lax", secure=SECURE)
    return resp


# ---------- frontend ----------
# If the website files were uploaded loose (no "static" folder), build the folder automatically.
if not os.path.isdir("static"):
    import shutil
    os.makedirs("static")
    for f in ("index.html", "app.js", "style.css", "logo.png"):
        if os.path.exists(f):
            shutil.copy(f, os.path.join("static", f))

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def index(): return FileResponse("static/index.html")
