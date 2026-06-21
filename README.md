# X AI Reply Assistant

一个 Manifest V3 Chrome 插件：识别 X 的回复框和原帖，在回复框旁加入「AI 生成回复」，从后端生成友好、简短、思考、好奇、幽默五条候选。候选只会填入回复框，最终发送必须由用户手动确认。

## 目录

- `extension/`：Chrome 插件，无构建步骤
- `server/`：Node.js 后端，负责安全保存 OpenAI API Key 并生成回复
- `docs/ARCHITECTURE.zh-CN.md`：系统技术架构、数据流和安全设计
- `docs/DEPLOYMENT.zh-CN.md`：完整的后端部署与 Chrome 插件安装指南

## 技术文档

- [技术架构](docs/ARCHITECTURE.zh-CN.md)
- [部署与安装指南](docs/DEPLOYMENT.zh-CN.md)

## 部署与安装文档

请阅读 [部署与安装指南](docs/DEPLOYMENT.zh-CN.md)。文档包含：

- 本机快速运行
- Vercel 部署及环境变量配置
- 绑定生产域名 `xleave.59et.com` 和配置 DNS
- Chrome 开发者模式安装与配置
- 更新、故障排查和上线安全检查

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
XLEAVE_ADMIN_TOKEN=管理员登录密钥
DATABASE_URL=Neon连接字符串
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
首次使用还需要填写自己的访问令牌。

## 当前行为

- 读取当前回复目标的作者、账号、正文和链接
- 可附带最多三条当前页面中可见的对话上下文
- 生成友好、简短、思考、好奇、幽默五种风格
- 点击候选后填入 X 回复框
- 不会自动点击发送

## 部署后端

插件默认使用以下线上后端：

```text
https://xleave.59et.com
```

`manifest.json` 已允许访问该域名，同时保留 `localhost` 和 `127.0.0.1` 供本地开发使用。正式对外服务还应增加用户鉴权、速率限制、日志脱敏和来源校验。

不要把 `OPENAI_API_KEY` 写进插件代码。

`/api/replies` 已启用多用户、Bearer Token 和公网 IP 白名单双重认证。正式用户配置保存在 Neon Postgres，并通过管理员后台维护：

```text
https://xleave.59et.com/admin
```

每个用户在后端拥有独立的 `id`、Token 和 `allowedIps`。管理员可以创建、停用、删除用户，修改 IP 和轮换 Token。Token 在 Neon 中只保存哈希，明文仅显示一次。插件只需填写 Token；后端通过唯一 Token 自动识别用户，并校验该用户的真实来源公网 IP。

后台需要配置 `XLEAVE_ADMIN_TOKEN` 和 Neon 的 `DATABASE_URL`。`XLEAVE_USERS` 继续作为旧版迁移兜底。

## 已知限制

X 会持续调整页面 DOM。插件优先使用 `data-testid` 和 ARIA 属性，但 X 改版后仍可能需要更新选择器。帖子仅含图片、视频而没有可提取文字时，当前版本会提示没有识别到原帖文字。
