from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Iterable
from urllib.parse import parse_qs, urlparse

import fitz
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI
from youtube_transcript_api import YouTubeTranscriptApi


BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

app = Flask(__name__)
CORS(
    app,
    resources={
        r"/summarize/*": {
            "origins": [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "https://ai-summarizer-eta-one.vercel.app",

            ]
        }
    },
)


LENGTH_GUIDANCE = {
    "short": "Keep it concise in 2-3 sentences.",
    "medium": "Write a balanced summary in 1 short paragraph.",
    "detailed": "Write a more detailed summary in 2 short paragraphs.",
}

TONE_GUIDANCE = {
    "clear": "Use plain, easy-to-read language.",
    "bullet points": "Make the summary scannable and structured.",
    "executive": "Focus on high-level insights, outcomes, and decisions.",
}


def normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def split_sentences(text: str) -> list[str]:
    cleaned = normalize_whitespace(text)
    if not cleaned:
        return []
    parts = re.split(r"(?<=[.!?])\s+", cleaned)
    return [part.strip() for part in parts if part.strip()]


def truncate_for_model(text: str, limit: int = 12000) -> str:
    return text[:limit].strip()


def build_fallback_summary(text: str, length: str, tone: str) -> tuple[str, list[str], str]:
    sentences = split_sentences(text)
    if not sentences:
        raise ValueError("No readable content was found to summarize.")

    sentence_target = {"short": 2, "medium": 4, "detailed": 6}.get(length, 4)
    chosen = sentences[:sentence_target]

    if tone == "bullet points":
        summary = "\n".join(f"- {sentence}" for sentence in chosen)
    elif tone == "executive":
        summary = " ".join(chosen[: max(2, min(4, len(chosen)))])
    else:
        summary = " ".join(chosen)

    highlights = chosen[:3]
    return summary, highlights, "Local fallback"


def build_prompt(content: str, length: str, tone: str) -> str:
    return (
        "Summarize the following content.\n"
        f"Length instruction: {LENGTH_GUIDANCE.get(length, LENGTH_GUIDANCE['medium'])}\n"
        f"Tone instruction: {TONE_GUIDANCE.get(tone, TONE_GUIDANCE['clear'])}\n"
        "Return valid JSON with this exact shape:\n"
        '{"summary":"...", "highlights":["...", "...", "..."]}\n'
        "Keep highlights short and specific.\n\n"
        f"Content:\n{truncate_for_model(content)}"
    )


def summarize_content(text: str, *, length: str, tone: str) -> tuple[str, list[str], str]:
    if not text or not text.strip():
        raise ValueError("Please provide content to summarize.")

    if client is None:
        return build_fallback_summary(text, length, tone)

    prompt = build_prompt(text, length, tone)

    try:
        response = client.responses.create(
            model="gpt-4o-mini",
            input=[
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": "You are a precise assistant that summarizes long-form content.",
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": prompt}],
                },
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "summary_response",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "summary": {"type": "string"},
                            "highlights": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                        "required": ["summary", "highlights"],
                        "additionalProperties": False,
                    },
                }
            },
        )
        payload = response.output_parsed
        summary = normalize_whitespace(payload.get("summary", ""))
        highlights = [
            normalize_whitespace(item)
            for item in payload.get("highlights", [])
            if normalize_whitespace(item)
        ][:5]

        if not summary:
            raise ValueError("The model did not return a summary.")

        if not highlights:
            highlights = split_sentences(summary)[:3]

        return summary, highlights, "OpenAI gpt-4o-mini"
    except Exception:
        return build_fallback_summary(text, length, tone)


def build_response(
    *,
    summary: str,
    highlights: Iterable[str],
    label: str,
    mode: str,
    engine: str,
):
    return jsonify(
        {
            "summary": summary,
            "highlights": list(highlights),
            "source": {
                "label": label,
                "mode": mode,
                "engine": engine,
            },
        }
    )


def get_requested_style() -> tuple[str, str]:
    if request.is_json:
        payload = request.get_json(silent=True) or {}
    else:
        payload = request.form

    length = str(payload.get("length", "medium")).strip().lower() or "medium"
    tone = str(payload.get("tone", "clear")).strip().lower() or "clear"

    if length not in LENGTH_GUIDANCE:
        length = "medium"
    if tone not in TONE_GUIDANCE:
        tone = "clear"

    return length, tone


def extract_video_id(url: str) -> str | None:
    parsed = urlparse(url)

    if parsed.netloc in {"youtu.be"}:
        return parsed.path.lstrip("/") or None

    if "youtube.com" in parsed.netloc:
        if parsed.path == "/watch":
            return parse_qs(parsed.query).get("v", [None])[0]
        if parsed.path.startswith(("/shorts/", "/embed/")):
            return parsed.path.rstrip("/").split("/")[-1]

    return None


@app.get("/health")
def health_check():
    return jsonify(
        {
            "status": "ok",
            "modelEnabled": bool(client),
        }
    )


@app.post("/summarize/text")
def summarize_text():
    data = request.get_json(silent=True) or {}
    text = str(data.get("text", "")).strip()
    if len(text) < 20:
        return jsonify({"error": "Please provide at least a short passage to summarize."}), 400

    length, tone = get_requested_style()
    summary, highlights, engine = summarize_content(text, length=length, tone=tone)
    return build_response(
        summary=summary,
        highlights=highlights,
        label="Pasted text",
        mode="Text",
        engine=engine,
    )


@app.post("/summarize/pdf")
def summarize_pdf():
    file = request.files.get("file")
    if file is None or not file.filename:
        return jsonify({"error": "Please upload a PDF file."}), 400

    length, tone = get_requested_style()

    try:
        with fitz.open(stream=file.read(), filetype="pdf") as document:
            text = "\n".join(page.get_text("text") for page in document)
    except Exception:
        return jsonify({"error": "The uploaded file could not be read as a PDF."}), 400

    if not normalize_whitespace(text):
        return jsonify({"error": "No readable text was found in that PDF."}), 400

    summary, highlights, engine = summarize_content(text, length=length, tone=tone)
    return build_response(
        summary=summary,
        highlights=highlights,
        label=file.filename,
        mode="PDF",
        engine=engine,
    )


@app.post("/summarize/youtube")
def summarize_youtube():
    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()
    video_id = extract_video_id(url)

    if not video_id:
        return jsonify({"error": "Please enter a valid YouTube URL."}), 400

    length, tone = get_requested_style()

    try:
        transcript = YouTubeTranscriptApi.get_transcript(video_id)
    except Exception:
        return jsonify(
            {"error": "Could not load a transcript for that video. Try a video with captions."}
        ), 400

    text = " ".join(item.get("text", "") for item in transcript).strip()
    if not text:
        return jsonify({"error": "The video transcript was empty."}), 400

    summary, highlights, engine = summarize_content(text, length=length, tone=tone)
    return build_response(
        summary=summary,
        highlights=highlights,
        label=f"YouTube video ({video_id})",
        mode="YouTube",
        engine=engine,
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
