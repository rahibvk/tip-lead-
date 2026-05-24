from neo4j import GraphDatabase
import os
from dotenv import load_dotenv

load_dotenv()
URI = os.getenv("NEO4J_URI", "neo4j+ssc://99211e74.databases.neo4j.io")
USER = os.getenv("NEO4J_USER", "neo4j")
PASSWORD = os.getenv("NEO4J_PASSWORD")
driver = GraphDatabase.driver(URI, auth=(USER, PASSWORD))

query = """
    MATCH (d1:Device)-[:SUBMITTED]->(t1:Tip)-[r1:MENTIONS]->(shared)<-[r2:MENTIONS]-(t2:Tip)<-[:SUBMITTED]-(d2:Device)
    WHERE d1.hash <> d2.hash
    WITH d1, d2, shared, t1, t2,
         1.0 AS avg_confidence
    
    RETURN 
        id(d1) + id(d2) + id(shared) AS chain_id,
        labels(shared)[0] AS shared_type,
        shared.name AS shared_name,
        shared.plate AS shared_plate,
        shared.phone AS shared_phone,
        t1.id AS tip1_id,
        t2.id AS tip2_id,
        avg_confidence,
        timestamp() AS discovered_at
    LIMIT 20
"""

with driver.session() as session:
    try:
        res = session.run(query)
        records = list(res)
        print(f"Found {len(records)} records")
        for rec in records:
            print(rec)
    except Exception as e:
        print("ERROR:", e)
