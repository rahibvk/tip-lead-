require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
// Forwards the final tip payload to the configured endpoint, or logs it.
app.post('/api/submit', async (req, res) => {
  const tipPayload = req.body;
  const endpoint = process.env.SUBMIT_ENDPOINT;

  console.log('\n========== TIP RECEIVED ==========');
  console.log(JSON.stringify(tipPayload, null, 2));
  console.log('==================================\n');

  if (endpoint) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tipPayload)
      });
      const data = await response.json().catch(() => ({}));
      return res.json({ success: true, forwarded: true, response: data });
    } catch (err) {
      console.error('Failed to forward tip:', err.message);
      return res.status(502).json({ success: false, error: 'Failed to forward tip to endpoint.' });
    }
  }

  // No endpoint configured — just acknowledge
  return res.json({ success: true, forwarded: false, message: 'Tip logged on server. No SUBMIT_ENDPOINT configured.' });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`\n🛡️  Gov-Ker Tip Server running at http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-openai-api-key-here') {
    console.log('⚠️  Warning: OPENAI_API_KEY not set. Will use local fallback analysis.');
  }
  if (!process.env.SUBMIT_ENDPOINT) {
    console.log('ℹ️  No SUBMIT_ENDPOINT configured. Tips will be logged to console.');
  }
  console.log('');
});
