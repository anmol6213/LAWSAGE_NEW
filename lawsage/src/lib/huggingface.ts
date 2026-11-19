const MODEL = 'meta-llama/Llama-3.1-8B-Instruct';

export const generateResponse = async (input: string): Promise<string> => {
  const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_HUGGINGFACE_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a legal AI assistant for Indian laws. Give accurate, helpful, general legal information and mention relevant Acts and sections where possible. You do not give legal advice.',
        },
        { role: 'user', content: input },
      ],
      max_tokens: 512,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('HF error', res.status, text);
    throw new Error('Failed to generate response.');
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
};
