// api/generate.js
// Vercel Serverless Function for Gemini API Integration

export default async function handler(req, res) {
  // CORS 및 Preflight 요청 처리
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // 1. API 키 확인 (환경 변수)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'Vercel 환경 변수(GEMINI_API_KEY)가 설정되지 않았습니다. Vercel Dashboard -> Settings -> Environment Variables에서 키를 추가해주세요.' 
    });
  }

  try {
    const { image, mimeType = 'image/jpeg', mealType = '급식', note = '' } = req.body;

    if (!image) {
      return res.status(400).json({ error: '이미지 데이터가 전달되지 않았습니다.' });
    }

    // Base64 Prefix 제거 (e.g., "data:image/jpeg;base64,...")
    const base64Data = image.includes(',') ? image.split(',')[1] : image;

    // 2. Gemini 프롬프트 구성
    const systemPrompt = `
당신은 대한민국 최고 수준의 학교/기업 급식 및 영양 분석 전문가입니다.
제공된 음식/급식 사진을 정밀 분석하여 다음 가이드라인에 따라 정확한 식단 및 영양 정보를 추출하세요.

[분석 지침]
1. 식판 또는 접시에 담긴 각 음식을 식별하세요.
2. 각 음식의 estimatedWeightGram(그램 수)과 estimatedCalories(칼로리)를 추정하세요.
3. 총 칼로리(totalCalories), 탄수화물(carbsGrams), 단백질(proteinGrams), 지방(fatGrams)을 계산하세요.
4. 나트륨(sodiumRating: '주의'|'보통'|'양호')과 당류(sugarRating: '주의'|'보통'|'양호') 위험도를 평가하세요.
5. 영양사 관점의 짧고 유익한 조언(dietitianAdvice)을 한국어로 2-3문장 작성하세요.

식사 종류: ${mealType}
사용자 추가 메모: ${note}

반드시 지정된 JSON 포맷으로만 응답해야 합니다.
`;

    // Gemini API 요청 페이로드
    const requestPayload = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            totalCalories: { type: 'INTEGER' },
            carbsGrams: { type: 'INTEGER' },
            proteinGrams: { type: 'INTEGER' },
            fatGrams: { type: 'INTEGER' },
            sodiumRating: { type: 'STRING', enum: ['주의', '보통', '양호'] },
            sugarRating: { type: 'STRING', enum: ['주의', '보통', '양호'] },
            dietitianAdvice: { type: 'STRING' },
            items: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  name: { type: 'STRING' },
                  estimatedWeightGram: { type: 'INTEGER' },
                  estimatedCalories: { type: 'INTEGER' }
                },
                required: ['name', 'estimatedWeightGram', 'estimatedCalories']
              }
            }
          },
          required: ['totalCalories', 'carbsGrams', 'proteinGrams', 'fatGrams', 'sodiumRating', 'sugarRating', 'dietitianAdvice', 'items']
        }
      }
    };

    // 3. Gemini REST API 호출 (gemini-2.5-flash 모델 사용)
    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const apiResponse = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('Gemini API Error Response:', errorText);
      return res.status(apiResponse.status).json({ 
        error: `Gemini API 호출 오류가 발생했습니다 (${apiResponse.status}).`,
        details: errorText
      });
    }

    const responseData = await apiResponse.json();

    // 4. 응답 데이터 추출 및 파싱
    const candidateText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      return res.status(500).json({ error: 'Gemini API로부터 유효한 응답을 받지 못했습니다.' });
    }

    const parsedJson = JSON.parse(candidateText);
    return res.status(200).json(parsedJson);

  } catch (err) {
    console.error('Serverless Function Exception:', err);
    return res.status(500).json({ 
      error: '서버 내부 분석 처리 중 에러가 발생했습니다.', 
      details: err.message 
    });
  }
}