# X AI Reply Assistant

一个 Manifest V3 Chrome 插件：识别 X 的回复框和原帖，在回复框旁加入「AI 生成回复」，从本地后端生成友好、专业、幽默三条候选。候选只会填入回复框，最终发送必须由用户手动确认。

## 目录

- `extension/`：Chrome 插件，无构建步骤
- `server/`：Node.js 后端，负责安全保存 OpenAI API Key 并生成回复

## 运行后端

需要 Node.js 20 或更高版本。

```bash
cd server
npm install
cp .env.example .env
```

编辑 `server/.env`：

```dotenv
OPENAI_API_KEY=你的_OpenAI_API_Key
OPENAI_MODEL=gpt-5.4-mini
PORT=8787
```

启动：

```bash
npm run dev
```

检查：

```bash
curl http://localhost:8787/health
```

## 加载插件

1. 打开 `chrome://extensions`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目的 `extension` 文件夹
5. 打开或刷新 `https://x.com`
6. 点击任意帖子的回复按钮，再点击「AI 生成回复」

点击插件图标可以进入设置页面，修改回复语言、字数和个人表达风格。

## 当前行为

- 读取当前回复目标的作者、账号、正文和链接
- 可附带最多三条当前页面中可见的对话上下文
- 生成友好、专业、幽默三种风格
- 点击候选后填入 X 回复框
- 不会自动点击发送

## 部署后端

当前 `manifest.json` 只允许访问 `localhost` 和 `127.0.0.1`。部署到线上后：

1. 将线上 HTTPS 域名加入 `extension/manifest.json` 的 `host_permissions`
2. 在插件设置中把后端地址改为线上地址
3. 后端增加用户鉴权、速率限制、日志脱敏和来源校验

不要把 `OPENAI_API_KEY` 写进插件代码。

## 已知限制

X 会持续调整页面 DOM。插件优先使用 `data-testid` 和 ARIA 属性，但 X 改版后仍可能需要更新选择器。帖子仅含图片、视频而没有可提取文字时，当前版本会提示没有识别到原帖文字。

