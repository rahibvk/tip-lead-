import os
import sys
from neo4j import GraphDatabase
from dotenv import load_dotenv
import traceback

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from pipeline.chain_discovery import run_chain_discovery

load_dotenv()
URI = os.getenv("NEO4J_URI", "neo4j+ssc://99211e74.databases.neo4j.io")
USER = os.getenv("NEO4J_USER", "neo4j")
PASSWORD = os.getenv("NEO4J_PASSWORD")
driver = GraphDatabase.driver(URI, auth=(USER, PASSWORD))

try:
    alerts = run_chain_discovery(driver)
    print("ALERTS:", alerts)
except Exception as e:
    print("EXCEPTION OUTSIDE:")
    traceback.print_exc()
