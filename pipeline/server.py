import os
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI
from neo4j import GraphDatabase

# Import Pipeline Modules
from extractor import extract_entities
from resolver import resolve_entities, get_existing_labels
from scorer import score_relationships
from injector import inject_to_neo4j
from chain_discovery import run_chain_discovery, get_graph_for_tip, get_system_stats

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

app = Flask(__name__)
CORS(app)

# Initialize API Clients
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize Neo4j Driver
neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
neo4j_user = os.getenv("NEO4J_USER", "neo4j")
neo4j_password = os.getenv("NEO4J_PASSWORD", "password")

try:
    neo4j_driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
    print(f"[SUCCESS] Connected to Neo4j at {neo4j_uri}")
except Exception as e:
    print(f"[ERROR] Failed to connect to Neo4j: {e}")
    neo4j_driver = None


@app.route('/process-tip', methods=['POST'])
def process_tip():
    """
    Main entry point for the Intelligence Pipeline.
    Receives raw tip from Node.js, extracts entities, resolves, scores, and injects to Neo4j.
    """
    if not neo4j_driver:
        return jsonify({"status": "error", "message": "Neo4j database not connected."}), 500
        
    payload = request.json
    if not payload:
        return jsonify({"error": "No JSON payload provided"}), 400
        
    print(f"\n[Pipeline] Processing Tip: {payload.get('tip_id')}")
    start_time = time.time()
    
    # Step 1: LLM Entity Extraction
    print("  -> Step 1: LLM Extraction...")
    raw_narrative = payload.get("rawNarrative", "")
    transcript = payload.get("interviewTranscript", [])
    extracted_data = extract_entities(raw_narrative, transcript, openai_client)
    
    # Step 2: Entity Resolution
    print("  -> Step 2: Entity Resolution...")
    existing_labels = get_existing_labels(neo4j_driver)
    resolved_data = resolve_entities(extracted_data, existing_labels)
    
    # Step 3: Confidence Scoring
    print("  -> Step 3: Confidence Scoring...")
    scored_data = score_relationships(resolved_data)
    
    # Step 4: Graph Injection
    print("  -> Step 4: Neo4j Graph Injection...")
    injection_stats = inject_to_neo4j(payload, scored_data, neo4j_driver)
    
    elapsed = round(time.time() - start_time, 2)
    print(f"[Pipeline] Finished in {elapsed}s | Nodes: {injection_stats['nodes_merged']} | Edges: {injection_stats['edges_merged']}\n")
    
    return jsonify({
        "status": "success",
        "processing_time_sec": elapsed,
        "entities_found": len(scored_data.get("entities", [])),
        "relationships_found": len(scored_data.get("relationships", [])),
        "injection_stats": injection_stats
    })


@app.route('/alerts', methods=['GET'])
def get_alerts():
    """Run chain discovery and return alerts."""
    if not neo4j_driver:
        return jsonify([])
    alerts = run_chain_discovery(neo4j_driver)
    return jsonify(alerts)


@app.route('/graph/<tip_id>', methods=['GET'])
def get_graph(tip_id):
    """Return local neighborhood graph for a specific tip."""
    if not neo4j_driver:
        return jsonify({"nodes": [], "edges": []})
    graph = get_graph_for_tip(neo4j_driver, tip_id)
    return jsonify(graph)


@app.route('/stats', methods=['GET'])
def get_stats():
    """Return aggregate system stats."""
    if not neo4j_driver:
         return jsonify({"total_tips": 0, "total_entities": 0, "active_chains": 0})
    stats = get_system_stats(neo4j_driver)
    # Get active chains count dynamically
    alerts = run_chain_discovery(neo4j_driver)
    stats["active_chains"] = len(alerts)
    return jsonify(stats)


if __name__ == '__main__':
    print("[STARTING] Starting Python AI Pipeline on port 5000...")
    app.run(host='0.0.0.0', port=5000, debug=False)
