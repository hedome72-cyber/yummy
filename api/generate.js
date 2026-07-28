export default async function handler(req, res) {
  // CORS 및 HTTP 메서드 검증
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { imageBase64, mimeType } = req.body || {};

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: '이미지 데이터와 MIME 타입이 필요합니다.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: '서버에 API 키가 설정되지 않았습니다.' });
    }

    // Gemini 3.1 Flash-Lite 모델 엔드포인트
    const model = "gemini-3.1-flash-lite";
    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const promptText = `
      제시된 급식/음식 사진을 정확히 분석하여 다음 영양 정보를 산출해줘.
      반드시 아래 JSON 형식으로만 답변을 반환해야 하며, 다른 설명이나 텍스트는 붙이지 마.

      {
        "items": [{ "name": "음식 이름", "calories": 000 }],
        "totalCalories": 000,
        "nutrients": { "carbs": "00g", "protein": "00g", "fat": "00g" },
        "advice": "식단에 대한 친절한 한 줄 영양 조언"
      }
    `;

    const response = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: promptText },
            { inlineData: { mimeType: mimeType, data: imageBase64 } }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', errorText);
      return res.status(response.status).json({ error: `API 응답 오류 (${response.status})` });
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
      return res.status(500).json({ error: '응답 내용을 파싱할 수 없습니다.' });
    }

    return res.status(200).json(JSON.parse(resultText));

  } catch (error) {
    console.error('Serverless Function Error:', error);
    return res.status(500).json({ error: error.message || '서버 내부 오류가 발생했습니다.' });
  }
}