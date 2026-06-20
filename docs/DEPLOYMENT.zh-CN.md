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

`/api/replies` 使用访问令牌和公网 IP 白名单双重保护。访问令牌不是 OpenAI API Key。

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
| `XLEAVE_API_TOKEN` | 自己生成的高强度随机令牌 | Production、Preview |
| `XLEAVE_ALLOWED_IPS` | 允许访问的公网 IP 列表 | Production、Preview |

在本地终端生成访问令牌：

```bash
openssl rand -hex 32
```

命令会生成类似下面的 64 位随机字符串：

```text
8e31c5...省略...a9240f
```

把完整结果保存为 Vercel 的 `XLEAVE_API_TOKEN`。插件设置中需要填写相同的值。

查询当前网络出口的公网 IP：

```bash
curl -4 https://api.ipify.org
curl -6 https://api64.ipify.org
```

把需要允许的公网 IPv4 和 IPv6 使用英文逗号分隔：

```dotenv
XLEAVE_ALLOWED_IPS=203.0.113.10,2001:db8::10
```

只允许一个 IPv4 时：

```dotenv
XLEAVE_ALLOWED_IPS=203.0.113.10
```

当前版本只支持精确 IP，不支持 CIDR 网段或通配符。

注意：

- `OPENAI_API_KEY` 和 `XLEAVE_API_TOKEN` 是两个不同的密钥。
- 不要把任何一个真实密钥提交到 GitHub。
- 不要把 `XLEAVE_API_TOKEN` 直接写死在插件源码中。
- 如果怀疑令牌泄露，重新生成令牌、更新 Vercel 环境变量并重新部署，然后更新插件设置。
- 家庭宽带、移动网络和部分公司网络的公网 IP 可能变化，变化后需要更新 `XLEAVE_ALLOWED_IPS` 并重新部署。
- 浏览器可能通过 IPv6 访问 Vercel；如果网络同时具有 IPv4 和 IPv6，建议把两者都加入白名单。
- 多个办公地点可继续用英文逗号添加 IP。

Vercel 部署不需要配置：

```text
PORT
```

Vercel 会负责请求入口和运行端口。插件访问域名时也不要添加 `:8787`。

建议将 `OPENAI_API_KEY` 标记为敏感变量，并且不要把真实值写入 `.env.example`。

### 3.4 开始部署

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
  -H "Authorization: Bearer 你的_XLEAVE_API_TOKEN" \
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

成功时会返回三条候选回复。

请从已经加入 `XLEAVE_ALLOWED_IPS` 的网络执行测试。

常见错误：

| 错误 | 原因 |
| --- | --- |
| `后端尚未配置 XLEAVE_API_TOKEN` | Vercel 没有配置接口访问令牌，或配置后没有重新部署 |
| `访问令牌无效` | 请求未携带令牌，或插件令牌与 Vercel 配置不一致 |
| `后端尚未配置 XLEAVE_ALLOWED_IPS；当前公网 IP：<IP>` | Vercel 没有配置有效白名单；提示中的 IP 可直接用于配置 |
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

后端只接受与 Vercel 环境变量 `XLEAVE_API_TOKEN` 完全一致的令牌。

此外，请求的公网出口 IP 必须存在于：

```text
XLEAVE_ALLOWED_IPS
```

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
6. 确认插件版本不低于 `0.2.1`。
7. 打开或刷新 `https://x.com`。

必须选择包含 `manifest.json` 的 `extension` 文件夹，不要选择整个项目目录或 ZIP 文件。

### 7.3 配置插件

点击 Chrome 工具栏中的插件图标，然后点击 **打开设置**。

生产配置：

| 配置项 | 建议值 |
| --- | --- |
| 后端地址 | `https://xleave.59et.com` |
| 访问令牌 | 与 Vercel `XLEAVE_API_TOKEN` 相同 |
| 回复语言 | 跟随原帖，或选择固定语言 |
| 最大字符数 | `180` |
| 对话上下文 | 开启 |
| 个人表达风格 | 按需填写 |

如果从旧版本升级，插件会把旧的 localhost 默认地址迁移到生产域名。用户手动填写的其他后端地址不会被覆盖。

访问令牌保存在 `chrome.storage.local`，只存储在当前浏览器的扩展数据中，不会通过 Chrome 账号同步。它不会被发送给 X，只会作为 Authorization 请求头发送到配置的后端。

### 7.4 使用插件

1. 登录 X。
2. 点击帖子的回复按钮。
3. 在回复框工具栏点击 **AI 生成回复**。
4. 等待生成友好、专业、幽默三条候选。
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
XLEAVE_API_TOKEN=使用_openssl_rand_hex_32_生成的令牌
XLEAVE_ALLOWED_IPS=127.0.0.1,::1
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

插件设置中的访问令牌填写本地 `.env` 里的 `XLEAVE_API_TOKEN`。

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
- 确认插件版本不低于 `0.2.1`。
- 在 `chrome://extensions` 重新加载插件。
- 确认插件设置里的后端地址没有端口和接口路径。
- 刷新 X 页面。

### 插件提示访问令牌无效

- 确认插件设置已填写访问令牌。
- 确认它与 Vercel `XLEAVE_API_TOKEN` 完全一致。
- 检查复制时是否带入空格或换行。
- 确认环境变量修改后已经重新部署。
- 如果重新生成过令牌，每台安装插件的浏览器都需要更新设置。

### 提示当前公网 IP 不允许访问

错误提示会直接显示后端检测到的公网 IP；Vercel Logs 中也会输出：

```text
[X AI Reply] request public IP: 203.0.113.10
```

先查询当前出口 IP：

```bash
curl -4 https://api.ipify.org
curl -6 https://api64.ipify.org
```

然后：

1. 把实际使用的 IPv4/IPv6 加入 Vercel `XLEAVE_ALLOWED_IPS`。
2. 多个 IP 使用英文逗号分隔。
3. 保存环境变量。
4. 重新部署 Production。
5. 再次调用接口。

如果从家庭宽带切换到手机热点、VPN、公司网络或其他 Wi-Fi，出口 IP 通常会变化，需要更新白名单。

### 插件没有显示 AI 按钮

- 确认插件已启用。
- 重新加载插件并刷新 X。
- 确认访问的是 `x.com` 或 `twitter.com`。
- X 页面结构改版后，可能需要更新 `extension/content.js` 的选择器。

## 11. 上线安全说明

后端已经启用 Bearer Token 和公网 IP 白名单双重认证。令牌错误或来源 IP 不在白名单中的请求无法调用：

```text
https://xleave.59et.com/api/replies
```

这能显著降低接口被盗用的风险，即使令牌泄露，攻击者的公网 IP 仍需位于白名单中。但它不是完整的用户账号系统。拥有白名单网络和插件设备访问权的人仍可能读取并使用本地令牌。

当前方案适合个人使用或少量可信用户。正式公开发布时，还建议增加：

- 每位用户独立登录和短期访问令牌
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
