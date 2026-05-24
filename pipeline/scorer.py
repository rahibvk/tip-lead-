"""
Gov-Ker Intelligence Engine — Confidence Scoring (Step 3)
Assigns confidence_weight (0.0 - 1.0) to each relationship based on the 
quality of the connected entities.
"""

import re


# --- Confidence Rules ---
# Higher weight = more actionable / unique identifier
ATTRIBUTE_WEIGHTS = {
    # Unique identifiers (0.85 - 0.95)
    "plate": 0.95,
    "license_plate": 0.95,
    "aadhaar": 0.95,
    "phone": 0.90,
    "phone_number": 0.90,
    "mobile": 0.90,
    "email": 0.90,
    "account_number": 0.90,
    "pan": 0.90,
    "passport": 0.90,
    "social_media": 0.85,
    "crypto_wallet": 0.85,
    
    # Strong identifiers (0.70 - 0.84)
    "name": 0.80,
    "full_name": 0.85,
    "address": 0.80,
    "make": 0.75,
    "model": 0.75,
    
    # Medium identifiers (0.40 - 0.69)
    "age": 0.60,
    "occupation": 0.55,
    "tattoo": 0.65,
    "scar": 0.65,
    
    # Weak / vague identifiers (0.20 - 0.39)
    "description": 0.40,
    "color": 0.35,
    "height": 0.35,
    "build": 0.30,
    "clothing": 0.25,
    "hair": 0.25,
}


def score_relationships(extracted: dict) -> dict:
    """
    Assign confidence_weight to each relationship based on the connected entities.
    
    The score is calculated as the average of the best attribute weights
    from both the source and target entities.
    
    Args:
        extracted: Dict with 'entities' and 'relationships'.
    
    Returns:
        Same dict with confidence_weight added to each relationship.
    """
    # Build a name -> entity lookup for quick access
    entity_lookup = {}
    for entity in extracted.get("entities", []):
        attrs = entity.get("attributes", {})
        # Use the first identifying attribute as the key
        name = attrs.get("name") or attrs.get("plate") or attrs.get("label") or str(attrs)
        entity_lookup[name.lower() if isinstance(name, str) else str(name)] = entity
    
    for rel in extracted.get("relationships", []):
        from_name = (rel.get("from_name") or "").lower()
        to_name = (rel.get("to_name") or "").lower()
        
        from_entity = entity_lookup.get(from_name)
        to_entity = entity_lookup.get(to_name)
        
        from_score = _score_entity(from_entity) if from_entity else 0.2
        to_score = _score_entity(to_entity) if to_entity else 0.2
        
        # The relationship confidence is the average of both sides
        # weighted slightly toward the stronger side
        confidence = (max(from_score, to_score) * 0.6) + (min(from_score, to_score) * 0.4)
        
        # Clamp to 0.0 - 1.0
        rel["confidence_weight"] = round(min(max(confidence, 0.0), 1.0), 3)
    
    return extracted


def _score_entity(entity: dict) -> float:
    """
    Calculate the confidence score for a single entity based on its attributes.
    Returns the highest attribute weight found, with a bonus for having multiple.
    """
    attrs = entity.get("attributes", {})
    
    if not attrs:
        return 0.2
    
    scores = []
    for key, value in attrs.items():
        key_lower = key.lower()
        
        # Check if the value looks like a real identifier (not empty/vague)
        if not value or (isinstance(value, str) and value.strip().lower() in ["unknown", "n/a", "not sure", "idk", "dont know", "i don't know"]):
            continue
        
        # Check direct key match
        if key_lower in ATTRIBUTE_WEIGHTS:
            scores.append(ATTRIBUTE_WEIGHTS[key_lower])
        else:
            # Check if value contains patterns that indicate uniqueness
            if isinstance(value, str):
                if re.match(r'[A-Z]{2}[-\s]?\d{2}[-\s]?[A-Z]{1,3}[-\s]?\d{1,4}', value, re.IGNORECASE):
                    scores.append(0.95)  # License plate pattern
                elif re.match(r'\d{10,12}', value):
                    scores.append(0.90)  # Phone / Aadhaar pattern
                elif re.match(r'[a-zA-Z0-9._%+-]+@', value):
                    scores.append(0.90)  # Email pattern
                else:
                    scores.append(0.30)  # Generic text attribute
            else:
                scores.append(0.30)
    
    if not scores:
        return 0.2
    
    # Best score + small bonus for having multiple attributes
    best = max(scores)
    bonus = min(len(scores) * 0.02, 0.1)  # Up to +0.1 for many attributes
    
    return min(best + bonus, 1.0)
