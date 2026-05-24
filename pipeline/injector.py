"""
Gov-Ker Intelligence Engine — Graph Injection (Step 4)
Injects the processed, resolved, and scored entities into Neo4j using dynamic MERGE operations.
"""

from neo4j import Driver

def inject_to_neo4j(payload: dict, processed_data: dict, driver: Driver) -> dict:
    """
    Inject the tip and its extracted entities into Neo4j using MERGE statements.
    
    Args:
        payload: Original JSON payload from Node.js (tip_id, device_hash, etc.)
        processed_data: Dict with 'entities' and 'relationships' (after scoring).
        driver: Neo4j driver instance.
        
    Returns:
        Dict with injection stats.
    """
    stats = {"nodes_merged": 0, "edges_merged": 0}
    
    with driver.session() as session:
        # 1. Base Tip Architecture
        session.execute_write(_merge_base_tip, payload)
        
        # 2. Extract and Inject Entities
        entity_name_map = {} # Map 'name' -> internal Neo4j ID or key for relationship building
        for entity in processed_data.get("entities", []):
            label = entity.get("type", "Unknown").replace(" ", "_").replace("-", "")
            if not label.isalnum():
                label = "Entity"
                
            attrs = entity.get("attributes", {})
            name = attrs.get("name") or attrs.get("plate") or str(attrs.get("id", len(entity_name_map)))
            
            if name:
                session.execute_write(_merge_dynamic_entity, payload["tip_id"], label, attrs)
                entity_name_map[str(name).lower()] = {"label": label, "attrs": attrs}
                stats["nodes_merged"] += 1
                
        # 3. Inject Relationships
        for rel in processed_data.get("relationships", []):
            from_name = str(rel.get("from_name", "")).lower()
            to_name = str(rel.get("to_name", "")).lower()
            rel_type = str(rel.get("type", "RELATED_TO")).upper().replace(" ", "_").replace("-", "_")
            if not rel_type.isalnum() and "_" not in rel_type:
                 rel_type = "RELATED_TO"
                 
            confidence = rel.get("confidence_weight", 0.2)
            detail = rel.get("detail", "")
            
            if from_name in entity_name_map and to_name in entity_name_map:
                from_data = entity_name_map[from_name]
                to_data = entity_name_map[to_name]
                
                # To merge a relationship between two nodes, we must match them exactly as they were created
                session.execute_write(
                    _merge_dynamic_relationship, 
                    from_data, 
                    to_data, 
                    rel_type, 
                    confidence, 
                    detail
                )
                stats["edges_merged"] += 1
                
    return stats


def _merge_base_tip(tx, payload: dict):
    """
    Creates the (Device)-[:SUBMITTED]->(Tip)-[:OCCURRED_AT]->(Location) backbone.
    """
    tip_id = payload.get("tip_id")
    device_hash = payload.get("device_hash")
    geohash = payload.get("geohash")
    timestamp = payload.get("timestamp")
    narrative = payload.get("rawNarrative")
    
    # Optional image handling - storing count or first base64 (simplified for MVP)
    images = payload.get("images", [])
    has_images = len(images) > 0
    image_preview = images[0][:100] + "..." if has_images else None

    query = f"""
    // 1. Ensure the anonymous device exists
    MERGE (d:Device {{hash: $device_hash}})
    
    // 2. Create the unique Tip event
    MERGE (t:Tip {{id: $tip_id}})
    SET t.timestamp = $timestamp,
        t.narrative = $narrative,
        t.has_images = $has_images,
        t.image_preview = $image_preview
        
    // Connect Device to Tip
    MERGE (d)-[:SUBMITTED]->(t)
    """
    
    params = {
        "device_hash": device_hash,
        "tip_id": tip_id,
        "timestamp": timestamp,
        "narrative": narrative,
        "has_images": has_images,
        "image_preview": image_preview
    }
    
    tx.run(query, **params)
    
    # 3. Merge Location if geohash is present
    if geohash:
         loc_query = """
         MATCH (t:Tip {id: $tip_id})
         MERGE (loc:Location {geohash: $geohash})
         MERGE (t)-[:OCCURRED_AT]->(loc)
         """
         tx.run(loc_query, tip_id=tip_id, geohash=geohash)


def _merge_dynamic_entity(tx, tip_id: str, label: str, attrs: dict):
    """
    Merges a dynamic entity and connects it to the Tip node.
    """
    # Cypher requires labels to be injected directly (cannot be parameterized)
    # We sanitized 'label' earlier to ensure it's alphanumeric
    
    # We need a primary key to MERGE on.
    # For MVP, we'll try to find a unique identifier or fall back to the most prominent attribute
    merge_key = "name"
    for k in ["plate", "license_plate", "phone", "email", "aadhaar", "account_number", "id", "name"]:
        if k in attrs:
            merge_key = k
            break
            
    if not attrs:
         return
         
    merge_val = attrs.get(merge_key, "Unknown")
    
    # Build SET clause for remaining attributes dynamically
    set_clauses = []
    for k, v in attrs.items():
         if k != merge_key:
              # Basic sanitization of keys
              clean_key = "".join(c for c in str(k) if c.isalnum() or c == "_")
              if clean_key:
                  set_clauses.append(f"e.{clean_key} = ${clean_key}")
                  
    set_str = ("SET " + ", ".join(set_clauses)) if set_clauses else ""
    
    query = f"""
    MATCH (t:Tip {{id: $tip_id}})
    MERGE (e:{label} {{{merge_key}: $merge_val}})
    {set_str}
    MERGE (t)-[:MENTIONS]->(e)
    """
    
    params = {"tip_id": tip_id, "merge_val": merge_val}
    # Add the remaining attributes to params
    for k, v in attrs.items():
         if k != merge_key:
              clean_key = "".join(c for c in str(k) if c.isalnum() or c == "_")
              if clean_key:
                  params[clean_key] = v

    tx.run(query, **params)


def _merge_dynamic_relationship(tx, from_data: dict, to_data: dict, rel_type: str, confidence: float, detail: str):
    """
    Creates an edge between two dynamically extracted entities.
    """
    from_label = from_data["label"]
    to_label = to_data["label"]
    
    # Determine the primary key used to MERGE the source node
    from_key = "name"
    for k in ["plate", "license_plate", "phone", "email", "aadhaar", "account_number", "id", "name"]:
        if k in from_data["attrs"]:
            from_key = k
            break
    from_val = from_data["attrs"].get(from_key, "Unknown")
            
    # Determine the primary key used to MERGE the target node
    to_key = "name"
    for k in ["plate", "license_plate", "phone", "email", "aadhaar", "account_number", "id", "name"]:
        if k in to_data["attrs"]:
            to_key = k
            break
    to_val = to_data["attrs"].get(to_key, "Unknown")

    query = f"""
    MATCH (a:{from_label} {{{from_key}: $from_val}})
    MATCH (b:{to_label} {{{to_key}: $to_val}})
    MERGE (a)-[r:{rel_type}]->(b)
    SET r.confidence_score = $confidence,
        r.detail = $detail
    """
    
    tx.run(query, from_val=from_val, to_val=to_val, confidence=confidence, detail=detail)
