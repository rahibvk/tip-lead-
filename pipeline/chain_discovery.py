"""
Gov-Ker Intelligence Engine — Chain Discovery (Phase 4)
Continuously searches the Neo4j graph for cross-device links indicating organized activity.
"""

from neo4j import Driver

def run_chain_discovery(driver: Driver) -> list:
    """
    Run the Chain Discovery Cypher query against Neo4j.
    Looks for paths where two distinct devices are connected through shared entities.
    
    Args:
        driver: Neo4j driver instance.
        
    Returns:
        List of discovered chains (alerts).
    """
    query = """
    // Find paths connecting two distinct devices through a shared entity
    MATCH path = (d1:Device)-[:SUBMITTED]->(t1:Tip)-[:MENTIONS]->(shared)<-[:MENTIONS]-(t2:Tip)<-[:SUBMITTED]-(d2:Device)
    WHERE d1.hash <> d2.hash
    
    // Calculate the average confidence score along the relationships in the path
    WITH path, d1, d2, shared, t1, t2,
         [r IN relationships(path) WHERE r.confidence_score IS NOT NULL | r.confidence_score] AS scores
    WITH path, d1, d2, shared, t1, t2,
         CASE WHEN size(scores) > 0 THEN reduce(s = 0.0, x IN scores | s + x) / size(scores) ELSE 0 END AS avg_confidence
         
    // Only alert on high-confidence chains
    WHERE avg_confidence >= 0.70
    
    RETURN 
        id(path) AS chain_id,
        labels(shared)[0] AS shared_type,
        shared.name AS shared_name,
        shared.plate AS shared_plate,
        shared.phone AS shared_phone,
        t1.id AS tip1_id,
        t2.id AS tip2_id,
        avg_confidence,
        timestamp() AS discovered_at
    ORDER BY avg_confidence DESC
    LIMIT 20
    """
    
    alerts = []
    try:
        with driver.session() as session:
            result = session.run(query)
            for record in result:
                
                # Determine the best identifying name for the shared entity
                entity_name = record["shared_name"] or record["shared_plate"] or record["shared_phone"] or "Unknown Entity"
                
                alerts.append({
                    "id": f"chain_{record['chain_id']}",
                    "shared_type": record["shared_type"],
                    "shared_entity": entity_name,
                    "tip1_id": record["tip1_id"],
                    "tip2_id": record["tip2_id"],
                    "confidence_score": round(record["avg_confidence"], 2),
                    "discovered_at": record["discovered_at"]
                })
        return alerts
    except Exception as e:
        print(f"[ChainDiscovery] Error running query: {e}")
        return []


def get_graph_for_tip(driver: Driver, tip_id: str) -> dict:
    """
    Retrieves the local neighborhood graph around a specific tip for visualization.
    """
    query = """
    MATCH (t:Tip {id: $tip_id})-[r1*1..2]-(connected)
    RETURN t, r1, connected
    LIMIT 100
    """
    
    nodes = []
    edges = []
    seen_nodes = set()
    seen_edges = set()
    
    def add_node(node):
        node_id = str(node.element_id)
        if node_id not in seen_nodes:
            seen_nodes.add(node_id)
            label = list(node.labels)[0] if node.labels else "Unknown"
            
            # Find best display name
            props = dict(node)
            name = props.get("name") or props.get("plate") or props.get("phone") or props.get("id") or "Node"
            
            nodes.append({
                "id": node_id,
                "label": label,
                "title": str(name),
                "properties": props
            })
            
    def add_edge(edge):
        edge_id = str(edge.element_id)
        if edge_id not in seen_edges:
            seen_edges.add(edge_id)
            edges.append({
                "id": edge_id,
                "from": str(edge.start_node.element_id),
                "to": str(edge.end_node.element_id),
                "label": edge.type,
                "confidence": dict(edge).get("confidence_score")
            })

    try:
        with driver.session() as session:
            result = session.run(query, tip_id=tip_id)
            for record in result:
                add_node(record["t"])
                
                # connected could be a path or a node depending on query structure.
                # Because we used a variable length path [r1*1..2], r1 is a list of relationships
                for rel in record["r1"]:
                    add_node(rel.start_node)
                    add_node(rel.end_node)
                    add_edge(rel)
                    
        return {"nodes": nodes, "edges": edges}
    except Exception as e:
        print(f"[GraphAPI] Error retrieving graph: {e}")
        return {"nodes": [], "edges": []}


def get_system_stats(driver: Driver) -> dict:
    """
    Retrieves aggregate counts from the Neo4j database.
    """
    stats = {"total_tips": 0, "total_entities": 0, "active_chains": 0}
    try:
        with driver.session() as session:
            # Total Tips
            result = session.run("MATCH (t:Tip) RETURN count(t) AS c")
            stats["total_tips"] = result.single()["c"]
            
            # Total Entities (excluding Tip, Device, Location)
            result = session.run("MATCH (e) WHERE NOT 'Tip' IN labels(e) AND NOT 'Device' IN labels(e) AND NOT 'Location' IN labels(e) RETURN count(e) AS c")
            stats["total_entities"] = result.single()["c"]
            
        return stats
    except Exception as e:
        print(f"[StatsAPI] Error retrieving stats: {e}")
        return stats
