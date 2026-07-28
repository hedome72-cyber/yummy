export default async function handler(req, res) {
  // CORS 및 HTTP 메서드 검증 (POST 요청만 허용)
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method Not Allowed',
      message: 'POST 요청만 허용됩니다.' 
    });
  }

  try {
    const { imageBase64, mimeType } = req.body || {};

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: '분석할 이미지 데이터(imageBase64)와 MIME 타입(mimeType)이 필요합니다.' 
      });
    }

    // Vercel 환경 변수에서 GEMINI_API_KEY 로드
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('환경 변수 GEMINI_API_KEY가 설정되어 있지 않습니다.');
      return res.status(500).json({ 
        error: 'Server Configuration Error',
        message: '서버에 GEMINI_API_KEY가 설정되지 않았습니다. Vercel 환경 변수를 확인해주세요.' 
      });
    }

    // 구조화된 JSON 응답을 유도하는 프롬프트 작성
    const promptText = `
      제시된 급식/음식 사진을 정확히 분석하여 다음 영양 정보를 산출해줘.
      반드시 아래 JSON 형식으로만 답변을 반환해야 하며, 다른 설명이나 텍스트는 붙이지 마.

      {
        "items": [
          { "name": "음식 이름", "calories": 000 }
        ],
        "totalCalories": 000,
        "nutrients": {
          "carbs": "00g",
          "protein": "00g",
          "fat": "00g"
        },
        "advice": "식단에 대한 친절한 한 줄 영양 조언"
      }
    `;

    // Gemini 1.5 Flash 모델 REST API URL
    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const requestPayload = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: mimeType,
                data: imageBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    };

    const geminiResponse = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API Response Error:', errorText);
      return res.status(geminiResponse.status).json({
        error: 'Gemini API Error',
        message: `Gemini API 호출에 실패했습니다. (상태 코드: ${geminiResponse.status})`
      });
    }

    const responseData = await geminiResponse.json();
    const resultText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
      return res.status(500).json({
        error: 'Parsing Error',
        message: 'Gemini API로부터 유효한 응답 텍스트를 받지 못했습니다.'
      });
    }

    // 마크다운 코드 블록(```json ... ```) 제거 후 파싱
    const cleanedJsonText = resultText.replace(/```json|```/g, '').trim();
    const parsedResult = JSON.parse(cleanedJsonText);

    return res.status(200).json(parsedResult);

  } catch (error) {
    console.error('Serverless Function Execution Error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || '서버 내부 처리 중 오류가 발생했습니다.'
    });
  }
}