import json

def get_chain_subgraph_text(driver, shared_type: str, shared_entity: str) -> str:
    """
    Queries Neo4j for the immediate neighborhood (radius 2) around the shared entity.
    Returns a human-readable text representation of the nodes and relationships.
    """
    query = f"""
    MATCH (center:{shared_type})
    WHERE center.name = $val OR center.plate = $val OR center.phone = $val OR center.hash = $val
    MATCH (n)-[r]-(m)
    // Ensure we are only looking at paths within 2 hops of the center
    WHERE shortestPath((center)-[*]-(n)) IS NOT NULL
    RETURN labels(n)[0] AS n_label, properties(n) AS n_props,
           type(r) AS rel_type, properties(r) AS rel_props,
           labels(m)[0] AS m_label, properties(m) AS m_props
    LIMIT 100
    """
    
    subgraph_lines = []
    
    with driver.session() as session:
        result = session.run(query, val=shared_entity)
        for record in result:
            n_name = record["n_props"].get("name") or record["n_props"].get("plate") or record["n_props"].get("id") or "Unknown"
            m_name = record["m_props"].get("name") or record["m_props"].get("plate") or record["m_props"].get("id") or "Unknown"
            
            # Format the relationship nicely
            line = f"({record['n_label']}: {n_name}) -[{record['rel_type']}]-> ({record['m_label']}: {m_name})"
            if record["rel_props"].get("detail"):
                line += f"  (Details: {record['rel_props']['detail']})"
            
            if line not in subgraph_lines:
                subgraph_lines.append(line)
                
    return "\n".join(subgraph_lines)

def generate_chain_report(driver, openai_client, shared_type: str, shared_entity: str) -> str:
    """
    Generates a detailed intelligence report for the given target using an LLM.
    """
    subgraph_text = get_chain_subgraph_text(driver, shared_type, shared_entity)
    
    prompt = f"""
You are a Senior Intelligence Analyst for a government law enforcement agency.
You are tasked with writing a concise, highly professional intelligence report on a newly discovered "Lead Chain".
This chain centers around a key entity: {shared_type} - {shared_entity}.

Here is the raw graph data connecting this entity to citizen tips, other people, and vehicles:
=== GRAPH CONTEXT ===
{subgraph_text}
=====================

Based on this raw data, write an actionable intelligence report for the police officers.
Use Markdown formatting. Include:
1. Executive Summary
2. Key Entities Involved (Who/What else is connected?)
3. Activity/Behavior (What is the suspected activity based on the tip details?)
4. Recommended Next Steps

Keep it concise, gritty, and professional. Do not use filler words. 
Do not mention "graph data" or "nodes", speak purely in terms of real-world intelligence.
"""

    response = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": prompt}],
        temperature=0.3
    )
    
    return response.choices[0].message.content


def chat_with_lead(driver, openai_client, shared_type: str, shared_entity: str, chat_history: list, user_message: str) -> str:
    """
    Allows the user to chat directly with the AI about the lead, utilizing the graph as context.
    """
    subgraph_text = get_chain_subgraph_text(driver, shared_type, shared_entity)
    
    system_prompt = f"""
You are an AI Detective Assistant. You are chatting with a police officer about a specific case file.
The current subject of the investigation is: {shared_type} - {shared_entity}.

Here is the intelligence gathered on this subject so far:
=== GRAPH CONTEXT ===
{subgraph_text}
=====================

Answer the officer's questions accurately based ONLY on the provided graph context.
If the graph does not contain the answer, say "I don't have that information in the current case file."
Be concise, professional, and helpful.
"""

    messages = [{"role": "system", "content": system_prompt}]
    
    # Append history
    for msg in chat_history:
        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
        
    # Append new message
    messages.append({"role": "user", "content": user_message})

    response = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.5
    )
    
    return response.choices[0].message.content
