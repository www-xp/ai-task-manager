# AI 起名助手（ai-task-manager）

基于 Node.js + 火山方舟（兼容多模型网关）的中文起名小应用：流式生成 3 组带寓意的名字，并把「用户需求 + 名字方案 + 使用的模型」写入 Supabase。

## 功能

- 输入姓氏、性别、风格、期望寓意，AI 输出 3 组名字 + 寓意解释
- SSE 流式输出，前端逐段渲染
- 多模型切换：豆包 / DeepSeek / 通义千问 / Kimi，统一由 modelConfigMap 定义
- 生成结果自动写入 Supabase name_history 表
- 密钥全部走环境变量，.env 已在 .gitignore 内

## 目录结构

- api/name.js：服务端接口（模型调用 + SSE 流式 + 入库）
- index.html：前端页面（表单、模型下拉框、流式渲染）
- package.json：依赖 @supabase/supabase-js

## 环境变量

- SUPABASE_URL、SUPABASE_ANON_KEY
- DOUBAO_API_KEY、DOUBAO_MODEL
- DEEPSEEK_API_KEY / QWEN_API_KEY / KIMI_API_KEY（可选）

## 部署

推送到 GitHub main → Vercel 导入仓库 → 填入环境变量 → Deploy。
