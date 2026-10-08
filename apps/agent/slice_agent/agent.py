from google.adk.agents import LlmAgent

# Gemini 3.8 Flash is only served from the `global` location (set in .env).
MODEL = "gemini-3.8-flash"

# Placeholder: Qloo tools, catalog matching and grounding rules come next.
root_agent = LlmAgent(
    name="slice_concierge",
    model=MODEL,
    description="Taste-aware shopping concierge for Slice merchants.",
    instruction="You are Slice, a friendly shopping concierge. Keep answers short.",
)
