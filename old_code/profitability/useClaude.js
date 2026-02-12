import axios from 'axios';

const INDUSTRY_CATEGORIZING_BOT_ENDPOINT = "https://9xosy744kk.execute-api.us-east-1.amazonaws.com/api";
const INDUSTRY_CATEGORIZING_BOT_API_KEY = "I18UbyZfkia9z0GTiRKQX4SLFmOTPfdK19zEmJTs";
const TIMEOUT_SECONDS = 60;
const POLL_INTERVAL = 3000; // ms

// 서버로부터 받아온 메세지를 가공하는 함수
const trimIndustryCode = (content) => {
    const pattern = /"([^"]+)":\s*\{\s*"industry_code":\s*"([^"]+)",\s*"certainty":\s*([0-9.]+)\s*\}/g;
    let matches;
    const result = {};

    while ((matches = pattern.exec(content)) !== null) {
        const [, name, code, certainty] = matches;
        result[name] = { industry_code: code, certainty: parseFloat(certainty) };
    }
    return result;
};

// 메세지 서버로부터 메세지 불러오는 함수
const getResponseFromId = async (conversationId, messageId) => {
    try {
        const url = `${INDUSTRY_CATEGORIZING_BOT_ENDPOINT}/conversation/${conversationId}/${messageId}`;
        const headers = { 'x-api-key': INDUSTRY_CATEGORIZING_BOT_API_KEY };

        const res = await axios.get(url, { headers });
        if (res.status === 200) {
            return res.data.message.content;
        }

        return null;
    } catch (e) {
        console.error(`[LLM][ERROR] Polling 중 예외: ${e}`);
        return null;
    }
};

const getApiFormat = (prompt, conversationId) => {
    const payload = {
        "text": prompt,
        "mode": "chat"
    };
    if (conversationId) {
        payload["conversationId"] = conversationId;
    }
    return payload;
};

// API 호출 함수
const callBedrock = async (merchantList, idTracker = { conversationId: null, messageId: null }) => {
    const prompt = merchantList.join('\n');
    const payload = getApiFormat(prompt, idTracker.conversationId);
    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': INDUSTRY_CATEGORIZING_BOT_API_KEY
    };

    try {
        // Step 1: POST 요청 → ID만 반환됨
        const response = await axios.post(`${INDUSTRY_CATEGORIZING_BOT_ENDPOINT}/conversation`, payload, {
            headers,
            timeout: TIMEOUT_SECONDS * 1000
        });
        const resJson = response.data;
        idTracker.conversationId = resJson.conversationId || idTracker.conversationId;
        idTracker.messageId = resJson.messageId || idTracker.messageId;

        // Step 2: Polling GET 요청으로 응답 확인
        console.error(`[LLM] 응답 대기 중... (conversationId=${idTracker.conversationId}, messageId=${idTracker.messageId})`);

        const startTime = Date.now();
        while (Date.now() - startTime < TIMEOUT_SECONDS * 1000) {
            const content = await getResponseFromId(idTracker.conversationId, idTracker.messageId);
            if (content) {
                console.error('[LLM] 응답 수신 완료!');
                const body = JSON.parse(content[0].body);
                return trimIndustryCode(body);
            }
            console.error(`[LLM] 응답 미도착 → ${POLL_INTERVAL / 1000}초 후 재시도`);
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        }

        console.error('[LLM][TIMEOUT] 응답 대기 시간 초과');
        return {};
    } catch (e) {
        console.error(`[LLM][ERROR] 요청 실패: ${e.message}`);
        return {};
    }
};

export default callBedrock;