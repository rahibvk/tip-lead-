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

// --- POST /api/analyze ---
// Receives rawNarrative, asks GPT to extract entities and generate follow-up questions.
app.post('/api/analyze', async (req, res) => {
  const { rawNarrative } = req.body;

  if (!rawNarrative || typeof rawNarrative !== 'string' || rawNarrative.trim().length === 0) {
    return res.status(400).json({ error: 'rawNarrative is required.' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a highly experienced police detective and expert interrogator (like Sherlock Holmes) working for an anonymous tip intake system. Your job is to read a citizen's raw narrative and identify the critical missing clues or investigative leads that an experienced detective would immediately ask about.

Analyze the narrative and return a JSON object with:
1. "categories": An array of entity categories detected (e.g., "vehicle", "person", "suspicious_behavior", "drugs", "domestic", "fraud").
2. "summary": A one-sentence summary of the tip.
3. "followUpQuestions": An array of 1-4 follow-up question objects designed to extract actionable leads. Each object must have:
   - "id": A camelCase identifier (e.g., "suspectName", "suspectAddress", "routineChanges")
   - "label": The specific, probing question text (e.g., "You mentioned your friend is acting unusual. What is his full name and where does he currently live?")
   - "placeholder": Example answer text
   - "type": One of "text", "select", "textarea"
   - "options": (Only for "select" type) An array of option strings

Rules:
- CRITICAL PRIORITY: If a person is mentioned (friend, family, suspect) and their basic identity is missing, your FIRST questions MUST ask for their full name, age, physical description, and address/frequent locations. Without this, the tip is useless.
- Act like a detective. Only after identity details are secured (or if already provided), ask probing questions about changes in routine, hidden items, strange smells, or new associates.
- Do NOT ask for information already provided in the narrative.
- Keep questions targeted, investigative, and insightful (1-4 questions max).
- Return valid JSON only.`
        },
        {
          role: 'user',
          content: rawNarrative
        }
      ]
    });

    const result = JSON.parse(completion.choices[0].message.content);
    return res.json(result);
  } catch (err) {
    console.error('OpenAI API error:', err.message);

    // Fallback to local keyword matching if OpenAI fails
    const fallback = localFallbackAnalysis(rawNarrative);
    return res.json(fallback);
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

// --- Local Fallback Analysis ---
function localFallbackAnalysis(text) {
  const lower = text.toLowerCase();
  const categories = [];
  const followUpQuestions = [];

  // Vehicle keywords
  const vehicleKeywords = ['car', 'bike', 'motorcycle', 'scooter', 'auto', 'bus', 'truck', 'van', 'swift', 'innova', 'bolero', 'vehicle', 'driving', 'drove'];
  if (vehicleKeywords.some(k => lower.includes(k))) {
    categories.push('vehicle');
    if (!lower.match(/\b[a-z]{2}[-\s]?\d{1,2}[-\s]?[a-z]{1,3}[-\s]?\d{1,4}\b/i)) {
      followUpQuestions.push({ id: 'licensePlate', label: 'Do you remember the license plate number?', placeholder: 'e.g., KL-07-AX-1234', type: 'text' });
    }
    if (!lower.match(/(red|blue|black|white|silver|grey|gray|green|yellow|brown|maroon)/)) {
      followUpQuestions.push({ id: 'vehicleColor', label: 'What color was the vehicle?', placeholder: 'e.g., Red, Black, White', type: 'text' });
    }
  }

  // Person keywords
  const personKeywords = ['man', 'woman', 'guy', 'person', 'boy', 'girl', 'suspect', 'individual', 'people', 'group', 'gang', 'someone', 'he ', 'she ', 'they '];
  if (personKeywords.some(k => lower.includes(k))) {
    categories.push('person');
    if (!lower.match(/(tall|short|slim|fat|thin|heavy|medium build)/)) {
      followUpQuestions.push({ id: 'suspectDescription', label: 'Can you describe the person\'s appearance?', placeholder: 'e.g., Tall, medium build, wearing a blue shirt', type: 'textarea' });
    }
    if (!lower.match(/\b\d{1,2}\s*(year|yr)/)) {
      followUpQuestions.push({ id: 'suspectAge', label: 'Approximately how old was the person?', placeholder: 'e.g., Around 30 years old', type: 'text' });
    }
  }

  // Time keywords
  const hasTime = lower.match(/(morning|afternoon|evening|night|today|yesterday|am|pm|\d{1,2}:\d{2}|\d{1,2}\s*o.?clock)/);
  if (!hasTime) {
    followUpQuestions.push({ id: 'timeOfIncident', label: 'When did this happen?', placeholder: 'e.g., Today around 3 PM, Yesterday evening', type: 'text' });
  }

  if (categories.length === 0) categories.push('general');

  return {
    categories,
    summary: 'Tip received (analyzed locally).',
    followUpQuestions: followUpQuestions.slice(0, 4)
  };
}

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
