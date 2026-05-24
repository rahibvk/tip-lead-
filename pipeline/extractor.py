"""
Gov-Ker Intelligence Engine — LLM Entity Extraction (Step 1)
Sends the raw narrative + interview transcript to OpenAI for dynamic entity extraction.
"""

import json
from openai import OpenAI


EXTRACTION_PROMPT = """You are a forensic intelligence analyst. Your job is to extract ALL entities and relationships from a police tip.

RULES:
1. Extract every entity mentioned: persons, vehicles, locations, phone numbers, organizations, substances, weapons, documents, timestamps, digital assets (crypto wallets, social media handles), etc.
2. DO NOT use a rigid schema. If you detect an entity type not in a standard list (e.g., "Drone", "Crypto Wallet", "Tattoo"), create it dynamically.
3. For each entity, extract ALL known attributes as key-value pairs.
4. For each relationship between entities, specify the source, target, type, and any detail.
5. Prioritize unique identifiers: license plates, phone numbers, names, addresses, Aadhaar numbers, account numbers. These are the most valuable.

Return a JSON object with this structure:
{
  "entities": [
    {
      "type": "Person",
      "attributes": {"name": "Jabbar", "age": 28, "description": "tall, brown, muscular", "address": "Padne Kavumthala"}
    },
    {
      "type": "Vehicle",
      "attributes": {"plate": "KL-07-AX-1234", "color": "white", "make": "Swift"}
    }
  ],
  "relationships": [
    {"from_name": "Jabbar", "to_name": "Unknown drug", "type": "USES", "detail": "suspected regular user"},
    {"from_name": "Jabbar", "to_name": "Padne Kavumthala", "type": "LIVES_AT"}
  ]
}

Extract as much as possible. If something is vague, still extract it with what you have."""


def extract_entities(raw_narrative: str, interview_transcript: list, client: OpenAI) -> dict:
    """
    Use OpenAI to extract entities and relationships from the tip.
    
    Args:
        raw_narrative: The user's original tip text.
        interview_transcript: List of {role, content} messages from the detective interview.
        client: OpenAI client instance.
    
    Returns:
        Dict with 'entities' and 'relationships' arrays.
    """
    # Build the full context from narrative + interview
    full_context = f"=== ORIGINAL TIP ===\n{raw_narrative}\n"
    
    if interview_transcript:
        full_context += "\n=== DETECTIVE INTERVIEW ===\n"
        for msg in interview_transcript:
            role_label = "Detective" if msg.get("role") == "assistant" else "Tipster"
            full_context += f"{role_label}: {msg.get('content', '')}\n"

    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.1,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": EXTRACTION_PROMPT},
                {"role": "user", "content": full_context}
            ]
        )
        
        result = json.loads(completion.choices[0].message.content)
        
        # Ensure expected structure
        if "entities" not in result:
            result["entities"] = []
        if "relationships" not in result:
            result["relationships"] = []
            
        return result
        
    except Exception as e:
        print(f"[Extractor] Error: {e}")
        return {"entities": [], "relationships": []}
