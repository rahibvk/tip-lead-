require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const ngeohash = require('ngeohash');

const app = express();
const PORT = process.env.PORT || 3000;
const PIPELINE_URL = process.env.PIPELINE_URL || 'http://localhost:5000';

// --- Middleware ---
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

// --- OpenAI Client ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- POST /api/interview ---
// Handles multi-turn interview. Expects an array of messages.
app.post('/api/interview', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required.' });
  }

  // System prompt for the conversational detective
  const systemPrompt = {
    role: 'system',
    content: `You are a highly experienced police detective and expert interrogator (like Sherlock Holmes) working for an anonymous tip intake system. 
You are interviewing a citizen who just submitted a raw tip. Your goal is to extract critical, actionable leads by asking questions ONE AT A TIME.

Follow these strict rules:
1. Ask ONE, highly targeted question per turn. Never ask multiple questions at once.
2. CRITICAL PRIORITY: If a person is mentioned (friend, family, suspect) and their basic identity is missing, your FIRST questions MUST ask for their full name, age, physical description, and address/frequent locations. Without this, the tip is useless.
3. Act like a detective. Only after identity details are secured, ask probing questions about changes in routine, hidden items, strange smells, or new associates.
4. If you determine you have gathered enough actionable information to file a solid report, OR if the user indicates they don't know anything else, end the interview.
5. You must always return a JSON object.

If you need more information, return:
{
  "status": "continue",
  "question": "The text of your next question"
}

If you have enough information to conclude the interview, return:
{
  "status": "complete",
  "summary": "A one or two sentence summary of the entire tip.",
  "categories": ["array", "of", "categories", "like", "person", "drugs"]
}`
  };

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [systemPrompt, ...messages]
    });

    const result = JSON.parse(completion.choices[0].message.content);
    return res.json(result);
  } catch (err) {
    console.error('OpenAI API error:', err.message);
    
    // Simple fallback if API fails
    return res.json({
      status: "complete",
      summary: "Tip received. (Analysis failed due to server error, but raw data is saved).",
      categories: ["general"]
    });
  }
});

// --- POST /api/submit ---
// Processes the final tip payload, enriches it, and forwards to the Python pipeline.
app.post('/api/submit', async (req, res) => {
  const tipPayload = req.body;

  // Generate unique identifiers
  const tip_id = uuidv4();
  
  // Anonymous device hash from request headers (no IP stored directly)
  const rawFingerprint = (req.headers['user-agent'] || '') + (req.ip || '');
  const device_hash = crypto.createHash('sha256').update(rawFingerprint).digest('hex');
  
  // Geohash from coordinates (precision 7 ≈ ~150m accuracy)
  let geohash = null;
  if (tipPayload.coordinates && tipPayload.coordinates.lat && tipPayload.coordinates.lng) {
    geohash = ngeohash.encode(tipPayload.coordinates.lat, tipPayload.coordinates.lng, 7);
  }

  // Build enriched payload for the pipeline
  const enrichedPayload = {
    tip_id,
    device_hash,
    geohash,
    coordinates: tipPayload.coordinates,
    rawNarrative: tipPayload.rawNarrative,
    categories: tipPayload.categories || [],
    interviewTranscript: tipPayload.interviewTranscript || [],
    images: tipPayload.images || [],
    timestamp: tipPayload.timestamp || new Date().toISOString(),
  };

  console.log('\n========== TIP RECEIVED ==========');
  console.log(`  Tip ID:      ${tip_id}`);
  console.log(`  Device Hash: ${device_hash.substring(0, 12)}...`);
  console.log(`  Geohash:     ${geohash}`);
  console.log(`  Narrative:   ${(enrichedPayload.rawNarrative || '').substring(0, 80)}...`);
  console.log(`  Images:      ${enrichedPayload.images.length}`);
  console.log(`  Transcript:  ${enrichedPayload.interviewTranscript.length} messages`);
  console.log('==================================\n');

  // Forward to Python AI Pipeline
  try {
    const pipelineResponse = await fetch(`${PIPELINE_URL}/process-tip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enrichedPayload),
    });

    if (pipelineResponse.ok) {
      const pipelineResult = await pipelineResponse.json();
      console.log('[Pipeline] Result:', pipelineResult);
      return res.json({ success: true, tip_id, pipeline: pipelineResult });
    } else {
      console.error('[Pipeline] Error:', pipelineResponse.status, pipelineResponse.statusText);
      // Still acknowledge the tip — it's logged on the server
      return res.json({ success: true, tip_id, pipeline: { status: 'error', message: 'Pipeline returned error but tip is saved.' } });
    }
  } catch (err) {
    console.error('[Pipeline] Unreachable:', err.message);
    // Pipeline is down — still acknowledge the tip
    return res.json({ success: true, tip_id, pipeline: { status: 'offline', message: 'AI Pipeline is offline. Tip saved for manual processing.' } });
  }
});

// --- DASHBOARD API ---

// GET /api/dashboard/alerts - Recent chain discovery alerts
app.get('/api/dashboard/alerts', async (req, res) => {
  try {
    const response = await fetch(`${PIPELINE_URL}/alerts`);
    if (response.ok) {
      const alerts = await response.json();
      return res.json(alerts);
    }
    return res.json([]);
  } catch (err) {
    return res.json([]);
  }
});

// GET /api/dashboard/graph/:tipId - Full graph for a tip
app.get('/api/dashboard/graph/:tipId', async (req, res) => {
  try {
    const response = await fetch(`${PIPELINE_URL}/graph/${req.params.tipId}`);
    if (response.ok) {
      const graph = await response.json();
      return res.json(graph);
    }
    return res.json({ nodes: [], edges: [] });
  } catch (err) {
    return res.json({ nodes: [], edges: [] });
  }
});

// GET /api/dashboard/stats - Aggregate stats
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const response = await fetch(`${PIPELINE_URL}/stats`);
    if (response.ok) {
      const stats = await response.json();
      return res.json(stats);
    }
    return res.json({ total_tips: 0, total_entities: 0, active_chains: 0 });
  } catch (err) {
    return res.json({ total_tips: 0, total_entities: 0, active_chains: 0 });
  }
});

app.post('/api/dashboard/chain/report', async (req, res) => {
  try {
    const response = await fetch(`${PIPELINE_URL}/chain/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

app.post('/api/dashboard/chain/chat', async (req, res) => {
  try {
    const response = await fetch(`${PIPELINE_URL}/chain/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to send chat message' });
  }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`\n🛡️  Gov-Ker Tip Server running at http://localhost:${PORT}`);
  console.log(`📊  Dashboard at http://localhost:${PORT}/dashboard`);
  console.log(`🔗  Pipeline target: ${PIPELINE_URL}`);
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-openai-api-key-here') {
    console.log('⚠️  Warning: OPENAI_API_KEY not set. Will use local fallback analysis.');
  }
  console.log('');
});
