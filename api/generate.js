export default async function handler(req, res) {
    // Allow POST method only
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ 
                error: 'GEMINI_API_KEY 환경 변수가 설정되지 않았습니다. Vercel Dashboard -> Environment Variables에 GEMINI_API_KEY를 추가해주세요.' 
            });
        }

        const { image, mimeType, notes, mealType } = req.body;

        if (!image) {
            return res.status(400).json({ error: '분석할 이미지 데이터가 없습니다.' });
        }

        const systemPrompt = `당신은 대한민국 임상 영양사이자 급식 분석 AI 전문가입니다.
제공된 급식 또는 음식 사진을 정밀 분석하여 영양성분 및 칼로리 정보를 JSON으로 추출해야 합니다.
반드시 다른 설명 없이 오직 유효한 JSON 객체만 반환하세요.

JSON 구조 요구사항:
{
  "mealName": "식단 요약 (예: 차조밥과 닭갈비 급식)",
  "totalCalories": 680,
  "caloriesTarget": 700,
  "nutrients": {
    "carbs": { "amount": 88, "unit": "g", "percent": 55 },
    "protein": { "amount": 32, "unit": "g", "percent": 25 },
    "fat": { "amount": 16, "unit": "g", "percent": 20 },
    "sodium": { "amount": 850, "unit": "mg", "status": "warning" },
    "sugar": { "amount": 12, "unit": "g", "status": "good" }
  },
  "score": 88,
  "summary": "단백질 비율이 높고 영양 구성이 우수한 급식입니다. 다만 국물의 나트륨 함량이 높습니다.",
  "items": [
    {
      "name": "차조밥",
      "portion": "1공기 (약 200g)",
      "calories": 310,
      "carbs": 68,
      "protein": 6,
      "fat": 1.5,
      "category": "주식"
    },
    {
      "name": "춘천닭갈비",
      "portion": "1접시 (약 150g)",
      "calories": 240,
      "carbs": 10,
      "protein": 22,
      "fat": 12,
      "category": "주요리"
    }
  ],
  "advice": [
    "국물의 건더기 위주로 드시면 나트륨 섭취를 30% 이상 줄일 수 있습니다.",
    "식후 우유나 방울토마토 간식을 더하면 완벽한 균형이 완성됩니다."
  ],
  "dietaryTags": ["고단백", "적정칼로리", "나트륨주의"]
}`;

        const userPrompt = `이 ${mealType || '급식'} 사진을 분석해주세요. ${notes ? '추가 특이사항 메모: ' + notes : ''}`;

        const payload = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: userPrompt },
                        {
                            inlineData: {
                                mimeType: mimeType || 'image/jpeg',
                                data: image
                            }
                        }
                    ]
                }
            ],
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2
            }
        };

        const primaryModel = 'gemini-2.0-flash-lite';
        let apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${primaryModel}:generateContent?key=${apiKey}`;

        let response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // Fallback model retry if primary model returns 404
        if (!response.ok && response.status === 404) {
            console.warn(`Model ${primaryModel} returned 404, falling back to gemini-2.0-flash`);
            const fallbackModel = 'gemini-2.0-flash';
            apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${apiKey}`;
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `Gemini API 호출 실패 (상태 코드: ${response.status})`);
        }

        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        const cleanedText = responseText ? responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim() : '';

        if (!cleanedText) {
            throw new Error('AI 응답 데이터를 처리할 수 없습니다.');
        }

        try {
            const parsedResult = JSON.parse(cleanedText);
            return res.status(200).json(parsedResult);
        } catch (pErr) {
            throw new Error('AI 응답 JSON 파싱 실패');
        }

    } catch (error) {
        console.error('API Serverless Error:', error);
        return res.status(500).json({ 
            error: error.message || '서버 내부 오류가 발생했습니다.' 
        });
    }
}