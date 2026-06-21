# X AI Reply Assistant 部署与安装指南

本文介绍如何把后端部署到 Vercel、绑定生产域名 `xleave.59et.com`，以及如何安装和配置 Chrome 插件。

## 1. 部署结构

```text
Chrome 插件
    │
    │ HTTPS POST /api/replies
    ▼
https://xleave.59et.com
    │
    ▼
Vercel Express Function
    │
    ▼
OpenAI Responses API
```

生产接口：

```text
GET  https://xleave.59et.com/health
POST https://xleave.59et.com/api/replies
```

OpenAI API Key 只配置在 Vercel，不要写入插件或提交到 GitHub。

`/api/replies` 使用用户自己的访问令牌和公网 IP 白名单保护。用户 ID 只存在于后端配置，插件无需填写。访问令牌不是 OpenAI API Key。

## 2. 部署前准备

需要：

- GitHub 仓库：[Harries/xleave](https://github.com/Harries/xleave)
- Vercel 账号
- OpenAI API Key
- `59et.com` 的 DNS 管理权限
- Google Chrome 或其他兼容 Manifest V3 的浏览器

项目结构：

```text
xleave/
├── extension/    # Chrome 插件
├── server/       # 部署到 Vercel 的 Express 后端
└── docs/
```

## 3. 部署后端到 Vercel

Vercel 可以直接识别 Express 项目。当前后端入口为：

```text
server/src/index.js
```

不需要 Docker、Nginx 或 systemd。`server/vercel.json` 已明确指定 Express Framework Preset，防止 Vercel 项目被误设为 Next.js。

### 3.1 导入 GitHub 仓库

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)。
2. 点击 **Add New → Project**。
3. 选择 GitHub 仓库 `Harries/xleave`。
4. 点击 **Import**。

### 3.2 配置项目

在 Vercel 项目配置页面填写：

| 配置项 | 值 |
| --- | --- |
| Framework Preset | `Express` |
| Root Directory | `server` |
| Build Command | 留空，使用默认值 |
| Output Directory | 留空 |
| Install Command | 留空，使用默认值 |

最关键的是将 **Root Directory** 设置为：

```text
server
```

否则 Vercel 会在仓库根目录查找 `package.json`，导致构建失败或无法识别 Express 应用。

仓库中的 `server/vercel.json` 会覆盖错误的 Framework Preset：

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "express"
}
```

Build Command、Output Directory 和 Install Command 都保持默认，不要填写 `next build`。

### 3.3 配置环境变量

在项目导入页面的 **Environment Variables**，或者部署后的：

```text
Project → Settings → Environment Variables
```

添加：

| Name | Value | 环境 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 你的 OpenAI API Key | Production、Preview |
| `OPENAI_MODEL` | `gpt-5.4-mini` | Production、Preview |
| `XLEAVE_ADMIN_TOKEN` | 管理后台登录密钥，至少 32 字符 | Production |
| `XLEAVE_PUBLIC_ORIGIN` | `https://xleave.59et.com` | Production |
| `DATABASE_URL` | Neon Postgres 连接字符串 | Production、Preview |
| `XLEAVE_USERS` | 可选：旧版环境变量用户列表，仅作迁移兜底 | Production、Preview |

### 3.4 配置 Neon Postgres

管理员后台需要持久化存储。可以在 Neon 创建 Postgres 数据库，或通过 Vercel Marketplace 添加 Neon 并连接到当前项目。

集成后确认 Vercel 环境变量中存在：

```text
DATABASE_URL
```

应用首次访问数据库时会自动创建 `xleave_users` 表，无需手动执行 SQL migration。建议使用 Neon 提供的 pooled connection string，并保留 `sslmode=require`。

再生成一个独立的管理员密钥：

```bash
openssl rand -hex 32
```

将结果保存为：

```dotenv
XLEAVE_ADMIN_TOKEN=生成的64位管理员密钥
```

管理员密钥不能与任何用户 Token 相同，也不要提交到 GitHub。

### 3.5 使用管理员后台

部署完成后访问：

```text
https://xleave.59et.com/admin
```

使用 `XLEAVE_ADMIN_TOKEN` 登录。后台支持：

- 新建用户
- 自动生成 Token，或录入用户自己生成的 Token
- 配置多个 IPv4/IPv6
- 修改用户 IP 白名单
- 停用或启用用户
- 轮换 Token
- 删除用户
- 查看每个用户累计 AI 使用次数和最后使用时间

Token 明文只在创建或轮换成功后显示一次，Neon 中仅保存 SHA-256 哈希。请立即复制给对应用户。

仅在 OpenAI 成功生成回复候选后计数一次；认证失败、IP 不允许、参数错误和 AI 生成失败均不计数。旧版 `XLEAVE_USERS` 环境变量用户没有持久化统计，需迁移到 Neon 后才会累计。

用户只需在插件中填写 Token。后端根据唯一 Token 自动找到用户，并校验该用户的 IP 白名单。

### 3.6 命令行创建用户记录

每个用户可以在项目的 `server` 目录自行生成 Token 和用户记录：

```bash
npm run user:create -- harries 203.0.113.10,2001:db8::10
```

输出示例：

```json
{"id":"harries","token":"64位随机Token","allowedIps":["203.0.113.10","2001:db8::10"]}
```

命令行输出也可以作为旧版 `XLEAVE_USERS` 的记录，或由管理员在后台创建用户时录入其中的 Token。

多个旧版用户组成一个 JSON 数组：

```json
[
  {
    "id": "harries",
    "token": "harries自己生成的64位Token",
    "allowedIps": ["203.0.113.10", "2001:db8::10"]
  },
  {
    "id": "alice",
    "token": "alice自己生成的64位Token",
    "allowedIps": ["198.51.100.20"]
  }
]
```

如果暂时未配置 Neon，可把它作为单行 JSON 放入 `XLEAVE_USERS`：

```dotenv
XLEAVE_USERS=[{"id":"harries","token":"...","allowedIps":["203.0.113.10"]},{"id":"alice","token":"...","allowedIps":["198.51.100.20"]}]
```

用户查询自己当前网络出口的公网 IP：

```bash
curl -4 https://api.ipify.org
curl -6 https://api64.ipify.org
```

也可以在插件设置中点击“检测当前公网 IP”，它会调用：

```text
GET https://xleave.59et.com/ip
```

该接口只返回 Vercel 看到的请求 IP，不调用 OpenAI，也不会自动修改用户配置。

当前版本只支持精确 IP，不支持 CIDR 网段或通配符。

注意：

- 用户自己生成 Token，但部署管理员必须通过后台创建用户记录；插件上报的 IP 不会被信任。
- 用户 ID 需为 3–64 位字母、数字、下划线或连字符，且不能重复。
- Token 至少 32 个字符，推荐使用生成脚本产生的 64 位随机值。
- 不要把真实 Token 提交到 GitHub或写死在插件源码中。
- 如果某个用户 Token 泄露，只需轮换该用户记录，不影响其他用户。
- 家庭宽带、移动网络和部分公司网络的公网 IP 可能变化，变化后可直接在后台修改该用户的 `allowedIps`，无需重新部署。
- 浏览器可能通过 IPv6 访问 Vercel；如果网络同时具有 IPv4 和 IPv6，建议把两者都加入白名单。
- 一个用户可配置多个办公地点的公网 IP。

### 3.7 用户自行生成 Token

推荐流程：

1. 用户自行确定唯一的用户 ID。
2. 用户在自己的电脑查询公网 IPv4/IPv6。
3. 用户运行 `npm run user:create -- <userId> <ip1,ip2>`，自行生成 Token。
4. 用户把生成的 Token 和 IP 交给部署管理员。
5. 管理员登录 `/admin` 创建用户，并录入该 Token 和 IP。
6. 用户在插件设置中只填写自己的 Token。

用户网络变化时，管理员在后台更新该用户的 IP；Token 泄露时，在后台单独轮换该用户 Token。

从旧版迁移时，把：

```dotenv
XLEAVE_API_TOKEN=旧Token
XLEAVE_ALLOWED_IPS=203.0.113.10,2001:db8::10
```

转换为：

```dotenv
XLEAVE_USERS=[{"id":"harries","token":"旧Token","allowedIps":["203.0.113.10","2001:db8::10"]}]
```

旧的 `XLEAVE_API_TOKEN` 和 `XLEAVE_ALLOWED_IPS` 不再生效。可先用 `XLEAVE_USERS` 保持兼容，再逐个通过后台创建 Neon 用户；迁移完成后删除 `XLEAVE_USERS`。

Vercel 部署不需要配置：

```text
PORT
```

Vercel 会负责请求入口和运行端口。插件访问域名时也不要添加 `:8787`。

建议将 `OPENAI_API_KEY` 标记为敏感变量，并且不要把真实值写入 `.env.example`。

### 3.8 开始部署

点击 **Deploy**。

部署成功后，Vercel 会生成一个临时域名，例如：

```text
https://xleave-xxxx.vercel.app
```

先使用该地址验证：

```bash
curl https://xleave-xxxx.vercel.app/health
```

正常响应：

```json
{"ok":true,"model":"gpt-5.4-mini"}
```

如果修改或补充了环境变量，需要执行一次新的部署：

```text
Project → Deployments → 最新部署 → Redeploy
```

环境变量修改不会自动影响已经完成的旧部署。

## 4. 绑定生产域名

生产后端域名为：

```text
xleave.59et.com
```

### 4.1 在 Vercel 添加域名

进入：

```text
Vercel Project → Settings → Domains
```

输入：

```text
xleave.59et.com
```

然后点击 **Add**。

### 4.2 配置 DNS

`xleave.59et.com` 是子域名，需要在 `59et.com` 的 DNS 服务商处创建 CNAME 记录。

典型配置如下：

| 类型 | 主机记录 | 记录值 |
| --- | --- | --- |
| CNAME | `xleave` | 使用 Vercel Domains 页面显示的目标值 |

Vercel 会为项目显示准确的 CNAME 目标，例如：

```text
xxxxxxxx.vercel-dns-xxx.com
```

请复制 Vercel 页面实际提供的值，不要照抄本文示例。

注意：

- 删除 `xleave` 主机记录上冲突的旧 A、AAAA 或 CNAME 记录。
- 如果 DNS 托管在 Cloudflare，验证期间建议先设为 **DNS only**。
- 不需要在 DNS 中填写端口。
- DNS 生效时间可能从几分钟到数小时不等。

### 4.3 等待验证与 HTTPS

返回 Vercel Domains 页面等待状态变为正常。验证完成后，Vercel 会自动签发和维护 HTTPS 证书。

检查 DNS：

```bash
nslookup xleave.59et.com
```

检查 HTTPS 接口：

```bash
curl https://xleave.59et.com/health
```

预期响应：

```json
{"ok":true,"model":"gpt-5.4-mini"}
```

如果提示无法解析域名，说明 DNS 尚未配置成功或仍在传播中。

## 5. 验证 AI 接口

健康检查只验证后端已运行，不会调用 OpenAI。可以使用以下请求验证完整链路：

```bash
curl -X POST https://xleave.59et.com/api/replies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 该用户的Token" \
  -d '{
    "source": {
      "author": "Test User",
      "handle": "@test",
      "text": "What are you building today?",
      "url": "https://x.com/test/status/1"
    },
    "thread": [],
    "draft": "",
    "pageUrl": "https://x.com/test/status/1",
    "preferences": {
      "language": "zh-CN",
      "maxCharacters": 180,
      "includeContext": true,
      "persona": "表达简洁、自然"
    }
  }'
```

成功时会返回五条候选回复。

请从该用户 `allowedIps` 中的网络执行测试。

常见错误：

| 错误 | 原因 |
| --- | --- |
| `后端尚未配置用户存储` | Neon `DATABASE_URL` 和兼容的 `XLEAVE_USERS` 均未配置 |
| `访问令牌无效` | Token 不存在、错误或请求头缺失 |
| `用户尚未配置有效的公网 IP；当前公网 IP：<IP>` | 当前用户没有有效 IP；提示中的 IP 可加入该用户配置 |
| `当前公网 IP 不允许访问：<IP>` | 返回的请求出口 IP 不在白名单中 |
| `后端尚未配置 OPENAI_API_KEY` | Vercel 没有配置环境变量，或配置后没有重新部署 |
| `OpenAI API Key 无效` | API Key 错误或已失效 |
| HTTP 429 | OpenAI 额度不足或触发速率限制 |
| HTTP 500/502 | 查看 Vercel Function 日志确认具体错误 |

Vercel 日志位置：

```text
Project → Logs
```

## 6. 插件生产接口配置

插件已经默认使用：

```text
https://xleave.59et.com
```

实际请求地址为：

```text
https://xleave.59et.com/api/replies
```

`extension/manifest.json` 已包含：

```json
"host_permissions": [
  "http://localhost/*",
  "http://127.0.0.1/*",
  "https://xleave.59et.com/*"
]
```

其中 localhost 权限仅用于本地开发。

插件后端地址中：

- 不要填写端口。
- 不要填写 `/api/replies`。
- 不要使用 `http://`。
- 正确地址是 `https://xleave.59et.com`。

插件会自动追加 `/api/replies`。

每次请求还会自动携带：

```http
Authorization: Bearer <访问令牌>
```

后端优先用唯一 Token 在 Neon 中自动查找用户，并要求公网出口 IP 存在于该用户的 `allowedIps`；旧版 `XLEAVE_USERS` 仅作为迁移兜底。

## 7. 安装 Chrome 插件

### 7.1 获取代码

```bash
git clone https://github.com/Harries/xleave.git
cd xleave
```

也可以在 GitHub 仓库页面点击 **Code → Download ZIP**，下载后解压。

### 7.2 使用开发者模式安装

1. 打开 Chrome。
2. 在地址栏输入 `chrome://extensions`。
3. 打开右上角的 **开发者模式**。
4. 点击 **加载已解压的扩展程序**。
5. 选择项目中的 `extension` 文件夹。
6. 确认插件版本不低于 `0.4.1`。
7. 打开或刷新 `https://x.com`。

必须选择包含 `manifest.json` 的 `extension` 文件夹，不要选择整个项目目录或 ZIP 文件。

### 7.3 配置插件

点击 Chrome 工具栏中的插件图标，然后点击 **打开设置**。

生产配置：

| 配置项 | 建议值 |
| --- | --- |
| 后端地址 | `https://xleave.59et.com` |
| 访问令牌 | 自己生成并登记在该用户记录中的 Token |
| 回复语言 | 跟随原帖，或选择固定语言 |
| 最大字符数 | `180` |
| 对话上下文 | 开启 |
| 个人表达风格 | 按需填写 |

如果从旧版本升级，插件会把旧的 localhost 默认地址迁移到生产域名。用户手动填写的其他后端地址不会被覆盖。

访问令牌保存在 `chrome.storage.local`，只存储在当前浏览器的扩展数据中，不会通过 Chrome 账号同步。它不会被发送给 X，只会发送到配置的后端。

### 7.4 使用插件

1. 登录 X。
2. 点击帖子的回复按钮。
3. 在回复框工具栏点击 **AI 生成回复**。
4. 等待生成友好、简短、思考、好奇、幽默五条候选。
5. 点击候选，将内容填入回复框。
6. 修改并确认内容。
7. 手动点击 X 的回复按钮发送。

插件不会自动发送回复。

## 8. 更新后端与插件

### 8.1 更新 Vercel 后端

Vercel 项目连接 GitHub 后，推送到生产分支会自动触发部署：

```bash
git push origin main
```

查看部署状态：

```text
Vercel Project → Deployments
```

部署失败时打开对应 Deployment 查看 Build Logs。

### 8.2 更新开发者模式插件

拉取最新代码：

```bash
git pull --ff-only
```

然后：

1. 打开 `chrome://extensions`。
2. 点击插件卡片上的 **重新加载**。
3. 刷新已经打开的 X 页面。

## 9. 本地开发后端

本地开发仍然可以使用端口 `8787`：

```bash
cd server
npm ci
cp .env.example .env
```

编辑 `server/.env`：

```dotenv
OPENAI_API_KEY=你的_OpenAI_API_Key
OPENAI_MODEL=gpt-5.4-mini
XLEAVE_USERS=[{"id":"harries","token":"使用用户生成脚本产生的Token","allowedIps":["127.0.0.1","::1"]}]
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

本地测试插件时，把插件设置中的后端地址改为：

```text
http://localhost:8787
```

本地开发可继续使用 `XLEAVE_USERS`，插件设置中填写对应用户的 Token。

生产部署到 Vercel 时不使用 `PORT`。

## 10. 故障排查

### 域名无法访问

检查：

```bash
nslookup xleave.59et.com
curl -I https://xleave.59et.com/health
```

然后确认：

- 域名已经添加到正确的 Vercel 项目。
- DNS 使用的是 Vercel Domains 页面提供的 CNAME 目标。
- `xleave` 没有冲突的 A、AAAA 或 CNAME 记录。
- Vercel Domains 页面状态已经正常。

### Vercel 构建失败

确认项目配置：

```text
Root Directory = server
Framework Preset = Express
```

并确认 `server/package.json`、`server/package-lock.json` 和 `server/src/index.js` 已提交到 GitHub。

如果日志出现以下内容：

```text
Your application is being built using next build
No Next.js version detected
```

说明 Vercel 把项目错误识别为 Next.js。处理步骤：

1. 进入 `Project → Settings → Build and Deployment`。
2. 将 Framework Preset 改为 `Express`。
3. 清空手工填写的 Build Command 和 Output Directory。
4. 确认 Root Directory 为 `server`。
5. 确认部署使用的提交已经包含 `server/vercel.json`。
6. 重新部署，并选择不使用旧构建缓存。

### `/health` 返回 404

- 确认部署的是最新的 `main` 分支。
- 确认 Root Directory 为 `server`。
- 查看 Vercel Build Logs 是否识别到 Express。

### 插件提示 Failed to fetch

- 在浏览器中直接打开 `https://xleave.59et.com/health`。
- 确认插件版本不低于 `0.4.1`。
- 在 `chrome://extensions` 重新加载插件。
- 确认插件设置里的后端地址没有端口和接口路径。
- 刷新 X 页面。

### 插件提示访问令牌无效

- 确认插件设置已填写访问令牌。
- 确认 Token 与管理员后台分配给自己的 Token 完全一致。
- 检查复制时是否带入空格或换行。
- 如果管理员刚刚轮换 Token，确认使用的是新 Token。
- 如果该用户重新生成过 Token，该用户的每台浏览器都需要更新设置。

### 提示当前公网 IP 不允许访问

错误提示会直接显示后端检测到的公网 IP；Vercel Logs 中也会输出：

```text
[X AI Reply] user=harries public_ip=203.0.113.10
```

先查询当前出口 IP：

```bash
curl -4 https://api.ipify.org
curl -6 https://api64.ipify.org
```

然后：

1. 管理员登录 `/admin`。
2. 找到当前用户。
3. 把实际使用的 IPv4/IPv6 加入该用户 IP 白名单并保存。
4. 再次调用接口，无需重新部署。

如果从家庭宽带切换到手机热点、VPN、公司网络或其他 Wi-Fi，出口 IP 通常会变化，需要更新白名单。

### 插件没有显示 AI 按钮

- 确认插件已启用。
- 重新加载插件并刷新 X。
- 确认访问的是 `x.com` 或 `twitter.com`。
- X 页面结构改版后，可能需要更新 `extension/content.js` 的选择器。

## 11. 上线安全说明

后端已经启用多用户、Bearer Token 和用户级公网 IP 白名单。用户、令牌或来源 IP 不匹配的请求无法调用：

```text
https://xleave.59et.com/api/replies
```

每个用户拥有独立 Token 和白名单，单个用户泄露时可在后台单独停用、删除或轮换 Token，不影响其他用户。当前仍没有面向普通用户的自助注册和密码找回流程。

当前方案适合个人使用或少量可信用户。正式公开发布时，还建议增加：

- 用户自助注册和后台管理
- 短期访问令牌
- 令牌撤销与轮换
- 按用户和 IP 限流
- 每日调用次数及费用上限
- Vercel Firewall 规则
- 请求日志脱敏
- 异常用量告警
- OpenAI API Key 定期轮换

服务端会将原帖文字、作者、可见对话上下文、草稿和表达风格发送给 OpenAI。应向插件用户提供隐私政策，并说明数据处理方式。

## 12. 官方参考

- [Vercel：Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
- [Vercel：添加自定义域名](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
- [Vercel：环境变量](https://vercel.com/docs/environment-variables)
