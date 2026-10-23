#!/usr/bin/env python3
"""Сервер: раздаёт фронтенд (папка static/) и проксирует улучшение фото в OpenRouter.
Ключ OPENROUTER_API_KEY остаётся на сервере и никогда не попадает в браузер.
Модели пробуются по очереди: если первая отказала или упала — запрос уходит во вторую.

Запуск:  uvicorn server:app --reload --port 8000   →   http://localhost:8000
"""
import base64
import io
import os

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
API_URL = "https://openrouter.ai/api/v1/images"
PROMPT = (
    "сделай фото на документы из этого фото. увеличь детализацию, осветли, фон белый. "
    "убери лишние элементы на фоне. тон кожи светлее. сохрани узнаваемыми черты лица, "
    "и не меняй одежду. не приближай кадр"
)

# Порядок важен: сначала основная модель, дальше запасные. Можно переопределить в .env
PRIMARY_MODEL = os.getenv("ENHANCE_MODEL", "openai/gpt-image-2.5-sunburst")
FALLBACK_MODEL = os.getenv("ENHANCE_FALLBACK_MODEL", "google/gemini-nano-banana-2.1")
MODELS = [m for m in (PRIMARY_MODEL, FALLBACK_MODEL) if m]

MAX_UPLOAD = 15 * 1024 * 1024   # максимальный размер загружаемого файла, байт
MAX_SIDE = 2048                 # максимальная сторона перед отправкой, px
JPEG_QUALITY = 95
RESOLUTION = os.getenv("ENHANCE_RESOLUTION", "2K")   # для Gemini: 1K / 2K / 4K (чем выше, тем дороже)
TIMEOUT = 120                   # на одну модель, сек

# aspect_ratio, которые принимает Gemini (нестандартное значение он отклоняет)
GEMINI_RATIOS = ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"]

app = FastAPI()


def prepare(raw: bytes) -> tuple[str, tuple[int, int]]:
    """Уменьшает изображение, сжимает в JPEG, кодирует в data URL. Возвращает (url, (w, h))."""
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "Не удалось прочитать изображение")
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    url = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    return url, img.size


def closest_ratio(w: int, h: int) -> str:
    def val(r):
        a, b = r.split(":")
        return int(a) / int(b)
    return min(GEMINI_RATIOS, key=lambda r: abs(val(r) - w / h))


def build_payload(model: str, data_url: str, size: tuple[int, int]) -> dict:
    payload = {
        "model": model,
        "prompt": PROMPT,
        "input_references": [{"type": "image_url", "image_url": {"url": data_url}}],
    }
    if model.startswith("google/"):
        # Gemini принимает только свои параметры: quality/output_format ему слать нельзя
        payload["aspect_ratio"] = closest_ratio(*size)   # сохраняем пропорции кадра
        payload["n"] = 1
        if RESOLUTION:
            payload["resolution"] = RESOLUTION
    else:
        payload["quality"] = "high"
        payload["output_format"] = "png"
    return payload


class ModelFailed(Exception):
    def __init__(self, msg: str, fatal: bool = False):
        super().__init__(msg)
        self.fatal = fatal   # fatal — причина в ключе, запасная модель не поможет


def call_model(model: str, data_url: str, size: tuple[int, int]) -> tuple[bytes, str]:
    headers = {"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"}
    try:
        r = requests.post(API_URL, headers=headers, json=build_payload(model, data_url, size), timeout=TIMEOUT)
    except requests.exceptions.Timeout:
        raise ModelFailed("таймаут")
    except requests.exceptions.RequestException as e:
        raise ModelFailed(f"ошибка соединения: {e}")

    if r.status_code == 401:
        raise ModelFailed("неверный OPENROUTER_API_KEY", fatal=True)
    if r.status_code != 200:
        raise ModelFailed(f"HTTP {r.status_code}: {r.text[:200]}")

    try:
        items = r.json().get("data")
    except ValueError:
        raise ModelFailed("ответ не JSON")
    if not items or not items[0].get("b64_json"):
        raise ModelFailed("модель не вернула изображение (вероятно, отказ)")   # отказ без ошибки
    return base64.b64decode(items[0]["b64_json"]), items[0].get("media_type") or "image/png"


@app.post("/api/enhance")
async def enhance_endpoint(request: Request):
    if not OPENROUTER_API_KEY:
        raise HTTPException(500, "На сервере не задан OPENROUTER_API_KEY (.env)")
    raw = await request.body()
    if not raw:
        raise HTTPException(400, "Пустой запрос")
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(413, "Файл слишком большой")

    data_url, size = prepare(raw)
    errors = []
    for model in MODELS:
        try:
            img, media = call_model(model, data_url, size)
            print(f"[enhance] готово: {model}" + (f" (после сбоя: {'; '.join(errors)})" if errors else ""))
            return Response(content=img, media_type=media, headers={"X-Enhance-Model": model})
        except ModelFailed as e:
            print(f"[enhance] {model}: {e}")
            errors.append(f"{model}: {e}")
            if e.fatal:
                break
    raise HTTPException(502, "Не удалось улучшить фото. " + " | ".join(errors))


# фронтенд — только из папки static/ (server.py и .env наружу не отдаются)
app.mount("/", StaticFiles(directory="static", html=True), name="static")
