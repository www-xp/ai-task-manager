/**
 * AI 起名接口 —— POST /api/name
 *
 * 阶段2 多模型版本：
 *   用 modelConfigMap 统一存放各模型配置（baseURL / apiKey / model），
 *   一套共用的 fetch 调用代码，循环适配所有模型，不写分支。
 *   所有平台都兼容 OpenAI 标准：/chat/completions + stream:true + SSE + delta.content
 *
 * 阶段1 单模型时，只需把 modelConfigMap 里其它模型的配置删掉即可，调用代码不用动。
 */

const { createClient } = require('@supabase/supabase-js');

/* ================= 模型配置表 ================= */
const modelConfigMap = {
  doubao: {
    label: '豆包（火山方舟）',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: process.env.DOUBAO_API_KEY,
    model: process.env.DOUBAO_MODEL, // 方舟用接入点 ID（ep-开头）
  },
  deepseek: {
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: 'deepseek-chat',
  },
  qwen: {
    label: '通义千问',
    // 注意：千问必须用 compatible-mode，普通地址不兼容
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env.QWEN_API_KEY,
    model: 'qwen-plus',
  },
  kimi: {
    label: 'Kimi（月之暗面）',
    baseURL: 'https://api.moonshot.cn/v1',
    apiKey: process.env.KIMI_API_KEY,
    model: 'moonshot-v1-8k',
  },
};

/* ================= Supabase ================= */
let supabase = null;
function getSupabase() {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  supabase = createClient(url, key);
  return supabase;
}

async function saveHistory({ need, names, modelKey, modelName }) {
  const db = getSupabase();
  if (!db) return { ok: false, reason: '未配置 SUPABASE_URL / SUPABASE_ANON_KEY' };

  const { error } = await db.from('name_history').insert([
    {
      requirement: need,      // 用户填写的起名需求（JSON 字符串）
      names: names,           // AI 生成的名字方案全文
      model: modelKey,        // 模型标识，如 doubao / deepseek
      model_name: modelName,  // 模型接入点或具体型号
    },
  ]);

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/* ================= 提示词 ================= */
function buildMessages({ surname, gender, style, mean }) {
  const system = [
    '你是一位精通汉语姓名文化与字义训诂的起名师。',
    '输出要求：',
    '1. 严格给出 3 组名字，每组一条，格式「序号. 姓名 —— 寓意解释」；',
    '2. 每条寓意解释不超过 35 字，说明用字含义与整体寓意；',
    '3. 不要输出任何开场白、总结、Markdown 标题；',
    '4. 避免生僻字与不雅谐音。',
  ].join('\n');

  const user = [
    `姓氏：${surname || '未提供，请搭配常见姓氏'}`,
    `性别：${gender}`,
    `风格：${style}`,
    `期望寓意：${mean || '寓意美好、积极向上'}`,
    '请直接输出 3 组名字。',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/* ================= 入口 ================= */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: '请使用 POST 请求' });
    return;
  }

  // 解析请求体
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const { surname = '', gender = '男', style = '古风', mean = '', modelKey = 'doubao' } = body;

  // 取模型配置
  const conf = modelConfigMap[modelKey];
  if (!conf) {
    res.status(400).json({ error: `未知模型：${modelKey}` });
    return;
  }
  if (!conf.apiKey || !conf.model) {
    res.status(400).json({ error: `模型 ${conf.label} 尚未配置密钥或模型名，请检查环境变量` });
    return;
  }

  const need = JSON.stringify({ surname, gender, style, mean });

  // 流式响应头
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const upstream = await fetch(`${conf.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conf.apiKey}`,
      },
      body: JSON.stringify({
        model: conf.model,
        messages: buildMessages({ surname, gender, style, mean }),
        stream: true,
        temperature: 0.8,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      res.write(`[ERROR] ${conf.label} 返回 ${upstream.status}：${detail.slice(0, 200)}`);
      res.end();
      return;
    }

    // 解析 SSE，把 delta.content 逐段写给前端
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let full = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;

        let json;
        try { json = JSON.parse(data); } catch { continue; }

        const delta = json?.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          res.write(delta); // 真正的流式输出
        }
      }
    }

    // 生成结束后写入数据库
    const save = await saveHistory({
      need,
      names: full,
      modelKey,
      modelName: conf.model,
    });

    if (!save.ok) res.write(`\n\n[WARN] 已生成，但未写入数据库：${save.reason}`);
    res.end();
  } catch (err) {
    res.write(`[ERROR] ${err.message || String(err)}`);
    res.end();
  }
};
