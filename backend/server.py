from fastapi import FastAPI, APIRouter, HTTPException, Header, UploadFile, File, Form
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import asyncio
import logging
import time
import hashlib
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Tuple, Dict
import uuid
import base64
import re
from datetime import datetime, timezone, timedelta
import bcrypt
import httpx
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent, TextDelta, StreamDone
from emergentintegrations.llm.openai import OpenAISpeechToText, OpenAITextToSpeech


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str


class UserPublic(BaseModel):
    user_id: str
    email: EmailStr
    name: str = ""
    age: str = ""
    pincode: str = ""
    country: str = "India"
    address: str = ""
    photo: Optional[str] = None
    language: str = "hi"
    theme: str = "light"
    notifications: bool = True
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_city: str = ""
    location_state: str = ""
    location_updated_at: Optional[datetime] = None


class AuthResponse(BaseModel):
    session_token: str
    user: UserPublic


class EmailAuthRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = ""


class GoogleSessionRequest(BaseModel):
    session_id: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = None
    address: Optional[str] = None
    photo: Optional[str] = None


class LocationUpdate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class PreferencesUpdate(BaseModel):
    language: Optional[str] = None
    theme: Optional[str] = None
    notifications: Optional[bool] = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    language: str = "hi"


class ChatResponse(BaseModel):
    reply: str
    language: str
    model_used: str


class ScanRequest(BaseModel):
    image_base64: str = Field(min_length=20)
    mime_type: str = "image/jpeg"
    language: str = "hi"
    plant_hint: str = Field(default="", max_length=100)


class ScanResponse(BaseModel):
    scan_id: str
    plant_name: str
    plant_category: str
    diagnosis: str
    confidence: str
    severity: str
    symptoms: List[str]
    causes: List[str]
    remedies: List[str]
    language: str
    model_used: str


class ScanHistoryItem(BaseModel):
    scan_id: str
    plant_name: str = ""
    plant_category: str = ""
    diagnosis: str
    confidence: str
    severity: str = ""
    symptoms: List[str]
    causes: List[str] = Field(default_factory=list)
    remedies: List[str]
    image_base64: str
    language: str
    created_at: datetime
    model_used: str = ""


class WeatherDay(BaseModel):
    date: str
    max_temp: float
    min_temp: float
    condition: str
    icon: str
    rain_chance: int


class WeatherResponse(BaseModel):
    location: str
    state: str
    current_temp: float
    current_humidity: int
    current_condition: str
    current_icon: str
    updated_at: datetime
    forecast: List[WeatherDay]


class MandiItem(BaseModel):
    commodity: str
    variety: str = ""
    market: str = ""
    state: str
    price_min: Optional[float] = None
    price_max: Optional[float] = None
    price_modal: float
    unit: str = "quintal"
    date: str
    source: str  # "live" or "msp"


class MandiResponse(BaseModel):
    state: str
    source: str  # "live" or "msp"
    updated_at: datetime
    items: List[MandiItem]


def public_user(document: dict) -> UserPublic:
    return UserPublic(
        user_id=document["user_id"],
        email=document["email"],
        name=document.get("name", ""),
        age=document.get("age", ""),
        pincode=document.get("pincode", ""),
        country=document.get("country", "India"),
        address=document.get("address", ""),
        photo=document.get("photo"),
        language=document.get("language", "hi"),
        theme=document.get("theme", "light"),
        notifications=document.get("notifications", True),
        latitude=document.get("latitude"),
        longitude=document.get("longitude"),
        location_city=document.get("location_city", ""),
        location_state=document.get("location_state", ""),
        location_updated_at=document.get("location_updated_at"),
    )


async def create_session(user_id: str) -> str:
    token = f"sess_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "created_at": now,
        "expires_at": now + timedelta(days=7),
    })
    return token


async def current_user(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization[7:].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Session expired")
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


AI_MODELS = (
    ("gemini", "gemini-3-flash-preview"),
    ("openai", "gpt-5.4"),
)


async def ai_text(prompt: str, session_id: str, image_base64: Optional[str] = None) -> Tuple[str, str]:
    key = os.getenv("EMERGENT_LLM_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="AI service is not configured")
    contents = [ImageContent(image_base64=image_base64)] if image_base64 else None
    last_error: Optional[Exception] = None
    for provider, model in AI_MODELS:
        chat = LlmChat(
            api_key=key,
            session_id=f"{session_id}_{provider}",
            system_message=(
                "You are KrishiAI, a practical agriculture expert for Indian farmers. "
                "Answer clearly and safely. Never claim certainty from a photo; advise a local agronomist for serious crop loss."
            ),
        ).with_model(provider, model)
        response = ""
        try:
            async with asyncio.timeout(60):
                async for event in chat.stream_message(UserMessage(text=prompt, file_contents=contents)):
                    if isinstance(event, TextDelta):
                        response += event.content
                    elif isinstance(event, StreamDone):
                        break
            if response.strip():
                return response.strip(), model
            raise RuntimeError("AI returned an empty response")
        except Exception as exc:
            last_error = exc
            logger.warning("AI model %s failed; trying fallback", model)
    raise HTTPException(status_code=502, detail="AI service is temporarily unavailable") from last_error


def parse_ai_list(value: str, fallback: List[str], limit: int = 3) -> List[str]:
    normalized = re.sub(r"\s+(?=\d+[.)]\s+)", "\n", value.strip())
    normalized = re.sub(r"\s+(?=[•]\s*)", "\n", normalized)
    items = []
    for part in normalized.splitlines():
        cleaned = re.sub(r"^[-•\d.) ]+", "", part).strip()
        if cleaned:
            items.append(cleaned)
    return items[:limit] or fallback

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "KrishiAI API is running"}


@api_router.post("/auth/signup", response_model=AuthResponse)
async def signup(input: EmailAuthRequest):
    email = str(input.email).lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = {
        "user_id": f"user_{uuid.uuid4().hex[:12]}",
        "email": email,
        "password_hash": bcrypt.hashpw(input.password.encode(), bcrypt.gensalt()).decode(),
        "name": input.name.strip(), "country": "India", "language": "hi", "theme": "light",
        "notifications": True, "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user)
    token = await create_session(user["user_id"])
    return AuthResponse(session_token=token, user=public_user(user))


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(input: EmailAuthRequest):
    user = await db.users.find_one({"email": str(input.email).lower()}, {"_id": 0})
    if not user or not user.get("password_hash") or not bcrypt.checkpw(input.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    token = await create_session(user["user_id"])
    return AuthResponse(session_token=token, user=public_user(user))


@api_router.post("/auth/session", response_model=AuthResponse)
async def google_session(input: GoogleSessionRequest):
    async with httpx.AsyncClient(timeout=20) as http:
        response = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": input.session_id},
        )
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Google session is invalid or expired")
    data = response.json()
    email = str(data.get("email", "")).lower()
    if not email:
        raise HTTPException(status_code=401, detail="Google account email was not returned")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    updates = {"name": data.get("name", ""), "photo": data.get("picture")}
    if user:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
        user = {**user, **updates}
    else:
        user = {"user_id": f"user_{uuid.uuid4().hex[:12]}", "email": email, **updates,
                "country": "India", "language": "hi", "theme": "light", "notifications": True,
                "created_at": datetime.now(timezone.utc)}
        await db.users.insert_one(user)
    token = await create_session(user["user_id"])
    return AuthResponse(session_token=token, user=public_user(user))


@api_router.get("/auth/me", response_model=UserPublic)
async def me(authorization: Optional[str] = Header(default=None)):
    return public_user(await current_user(authorization))


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": authorization[7:].strip()})
    return {"ok": True}


@api_router.patch("/profile", response_model=UserPublic)
async def update_profile(input: ProfileUpdate, authorization: Optional[str] = Header(default=None)):
    user = await current_user(authorization)
    updates = {key: value for key, value in input.model_dump().items() if value is not None}
    if updates.get("photo"):
        if not re.match(r"^data:image/(png|jpe?g|webp);base64,", updates["photo"], re.I):
            raise HTTPException(status_code=400, detail="Profile photo must be a base64 image")
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return public_user(fresh)


@api_router.patch("/preferences", response_model=UserPublic)
async def update_preferences(input: PreferencesUpdate, authorization: Optional[str] = Header(default=None)):
    user = await current_user(authorization)
    updates = {key: value for key, value in input.model_dump().items() if value is not None}
    if updates.get("language") not in (None, "hi", "en") or updates.get("theme") not in (None, "light", "dark"):
        raise HTTPException(status_code=400, detail="Unsupported preference")
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return public_user(fresh)


@api_router.post("/ai/chat", response_model=ChatResponse)
async def chat(input: ChatRequest, authorization: Optional[str] = Header(default=None)):
    user = await current_user(authorization)
    lang = "Hindi" if input.language == "hi" else "English"
    script_rule = "Write Hindi entirely in Devanagari script, not Romanized Hindi." if input.language == "hi" else ""
    prompt = (
        f"Reply in {lang}. Keep the answer practical and under 140 words unless the farmer asks for detail. "
        f"Use plain text without markdown bold markers. {script_rule} Farmer question: {input.message}"
    )
    reply, model_used = await ai_text(prompt, f"chat_{user['user_id']}")
    now = datetime.now(timezone.utc)
    await db.chat_messages.insert_many([
        {"user_id": user["user_id"], "role": "user", "content": input.message, "created_at": now},
        {"user_id": user["user_id"], "role": "assistant", "content": reply, "created_at": now, "model_used": model_used},
    ])
    return ChatResponse(reply=reply, language=input.language, model_used=model_used)


@api_router.post("/ai/scan", response_model=ScanResponse)
async def scan(input: ScanRequest, authorization: Optional[str] = Header(default=None)):
    user = await current_user(authorization)
    match = re.match(r"^data:image/(png|jpe?g|webp);base64,(.+)$", input.image_base64, re.I | re.S)
    raw = match.group(2) if match else input.image_base64
    try:
        decoded = base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image") from exc
    if len(decoded) > 8_000_000:
        raise HTTPException(status_code=413, detail="Image is too large")
    lang = "Hindi" if input.language == "hi" else "English"
    script_rule = "Write every value in Devanagari Hindi, never Romanized Hindi." if input.language == "hi" else "Write every value in English."
    plant_hint = input.plant_hint.strip()
    hint_rule = (
        f"The farmer says the plant is '{plant_hint}'. Use this as a strong identification hint, but mention uncertainty if the image clearly conflicts. "
        if plant_hint else "No plant name was supplied, so identify it conservatively from visible features. "
    )
    prompt = (
        f"Analyze this plant photo and reply in {lang} using exactly these English heading labels: "
        "Plant, Category, Diagnosis, Confidence, Severity, Symptoms, Causes, Remedies. "
        f"{script_rule} The plant can be a field crop, fruit, or vegetable, including Indian vegetables such as "
        "bitter gourd (karela), bottle gourd, tomato, potato, onion, brinjal, okra, chilli, cabbage, cauliflower, peas, and leafy greens. "
        f"{hint_rule}"
        "Identify the likely plant first, then distinguish disease, pest damage, nutrient deficiency, or normal growth. "
        "Category must be Vegetable, Field crop, Fruit, or Unknown. Severity must be Low, Medium, High, or Unknown, translated in the requested language. "
        "Give 2-3 visible symptoms, 1-3 likely causes, and 3 practical integrated remedies. Include safe cultural or organic action first; "
        "for chemicals, advise following the product label and local agriculture officer rather than inventing a dose. "
        "If the image is unclear, say uncertain and request a closer photo instead of guessing."
    )
    result, model_used = await ai_text(prompt, f"scan_{user['user_id']}_{uuid.uuid4().hex[:8]}", raw)
    cleaned = re.sub(r"\*\*", "", result)
    headings = list(re.finditer(r"(?im)^\s*(Plant|Category|Diagnosis|Confidence|Severity|Symptoms|Causes|Remedies)\s*:?[ \t]*", cleaned))
    sections = {}
    for index, heading in enumerate(headings):
        end = headings[index + 1].start() if index + 1 < len(headings) else len(cleaned)
        sections[heading.group(1).lower()] = cleaned[heading.end():end].strip()
    plant_name = " ".join(sections.get("plant", "").split())[:100] or ("अज्ञात पौधा" if input.language == "hi" else "Unknown plant")
    plant_category = " ".join(sections.get("category", "").split())[:80] or ("अज्ञात" if input.language == "hi" else "Unknown")
    diagnosis = " ".join(sections.get("diagnosis", "").split())[:240] or result[:180]
    confidence = " ".join(sections.get("confidence", "Needs review").split())[:80]
    severity = " ".join(sections.get("severity", "Needs review").split())[:80]
    symptoms = parse_ai_list(sections.get("symptoms", ""), ["Photo requires a closer field inspection"])
    causes = parse_ai_list(sections.get("causes", ""), ["A closer field inspection is needed to confirm the cause"])
    remedies = parse_ai_list(sections.get("remedies", ""), ["Remove visibly affected leaves", "Avoid overhead watering", "Consult a local agronomist"])
    scan_id = f"scan_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    stored_image = input.image_base64 if input.image_base64.startswith("data:image/") else f"data:{input.mime_type};base64,{raw}"
    await db.scan_history.insert_one({
        "scan_id": scan_id, "user_id": user["user_id"], "plant_name": plant_name, "plant_category": plant_category,
        "diagnosis": diagnosis, "confidence": confidence, "severity": severity, "symptoms": symptoms, "causes": causes,
        "remedies": remedies, "image_base64": stored_image, "language": input.language,
        "model_used": model_used, "created_at": now, "deleted_at": None,
    })
    return ScanResponse(
        scan_id=scan_id, plant_name=plant_name, plant_category=plant_category, diagnosis=diagnosis,
        confidence=confidence, severity=severity, symptoms=symptoms, causes=causes, remedies=remedies,
        language=input.language, model_used=model_used,
    )


@api_router.get("/scan/history", response_model=List[ScanHistoryItem])
async def scan_history(authorization: Optional[str] = Header(default=None)):
    user = await current_user(authorization)
    cursor = db.scan_history.find(
        {"user_id": user["user_id"], "deleted_at": None},
        {"_id": 0, "user_id": 0, "deleted_at": 0},
    ).sort("created_at", -1).limit(50)
    return [ScanHistoryItem(**doc) async for doc in cursor]


@api_router.delete("/scan/history/{scan_id}")
async def delete_scan(scan_id: str, authorization: Optional[str] = Header(default=None)):
    user = await current_user(authorization)
    result = await db.scan_history.update_one(
        {"scan_id": scan_id, "user_id": user["user_id"], "deleted_at": None},
        {"$set": {"deleted_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Scan not found")
    return {"ok": True}


# ---------------- Weather + Mandi ----------------
_geo_cache: Dict[str, dict] = {}
_reverse_geo_cache: Dict[str, dict] = {}
_weather_cache: Dict[str, Tuple[float, dict]] = {}
_mandi_cache: Dict[str, Tuple[float, dict]] = {}
DATA_GOV_KEY = os.getenv("DATA_GOV_API_KEY", "").strip()

WMO_MAP = {
    0: ("Clear sky", "sunny-outline"),
    1: ("Mainly clear", "partly-sunny-outline"),
    2: ("Partly cloudy", "partly-sunny-outline"),
    3: ("Overcast", "cloud-outline"),
    45: ("Fog", "cloudy-outline"), 48: ("Fog", "cloudy-outline"),
    51: ("Light drizzle", "rainy-outline"), 53: ("Drizzle", "rainy-outline"), 55: ("Heavy drizzle", "rainy-outline"),
    61: ("Light rain", "rainy-outline"), 63: ("Rain", "rainy-outline"), 65: ("Heavy rain", "rainy-outline"),
    71: ("Light snow", "snow-outline"), 73: ("Snow", "snow-outline"), 75: ("Heavy snow", "snow-outline"),
    80: ("Rain showers", "rainy-outline"), 81: ("Rain showers", "rainy-outline"), 82: ("Heavy showers", "thunderstorm-outline"),
    95: ("Thunderstorm", "thunderstorm-outline"), 96: ("Thunderstorm", "thunderstorm-outline"), 99: ("Severe thunderstorm", "thunderstorm-outline"),
}


def _wmo(code: int) -> Tuple[str, str]:
    return WMO_MAP.get(int(code), ("Fair", "partly-sunny-outline"))


async def geocode_pincode(pincode: str) -> Optional[dict]:
    if pincode in _geo_cache:
        return _geo_cache[pincode]
    try:
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "KrishiAI/1.0 (support@krishiai.app)"}) as http:
            response = await http.get(
                "https://nominatim.openstreetmap.org/search",
                params={"postalcode": pincode, "country": "India", "format": "json", "limit": 1, "addressdetails": 1},
            )
    except Exception:
        return None
    if response.status_code != 200:
        return None
    items = response.json()
    if not items:
        return None
    entry = items[0]
    address = entry.get("address", {})
    state = address.get("state") or "India"
    city = address.get("city") or address.get("town") or address.get("village") or address.get("county") or pincode
    city = re.sub(r"\s*\(.*?\)\s*", " ", city).replace(" Tahsil", "").replace(" Sub District", "").strip()
    info = {"lat": float(entry["lat"]), "lon": float(entry["lon"]), "city": city, "state": state}
    _geo_cache[pincode] = info
    return info


async def reverse_geocode_coordinates(latitude: float, longitude: float) -> Optional[dict]:
    cache_key = f"{latitude:.4f},{longitude:.4f}"
    if cache_key in _reverse_geo_cache:
        return _reverse_geo_cache[cache_key]
    try:
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "KrishiAI/1.0 (support@krishiai.app)"}) as http:
            response = await http.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={
                    "lat": latitude, "lon": longitude, "format": "jsonv2",
                    "addressdetails": 1, "accept-language": "en",
                },
            )
    except Exception:
        return None
    if response.status_code != 200:
        return None
    entry = response.json()
    address = entry.get("address", {})
    state = address.get("state") or address.get("region") or "India"
    city = (
        address.get("city") or address.get("town") or address.get("village")
        or address.get("municipality") or address.get("county") or "Current location"
    )
    info = {
        "lat": latitude,
        "lon": longitude,
        "city": city,
        "state": state,
        "pincode": address.get("postcode", ""),
        "country": address.get("country", "India"),
        "display_name": entry.get("display_name", ""),
    }
    _reverse_geo_cache[cache_key] = info
    return info


async def geo_for_user(user: dict) -> dict:
    latitude = user.get("latitude")
    longitude = user.get("longitude")
    if latitude is not None and longitude is not None:
        return {
            "lat": float(latitude), "lon": float(longitude),
            "city": user.get("location_city") or "Current location",
            "state": user.get("location_state") or "India",
        }
    pincode = (user.get("pincode") or "").strip() or "141001"
    return await geocode_pincode(pincode) or DEFAULT_GEO


DEFAULT_GEO = {"lat": 30.9034, "lon": 75.8286, "city": "Ludhiana", "state": "Punjab"}


@api_router.patch("/profile/location", response_model=UserPublic)
async def update_profile_location(input: LocationUpdate, authorization: Optional[str] = Header(default=None)):
    user = await current_user(authorization)
    latitude = round(input.latitude, 6)
    longitude = round(input.longitude, 6)
    geo = await reverse_geocode_coordinates(latitude, longitude)
    updates = {
        "latitude": latitude,
        "longitude": longitude,
        "location_updated_at": datetime.now(timezone.utc),
    }
    if geo:
        updates.update({
            "location_city": geo["city"],
            "location_state": geo["state"],
            "country": geo["country"],
        })
        if geo.get("pincode"):
            updates["pincode"] = geo["pincode"]
        if geo.get("display_name"):
            updates["address"] = geo["display_name"][:500]
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return public_user(fresh)


@api_router.get("/weather", response_model=WeatherResponse)
async def weather(authorization: Optional[str] = Header(default=None)):
    user = await current_user(authorization)
    geo = await geo_for_user(user)
    cache_key = f"gps:{geo['lat']:.3f},{geo['lon']:.3f}" if user.get("latitude") is not None else f"pin:{(user.get('pincode') or '141001').strip()}"
    now = time.time()
    cached = _weather_cache.get(cache_key)
    if cached and cached[0] > now:
        return WeatherResponse(**cached[1])
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            response = await http.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": geo["lat"], "longitude": geo["lon"],
                    "current": "temperature_2m,relative_humidity_2m,weather_code",
                    "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
                    "timezone": "auto", "forecast_days": 3,
                },
            )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Weather service is temporarily unavailable") from exc
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Weather service is temporarily unavailable")
    data = response.json()
    current = data.get("current", {})
    daily = data.get("daily", {})
    cond, icon = _wmo(current.get("weather_code", 1))
    forecast: List[WeatherDay] = []
    for index, date_str in enumerate(daily.get("time", [])):
        code = daily["weather_code"][index]
        day_cond, day_icon = _wmo(code)
        forecast.append(WeatherDay(
            date=date_str,
            max_temp=float(daily["temperature_2m_max"][index]),
            min_temp=float(daily["temperature_2m_min"][index]),
            condition=day_cond, icon=day_icon,
            rain_chance=int(daily["precipitation_probability_max"][index] or 0),
        ))
    payload = {
        "location": geo["city"], "state": geo["state"],
        "current_temp": float(current.get("temperature_2m", 0)),
        "current_humidity": int(current.get("relative_humidity_2m", 0)),
        "current_condition": cond, "current_icon": icon,
        "updated_at": datetime.now(timezone.utc),
        "forecast": [day.model_dump() for day in forecast],
    }
    _weather_cache[cache_key] = (now + 1800, payload)
    return WeatherResponse(**payload)


# Official Government of India MSP (Minimum Support Price) — Rabi 2025-26 and Kharif 2025-26
MSP_ITEMS = [
    {"commodity": "Wheat", "variety": "", "price_modal": 2425.0},
    {"commodity": "Paddy", "variety": "Common", "price_modal": 2369.0},
    {"commodity": "Paddy", "variety": "Grade A", "price_modal": 2389.0},
    {"commodity": "Maize", "variety": "", "price_modal": 2400.0},
    {"commodity": "Bajra", "variety": "", "price_modal": 2775.0},
    {"commodity": "Jowar", "variety": "Hybrid", "price_modal": 3699.0},
    {"commodity": "Ragi", "variety": "", "price_modal": 4886.0},
    {"commodity": "Cotton", "variety": "Long Staple", "price_modal": 8110.0},
    {"commodity": "Cotton", "variety": "Medium Staple", "price_modal": 7710.0},
    {"commodity": "Tur/Arhar", "variety": "", "price_modal": 8000.0},
    {"commodity": "Moong", "variety": "", "price_modal": 8768.0},
    {"commodity": "Urad", "variety": "", "price_modal": 7800.0},
    {"commodity": "Groundnut", "variety": "", "price_modal": 7263.0},
    {"commodity": "Soyabean", "variety": "", "price_modal": 5328.0},
    {"commodity": "Sunflower", "variety": "", "price_modal": 7721.0},
    {"commodity": "Gram", "variety": "", "price_modal": 5650.0},
    {"commodity": "Masur", "variety": "", "price_modal": 6700.0},
    {"commodity": "Mustard", "variety": "", "price_modal": 5950.0},
]


async def _fetch_live_mandi(state: str) -> List[dict]:
    if not DATA_GOV_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            response = await http.get(
                "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070",
                params={"api-key": DATA_GOV_KEY, "format": "json", "limit": 30, "filters[state]": state},
            )
    except Exception:
        return []
    if response.status_code != 200:
        return []
    records = response.json().get("records", []) or []
    live: List[dict] = []
    for record in records[:12]:
        try:
            modal = float(record.get("modal_price") or 0)
        except (ValueError, TypeError):
            continue
        if not modal:
            continue
        live.append({
            "commodity": record.get("commodity", ""), "variety": record.get("variety", "") or "",
            "market": record.get("market", "") or "", "state": record.get("state", state),
            "price_min": float(record.get("min_price") or 0) or None,
            "price_max": float(record.get("max_price") or 0) or None,
            "price_modal": modal, "unit": "quintal",
            "date": record.get("arrival_date") or datetime.now(timezone.utc).date().isoformat(),
            "source": "live",
        })
    return live


@api_router.get("/mandi", response_model=MandiResponse)
async def mandi(authorization: Optional[str] = Header(default=None)):
    user = await current_user(authorization)
    geo = await geo_for_user(user)
    state = geo["state"]
    now = time.time()
    cache_key = f"state:{state}"
    cached = _mandi_cache.get(cache_key)
    if cached and cached[0] > now:
        return MandiResponse(**cached[1])
    live_items = await _fetch_live_mandi(state)
    if live_items:
        payload = {"state": state, "source": "live", "updated_at": datetime.now(timezone.utc), "items": live_items}
    else:
        today = datetime.now(timezone.utc).date().isoformat()
        items = [{**item, "state": state, "date": today, "source": "msp", "unit": "quintal", "market": "MSP"} for item in MSP_ITEMS]
        payload = {"state": state, "source": "msp", "updated_at": datetime.now(timezone.utc), "items": items}
    _mandi_cache[cache_key] = (now + 1800, payload)
    return MandiResponse(**payload)


# ---------------- Voice Chat (Whisper + TTS) ----------------
_stt_client: Optional[OpenAISpeechToText] = None
_tts_client: Optional[OpenAITextToSpeech] = None
_tts_cache: Dict[str, Tuple[float, bytes]] = {}  # key -> (expires_at, mp3 bytes)
_TTS_CACHE_TTL = 60 * 60  # 1 hour
STT_ALLOWED = {
    "audio/mp4": ".m4a", "audio/m4a": ".m4a", "audio/x-m4a": ".m4a",
    "audio/aac": ".aac", "audio/wav": ".wav", "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/webm": ".webm",
    "video/mp4": ".mp4", "video/webm": ".webm",
}
STT_MAX_BYTES = 20 * 1024 * 1024


def _get_stt() -> OpenAISpeechToText:
    global _stt_client
    if _stt_client is None:
        key = os.getenv("EMERGENT_LLM_KEY", "")
        if not key:
            raise HTTPException(status_code=503, detail="AI service is not configured")
        _stt_client = OpenAISpeechToText(api_key=key)
    return _stt_client


def _get_tts() -> OpenAITextToSpeech:
    global _tts_client
    if _tts_client is None:
        key = os.getenv("EMERGENT_LLM_KEY", "")
        if not key:
            raise HTTPException(status_code=503, detail="AI service is not configured")
        _tts_client = OpenAITextToSpeech(api_key=key)
    return _tts_client


def _clean_for_tts(text: str) -> str:
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"`{1,3}[^`]*`{1,3}", "", text)
    text = re.sub(r"[*_#>~|]", "", text)
    return re.sub(r"\s+", " ", text).strip()[:4000]


async def _synthesize(text: str, voice: str, language: str) -> str:
    cleaned = _clean_for_tts(text)
    if not cleaned:
        raise HTTPException(status_code=400, detail="Empty text for speech")
    key = hashlib.sha256(f"{cleaned}|{voice}|tts-1|mp3".encode()).hexdigest()[:24]
    now = time.time()
    cached = _tts_cache.get(key)
    if not cached or cached[0] <= now:
        try:
            audio_bytes = await _get_tts().generate_speech(text=cleaned, model="tts-1", voice=voice, response_format="mp3")
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Speech synthesis failed") from exc
        _tts_cache[key] = (now + _TTS_CACHE_TTL, audio_bytes)
        # Housekeeping: purge expired entries so memory stays flat
        expired = [entry_key for entry_key, (exp, _) in _tts_cache.items() if exp <= now]
        for entry_key in expired:
            _tts_cache.pop(entry_key, None)
    return key


class VoiceChatResponse(BaseModel):
    transcript: str
    reply: str
    audio_url: str
    language: str
    model_used: str


@api_router.post("/ai/voice-chat", response_model=VoiceChatResponse)
async def voice_chat(
    audio: UploadFile = File(...),
    language: Optional[str] = Form(default=None),
    authorization: Optional[str] = Header(default=None),
):
    user = await current_user(authorization)
    lang_code = (language or user.get("language") or "hi").strip().lower()
    if lang_code not in ("hi", "en"):
        lang_code = "hi"
    suffix = STT_ALLOWED.get((audio.content_type or "").lower())
    if not suffix:
        raise HTTPException(status_code=415, detail="Use m4a/mp4/aac/wav/mp3/webm audio")
    data = await audio.read(STT_MAX_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio recording")
    if len(data) > STT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Recording must be under 20 MB")

    try:
        # OpenAI SDK requires bytes/IOBase/PathLike/tuple — pass a tuple with real bytes.
        file_arg = (f"recording{suffix}", data, audio.content_type or "application/octet-stream")
        transcription = await _get_stt().transcribe(file=file_arg, model="whisper-1", language=lang_code)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not transcribe your voice, please try again") from exc

    transcript = ""
    if isinstance(transcription, dict):
        transcript = str(transcription.get("text", "")).strip()
    else:
        transcript = str(getattr(transcription, "text", "") or transcription).strip()
    if not transcript:
        raise HTTPException(status_code=422, detail="No speech detected — please try recording again")

    lang_full = "Hindi" if lang_code == "hi" else "English"
    prompt = f"Reply in {lang_full}. Keep it under 90 words. Farmer question: {transcript}"
    reply, model_used = await ai_text(prompt, f"voice_{user['user_id']}")

    now = datetime.now(timezone.utc)
    await db.chat_messages.insert_many([
        {"user_id": user["user_id"], "role": "user", "content": transcript, "created_at": now, "modality": "voice"},
        {"user_id": user["user_id"], "role": "assistant", "content": reply, "created_at": now, "modality": "voice", "model_used": model_used},
    ])

    voice_name = "nova" if lang_code == "hi" else "alloy"
    audio_key = await _synthesize(reply, voice_name, lang_code)
    return VoiceChatResponse(transcript=transcript, reply=reply, audio_url=f"/api/ai/voice/{audio_key}.mp3", language=lang_code, model_used=model_used)


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=3000)
    language: str = "hi"


class TTSResponse(BaseModel):
    audio_url: str


@api_router.post("/ai/tts", response_model=TTSResponse)
async def tts(input: TTSRequest, authorization: Optional[str] = Header(default=None)):
    await current_user(authorization)
    lang_code = input.language if input.language in ("hi", "en") else "hi"
    voice_name = "nova" if lang_code == "hi" else "alloy"
    audio_key = await _synthesize(input.text, voice_name, lang_code)
    return TTSResponse(audio_url=f"/api/ai/voice/{audio_key}.mp3")


@api_router.get("/ai/voice/{key}.mp3")
async def voice_audio(key: str):
    entry = _tts_cache.get(key)
    if not entry or entry[0] <= time.time():
        raise HTTPException(status_code=404, detail="Audio expired, please regenerate")
    return Response(
        content=entry[1],
        media_type="audio/mpeg",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


@app.on_event("startup")
async def create_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.scan_history.create_index([("user_id", 1), ("created_at", -1)])
