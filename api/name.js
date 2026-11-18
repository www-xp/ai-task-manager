/**
 * AI 起名接口 —— 路由 POST /api/name
 * Vercel 会自动把 api 目录下的文件映射为 /api/xxx
 */
const { createClient } = require('@supabase/supabase-js');

// 延迟创建，避免缺少环境变量时直接抛错
let supabase = null;
function getSupabase() {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  supabase = createClient(url, key);
  return supabase;
}

module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(405).end('请使用 POST 请求');
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const { surname = '', gender = '', style = '', mean = '' } = body;

    // Prompt：待接入火山方舟时，把这段作为 messages 的 user 内容发出去
    const prompt = `给姓氏${surname}、性别${gender}的宝宝起名字，风格${style}，寓意：${mean}，列出5个名字，附带简短释义。`;

    // ===== 临时：先返回示例结果，保证部署后页面可用 =====
    // 接入方舟大模型时，用 prompt 调用接口，把 answer 换成模型返回内容即可
    const answer = `名字推荐：
1. ${surname}景珩：温润如玉，前程明朗
2. ${surname}书尧：知书达理，品性端方
3. ${surname}知禾：心怀良善，岁岁安然
4. ${surname}清越：清朗通透，才思出众
5. ${surname}允安：平和顺遂，一生平安`;

    // 写入 Supabase（表名 name_log，需先执行建表 SQL）
    const db = getSupabase();
    if (db) {
      const { error } = await db.from('name_log').insert([
        { surname, gender, style, mean, result: answer },
      ]);
      if (error) {
        console.error('写入 Supabase 失败：', error.message);
      }
    }

    res.status(200).end(answer);
  } catch (err) {
    console.error('接口异常：', err);
    res.status(500).end('服务异常：' + (err.message || String(err)));
  }
};
