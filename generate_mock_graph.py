import random
import uuid
import time
import os
from neo4j import GraphDatabase
from dotenv import load_dotenv

import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from pipeline.injector import inject_to_neo4j

load_dotenv()
URI = os.getenv("NEO4J_URI", "neo4j+ssc://99211e74.databases.neo4j.io")
USER = os.getenv("NEO4J_USER", "neo4j")
PASSWORD = os.getenv("NEO4J_PASSWORD")

driver = GraphDatabase.driver(URI, auth=(USER, PASSWORD))

print("==================================================")
print("  GENERATING 100 RANDOM USER ENTRIES FOR DASHBOARD")
print("==================================================")

# Clean the database for a fresh visualization
print("Wiping existing graph for a clean slate...")
with driver.session() as session:
    session.run("MATCH (n) DETACH DELETE n")

# We will create 4 specific "Target Hubs" that multiple devices will report.
# This will guarantee some beautiful Chains in the visualization.
HUB_TARGETS = [
    {"type": "Vehicle", "attributes": {"plate": "DXB-A-99112", "color": "Black", "make": "Mercedes"}},
    {"type": "Person", "attributes": {"name": "Omar The Ghost", "alias": "Ghost", "features": "Scar on cheek"}},
    {"type": "Location", "attributes": {"name": "Abandoned Warehouse 42", "street": "Industrial Area 5"}},
    {"type": "Vehicle", "attributes": {"plate": "KL-07-BB-5555", "color": "Silver", "make": "Honda Civic"}},
]

total_injected = 0

for i in range(1, 101):
    tip_id = str(uuid.uuid4())
    device_hash = f"device_{random.randint(1000, 9999)}_{uuid.uuid4().hex[:8]}"
    
    payload = {
        "tip_id": tip_id,
        "device_hash": device_hash,
        "geohash": f"geo{random.randint(10, 99)}",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "rawNarrative": f"Simulated tip #{i} from anonymous user.",
        "images": []
    }
    
    processed_data = {
        "entities": [],
        "relationships": []
    }
    
    # 25% chance this tip connects to one of our massive Hubs (forming a Chain)
    if random.random() < 0.25:
        target = random.choice(HUB_TARGETS)
        processed_data["entities"].append(target)
        
        # Add a random side-character linked to this hub
        side_char = {"type": "Person", "attributes": {"name": f"Associate_{random.randint(1, 50)}"}}
        processed_data["entities"].append(side_char)
        
        processed_data["relationships"].append({
            "from_name": side_char["attributes"]["name"],
            "to_name": target["attributes"].get("name") or target["attributes"].get("plate"),
            "type": "SEEN_WITH",
            "confidence_weight": 0.85,
            "detail": "Reported together"
        })
    else:
        # 75% chance it's just random noise (a completely isolated tip)
        random_person = {"type": "Person", "attributes": {"name": f"Random Citizen {i}"}}
        random_vehicle = {"type": "Vehicle", "attributes": {"plate": f"RND-{random.randint(1000, 9999)}"}}
        processed_data["entities"].append(random_person)
        processed_data["entities"].append(random_vehicle)
        processed_data["relationships"].append({
            "from_name": random_person["attributes"]["name"],
            "to_name": random_vehicle["attributes"]["plate"],
            "type": "OWNS",
            "confidence_weight": 0.5,
            "detail": "Random observation"
        })
        
    inject_to_neo4j(payload, processed_data, driver)
    total_injected += 1
    
    if total_injected % 10 == 0:
        print(f"[{total_injected}/100] Tips injected into Neo4j...")

print("\n[SUCCESS] Successfully injected 100 simulated tips into the Neo4j Graph!")
print("[ACTION] Go to http://localhost:3000/dashboard/ and refresh to see the massive network!")
driver.close()
