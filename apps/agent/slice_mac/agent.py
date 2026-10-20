"""The Mac agent: one Gemini Live voice model with Mac and Qloo tools."""

from __future__ import annotations

import os

from google.adk.agents import Agent
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.models import Gemini
from google.genai import types

from .tools import TOOLS

# Checked 2026-10-20: the project serves gemini-3.8-live (Google's default Live model) and
# gemini-live-2.5-flash-native-audio, only from us-central1, not `global` (where the rest of
# apps/agent runs). gemini-3.8-live-extended-thinking isn't on the project.
LIVE_MODEL = os.environ.get("MAC_LIVE_MODEL", "gemini-3.8-live")
LIVE_LOCATION = os.environ.get("MAC_LIVE_LOCATION", "us-central1")
VOICE = os.environ.get("MAC_VOICE", "Aoede")

INSTRUCTION = """\
You are Slice, a personal agent that lives in the notch of the user's Mac. You
can see what they're looking at and act on their computer. What sets you apart
is taste: you know culture (music, film, food, places, books, brands) through
Qloo's taste graph, and you choose things the way a friend with great taste
who knows them would, never generic top-rated picks.

How you talk:
- You speak out loud, so keep replies short: one or two sentences, warm and plain.
- Say what you're doing before a tool that takes a moment ("Let me look").
- Never read out ids, URLs or lists longer than three items.

How you work:
- When the user says "this" or "here", call look_at_frontmost_app first.
- Before recommending from something they like, find it with find_in_taste_graph.
- Ask before anything that spends money, sends a message or can't be undone.
- Never make more than two tool calls in a row without saying something to the user.
"""


def build_agent() -> Agent:
    return Agent(
        name="slice_mac",
        model=Gemini(model=LIVE_MODEL, client_kwargs={"location": LIVE_LOCATION}),
        instruction=INSTRUCTION,
        tools=TOOLS,
    )


def live_run_config() -> RunConfig:
    return RunConfig(
        streaming_mode=StreamingMode.BIDI,
        response_modalities=[types.Modality.AUDIO],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE))
        ),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        # Push-to-talk: the Mac marks where speech starts and ends (fn + control held),
        # so the model's own voice detection is off.
        realtime_input_config=types.RealtimeInputConfig(
            automatic_activity_detection=types.AutomaticActivityDetection(disabled=True)
        ),
        context_window_compression=types.ContextWindowCompressionConfig(sliding_window=types.SlidingWindow()),
    )
