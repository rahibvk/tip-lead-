from neo4j import GraphDatabase
import os
from dotenv import load_dotenv

load_dotenv()

URI = os.getenv("NEO4J_URI", "neo4j+s://99211e74.databases.neo4j.io")
USER = os.getenv("NEO4J_USER", "neo4j")
PASSWORD = os.getenv("NEO4J_PASSWORD")

driver = GraphDatabase.driver(URI, auth=(USER, PASSWORD))

with driver.session() as session:
    print("--- ALL MENTIONS EDGES ---")
    res = session.run("MATCH (t:Tip)-[r:MENTIONS]->(e) RETURN t.id, labels(e), e.name, e.plate, r.confidence_score LIMIT 10")
    for rec in res:
        print(rec)
        
    print("\n--- ALL SUBMITTED EDGES ---")
    res = session.run("MATCH (d:Device)-[r:SUBMITTED]->(t:Tip) RETURN d.hash, t.id LIMIT 10")
    for rec in res:
        print(rec)
        
    print("\n--- CHECKING CHAIN MATCH ---")
    q = """
    MATCH (d1:Device)-[:SUBMITTED]->(t1:Tip)-[r1:MENTIONS]->(shared)<-[r2:MENTIONS]-(t2:Tip)<-[:SUBMITTED]-(d2:Device)
    RETURN d1.hash, d2.hash, shared.name, shared.plate
    LIMIT 5
    """
    res = session.run(q)
    for rec in res:
        print(rec)
