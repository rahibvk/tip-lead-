"""
Gov-Ker Intelligence Engine — Entity Resolution (Step 2)
Prevents duplicate nodes by comparing new entities against existing database labels
using TF-IDF + cosine similarity.
"""

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np


# Similarity threshold: if above this, map to existing label
SIMILARITY_THRESHOLD = 0.90


def resolve_entities(extracted: dict, existing_labels: list) -> dict:
    """
    Compare extracted entity labels against existing database labels.
    If a new label is semantically similar to an existing one (>90%), remap it.
    
    Args:
        extracted: Dict from extractor.py with 'entities' and 'relationships'.
        existing_labels: List of existing entity type labels from Neo4j 
                         (e.g., ["Vehicle", "Person", "Location"]).
    
    Returns:
        The same dict with entity types potentially remapped.
    """
    if not existing_labels or not extracted.get("entities"):
        return extracted
    
    # Build the mapping: new_label -> existing_label (or keep as-is)
    label_mapping = {}
    
    for entity in extracted["entities"]:
        entity_type = entity.get("type", "Unknown")
        
        if entity_type in label_mapping:
            # Already resolved this type
            entity["type"] = label_mapping[entity_type]
            continue
            
        if entity_type in existing_labels:
            # Exact match — no resolution needed
            label_mapping[entity_type] = entity_type
            continue
        
        # Run similarity check
        best_match = find_best_match(entity_type, existing_labels)
        
        if best_match:
            print(f"[Resolver] Mapping '{entity_type}' -> '{best_match}'")
            label_mapping[entity_type] = best_match
            entity["type"] = best_match
        else:
            # New label — keep as-is
            label_mapping[entity_type] = entity_type
    
    return extracted


def find_best_match(new_label: str, existing_labels: list) -> str | None:
    """
    Use TF-IDF + cosine similarity to find the best matching existing label.
    
    Args:
        new_label: The new entity type label to resolve.
        existing_labels: List of existing labels.
    
    Returns:
        The best matching existing label if similarity > threshold, else None.
    """
    all_labels = [new_label] + existing_labels
    
    try:
        vectorizer = TfidfVectorizer(analyzer='char_wb', ngram_range=(2, 4))
        tfidf_matrix = vectorizer.fit_transform(all_labels)
        
        # Compare the new label (index 0) against all existing labels
        similarities = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:])[0]
        
        max_idx = np.argmax(similarities)
        max_score = similarities[max_idx]
        
        if max_score >= SIMILARITY_THRESHOLD:
            return existing_labels[max_idx]
        
        return None
        
    except Exception as e:
        print(f"[Resolver] Similarity error: {e}")
        return None


def get_existing_labels(driver) -> list:
    """
    Query Neo4j for all existing node labels.
    
    Args:
        driver: Neo4j driver instance.
    
    Returns:
        List of label strings.
    """
    try:
        with driver.session() as session:
            result = session.run("CALL db.labels() YIELD label RETURN label")
            labels = [record["label"] for record in result]
            # Filter out internal labels
            skip = {"Device", "Tip", "_Bloom_Perspective_"}
            return [l for l in labels if l not in skip]
    except Exception as e:
        print(f"[Resolver] Failed to get labels: {e}")
        return []
