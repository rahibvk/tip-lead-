# Gov-Ker Intelligence Engine

Gov-Ker is an advanced, LLM-driven graph intelligence platform designed for law enforcement and citizen tip collection. It moves beyond traditional relational databases, utilizing an AI pipeline and a schema-less Graph Database (Neo4j) to automatically map the criminal underground based on anonymous tips.

## System Architecture

The platform consists of three main components:

1. **Citizen Tip Portal (Frontend & API Gateway)**
   - **Node.js / Express Gateway**: A lightweight, fast entry point that catches incoming JSON payloads.
   - **Anonymity**: Utilizes cryptographically secure device hashing (`SHA-256`) based on browser fingerprinting. It tracks *devices* to correlate tips without storing raw IPs.
   - **Media Handling**: Evidence photos are uploaded, converted to Base64 in-memory, and immediately purged upon submission.
   - **Geohashing**: Location coordinates are hashed for regional clustering.

2. **The Intelligence Engine (Python AI Pipeline)**
   - **Dynamic Extraction**: Uses OpenAI's LLM (`gpt-4o-mini`) to read narratives and interview transcripts, dynamically extracting entities (People, Vehicles, Locations, Organizations, Substances). There is no hardcoded database schema.
   - **Semantic Resolution**: Uses `scikit-learn` (TF-IDF & Cosine Similarity) to resolve slight variations in entity names and types before hitting the database.
   - **Confidence Scoring**: Assigns an intelligence confidence score (0.0 - 1.0) based on the specificity of the information (e.g., a license plate scores higher than a vague description).
   - **Graph Injection**: Dynamically builds and executes Neo4j `MERGE` Cypher queries to inject nodes and relationships.

3. **Law Enforcement Dashboard**
   - **Network Visualization**: Provides a dark-themed, `vis.js` force-directed graph UI allowing detectives to visually explore connections between tips, people, and vehicles.
   - **Chain Discovery Module**: A background Neo4j engine that actively searches for "Cross-Device Links" — alerting investigators when multiple, completely distinct anonymous devices submit tips that connect to the same target entity.

## Technologies Used
- **Frontend**: HTML5, CSS3, Vanilla JS, vis.js
- **Gateway**: Node.js, Express
- **AI Pipeline**: Python 3.13, Flask, OpenAI, Scikit-Learn
- **Database**: Neo4j Aura (Cloud Graph Database)

## Setup and Installation

### 1. Prerequisites
- Node.js (v18+)
- Python (3.10+)
- A Neo4j Aura account (Free Tier)
- An OpenAI API Key

### 2. Environment Configuration
Create a `.env` file in the root directory:
```env
PORT=3000
OPENAI_API_KEY=sk-your-openai-key
NEO4J_URI=neo4j+ssc://your-aura-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-neo4j-password
```

### 3. Start the Platform
Install dependencies and run both servers concurrently:

**Terminal 1 (AI Pipeline):**
```bash
pip install -r pipeline/requirements.txt
python pipeline/server.py
```

**Terminal 2 (API Gateway & Dashboard):**
```bash
npm install
node server.js
```

### 4. Access the Application
- **Citizen Portal**: `http://localhost:3000`
- **Police Dashboard**: `http://localhost:3000/dashboard`

## Testing the Engine
1. Go to the Citizen Portal and submit a tip regarding a specific license plate or name.
2. Open an "Incognito" browser window to generate a new anonymous `device_hash`.
3. Submit a second tip linking back to the same plate or name.
4. Open the Police Dashboard (`/dashboard`) and watch the **Chain Discovery** feature automatically flag the high-confidence connection between the two distinct devices.
