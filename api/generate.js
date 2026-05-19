const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

const SCRIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['hooks', 'clipes', 'caption_tiktok'],
  properties: {
    hooks: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: { type: 'string' }
    },
    clipes: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['numero', 'titulo', 'veo3_prompt', 'narracao'],
        properties: {
          numero: { type: 'integer', minimum: 1, maximum: 5 },
          titulo: { type: 'string' },
          veo3_prompt: { type: 'string' },
          narracao: { type: 'string' }
        }
      }
    },
    caption_tiktok: { type: 'string' }
  }
};

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function extractOutputText(data) {
  if (typeof data.output_text === 'string') return data.output_text;

  const textParts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') textParts.push(content.text);
    }
  }

  return textParts.join('');
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: { message: 'Metodo nao permitido.' } });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: {
        message: 'OPENAI_API_KEY nao configurada no Vercel.'
      }
    });
  }

  try {
    const { system, userPrompt } = await readJsonBody(req);

    if (!system || !userPrompt) {
      return res.status(400).json({
        error: {
          message: 'Payload invalido. Envie system e userPrompt.'
        }
      });
    }

    const openaiRes = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions: system,
        input: userPrompt,
        max_output_tokens: 4000,
        text: {
          format: {
            type: 'json_schema',
            name: 'copa_pistao_script',
            strict: true,
            schema: SCRIPT_SCHEMA
          }
        }
      })
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      return res.status(openaiRes.status).json(data);
    }

    const text = extractOutputText(data);
    if (!text) {
      return res.status(502).json({
        error: {
          message: 'A OpenAI nao retornou texto de roteiro.'
        }
      });
    }

    return res.status(200).json({
      content: [{ text }],
      model: data.model || OPENAI_MODEL,
      id: data.id
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: {
        message: 'Falha ao gerar roteiro. Tente novamente.'
      }
    });
  }
};
