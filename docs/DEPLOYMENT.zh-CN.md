# X AI Reply Assistant 部署与安装指南

本文介绍如何部署 `xleave` 后端，以及如何安装和配置 Chrome 插件。

## 1. 系统结构

```text
Chrome 插件
    │
    │ HTTPS POST /api/replies
    ▼
Nginx（HTTPS）
    │
    │ http://127.0.0.1:8787
    ▼
Node.js 后端
    │
    ▼
OpenAI Responses API
```

OpenAI API Key 只能配置在后端，不要写入插件、提交到 GitHub，或发送给插件用户。

## 2. 环境要求

### 后端

- Node.js 20 或更高版本
- npm
- OpenAI API Key
- 线上部署建议使用 Linux、systemd、Nginx 和 HTTPS 域名

### 插件

- Google Chrome 或其他兼容 Manifest V3 的 Chromium 浏览器
- 能正常访问 `https://x.com`
- 能访问后端地址

## 3. 获取代码

```bash
git clone https://github.com/Harries/xleave.git
cd xleave
```

后续示例默认项目目录为 `/opt/xleave`。如果实际目录不同，请替换命令中的路径。

## 4. 方式一：本机快速运行

适用于开发、个人测试，以及插件和后端运行在同一台电脑的场景。

### 4.1 安装依赖

```bash
cd server
npm ci
cp .env.example .env
```

编辑 `server/.env`：

```dotenv
OPENAI_API_KEY=你的_OpenAI_API_Key
OPENAI_MODEL=gpt-5.4-mini
PORT=8787
```

配置说明：

| 配置项 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | 是 | 无 | 后端调用 OpenAI 使用的 API Key |
| `OPENAI_MODEL` | 否 | `gpt-5.4-mini` | 生成回复使用的模型 |
| `PORT` | 否 | `8787` | 后端监听端口 |

`.env` 已被 Git 忽略，不要使用 `git add -f` 强制提交。

### 4.2 启动服务

开发模式：

```bash
npm run dev
```

普通模式：

```bash
npm start
```

看到以下信息表示服务已启动：

```text
X AI Reply server listening on http://localhost:8787
```

### 4.3 检查服务

```bash
curl http://localhost:8787/health
```

正常响应示例：

```json
{"ok":true,"model":"gpt-5.4-mini"}
```

本机使用时，插件设置中的后端地址保持：

```text
http://localhost:8787
```

## 5. 方式二：部署到 Linux 云服务器

下面以 Ubuntu/Debian、域名 `ai-reply.example.com` 为例。请替换成自己的域名。

### 5.1 准备目录和代码

以下命令通常需要 `sudo` 权限：

```bash
sudo mkdir -p /opt/xleave
sudo chown "$USER":"$USER" /opt/xleave
git clone https://github.com/Harries/xleave.git /opt/xleave
cd /opt/xleave/server
npm ci --omit=dev
```

确认服务器上的 Node.js 版本：

```bash
node --version
```

版本应为 `v20` 或更高。

### 5.2 配置生产环境变量

生产环境建议把密钥放在项目目录之外：

```bash
sudo install -m 600 /dev/null /etc/xleave.env
sudo nano /etc/xleave.env
```

写入：

```dotenv
OPENAI_API_KEY=你的_OpenAI_API_Key
OPENAI_MODEL=gpt-5.4-mini
PORT=8787
```

不要在变量值两边添加多余引号或空格。

### 5.3 使用 systemd 常驻运行

创建专用系统用户：

```bash
sudo useradd --system --home /opt/xleave --shell /usr/sbin/nologin xleave
sudo chown -R xleave:xleave /opt/xleave
sudo chown root:xleave /etc/xleave.env
sudo chmod 640 /etc/xleave.env
```

创建 `/etc/systemd/system/xleave.service`：

```ini
[Unit]
Description=X AI Reply Assistant backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=xleave
Group=xleave
WorkingDirectory=/opt/xleave/server
Environment=NODE_ENV=production
EnvironmentFile=/etc/xleave.env
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict

[Install]
WantedBy=multi-user.target
```

如果 `which node` 的结果不是 `/usr/bin/node`，请把 `ExecStart` 改为实际路径。

加载并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now xleave
sudo systemctl status xleave
```

查看日志：

```bash
sudo journalctl -u xleave -f
```

在服务器本机检查：

```bash
curl http://127.0.0.1:8787/health
```

后端固定监听 `127.0.0.1`，不会直接暴露端口。外部请求应通过 Nginx 进入。

### 5.4 配置 Nginx

将域名的 DNS `A` 或 `AAAA` 记录指向服务器。

创建 `/etc/nginx/sites-available/xleave`：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name ai-reply.example.com;

    client_max_body_size 64k;

    location = /health {
        proxy_pass http://127.0.0.1:8787/health;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /api/replies {
        proxy_pass http://127.0.0.1:8787/api/replies;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location / {
        return 404;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/xleave /etc/nginx/sites-enabled/xleave
sudo nginx -t
sudo systemctl reload nginx
```

### 5.5 启用 HTTPS

可使用 Certbot 为 Nginx 申请证书：

```bash
sudo certbot --nginx -d ai-reply.example.com
```

完成后检查：

```bash
curl https://ai-reply.example.com/health
```

线上插件后端必须优先使用 HTTPS。不要让用户通过公网访问明文 HTTP 接口。

## 6. 配置线上版插件

Chrome 扩展只能请求 `manifest.json` 中 `host_permissions` 允许的地址。

打开 `extension/manifest.json`，把生产域名加入 `host_permissions`：

```json
"host_permissions": [
  "http://localhost/*",
  "http://127.0.0.1/*",
  "https://ai-reply.example.com/*"
]
```

修改后需要在 `chrome://extensions` 页面重新加载插件。

然后打开插件设置，将“后端地址”改为：

```text
https://ai-reply.example.com
```

地址末尾可以不写 `/`，也不要填写 `/api/replies`；插件会自动补上接口路径。

## 7. 安装 Chrome 插件

### 7.1 开发者模式安装

1. 下载或克隆本仓库。
2. 打开 Chrome。
3. 在地址栏输入 `chrome://extensions`。
4. 打开右上角“开发者模式”。
5. 点击“加载已解压的扩展程序”。
6. 选择项目中的 `extension` 文件夹。
7. 点击扩展卡片上的“详细信息”。
8. 确认扩展可以访问 `x.com` 和配置的后端域名。
9. 打开或刷新 `https://x.com`。

不要选择整个 `xleave` 项目目录；必须选择包含 `manifest.json` 的 `extension` 目录。

### 7.2 配置插件

点击 Chrome 工具栏中的插件图标，然后点击“打开设置”：

- 后端地址：本机使用 `http://localhost:8787`，线上使用部署好的 HTTPS 域名。
- 回复语言：可跟随原帖，或固定为中文、英文、日文。
- 最大字符数：允许范围为 30–500。
- 个人表达风格：填写职业、口吻、禁用表达等偏好。
- 对话上下文：开启后最多提交 3 条当前页面可见上下文。

设置保存在 Chrome 的扩展同步存储中。OpenAI API Key 不会保存在插件里。

### 7.3 使用插件

1. 登录 X。
2. 点击一条帖子的回复按钮。
3. 在回复框工具栏点击“AI 生成回复”。
4. 等待生成友好、专业、幽默三条候选。
5. 点击一条候选，将内容填入回复框。
6. 根据需要修改。
7. 手动点击 X 的“回复”按钮发送。

插件不会自动发送内容。

## 8. 打包给其他用户安装

### 8.1 内部测试包

先确保生产域名已写入 `extension/manifest.json`，再执行：

```bash
cd extension
zip -r ../xleave-extension.zip .
```

测试用户需要先解压 ZIP，再通过 `chrome://extensions` 加载解压后的目录。Chrome 的“加载已解压的扩展程序”不能直接选择 ZIP。

### 8.2 发布到 Chrome Web Store

上传的 ZIP 根目录必须直接包含 `manifest.json`。发布前至少需要准备：

- 插件名称、说明、图标和截图
- 隐私政策
- 对 `storage`、`host_permissions` 和 X 页面访问权限的用途说明
- 后端域名和数据处理说明
- 可供审核人员验证的后端服务

发布新版本时，还需要递增 `extension/manifest.json` 中的 `version`。

## 9. 更新部署

### 更新后端

```bash
cd /opt/xleave
sudo -u xleave git pull --ff-only
cd server
sudo -u xleave npm ci --omit=dev
sudo systemctl restart xleave
sudo systemctl status xleave
```

如果仓库目录不允许 `xleave` 用户访问 GitHub，可由管理员执行 `git pull`，随后恢复目录所有权并重启服务。

### 更新开发者模式插件

1. 拉取最新代码。
2. 打开 `chrome://extensions`。
3. 点击插件卡片上的“重新加载”。
4. 刷新已经打开的 X 页面。

## 10. 故障排查

### 插件没有显示“AI 生成回复”

- 确认插件已启用。
- 在 `chrome://extensions` 点击“重新加载”。
- 刷新 X 页面后重新打开回复框。
- 确认当前访问的是 `x.com` 或 `twitter.com`。
- X 页面结构可能发生变化，需要更新 `extension/content.js` 中的选择器。

### 提示“Failed to fetch”或后端请求失败

- 检查插件设置中的后端地址。
- 确认线上域名已加入 `manifest.json` 的 `host_permissions`。
- 使用浏览器访问后端 `/health`。
- 检查 HTTPS 证书是否有效。
- 检查 Nginx 和 systemd 日志。

```bash
sudo tail -f /var/log/nginx/error.log
sudo journalctl -u xleave -f
```

### 提示“后端尚未配置 OPENAI_API_KEY”

检查 `/etc/xleave.env` 或本地 `server/.env`，然后重启服务：

```bash
sudo systemctl restart xleave
```

### 提示“OpenAI API Key 无效”

- 检查 API Key 是否完整。
- 确认环境变量中没有多余空格。
- 确认 Key 所属项目可调用配置的模型。

### 返回 429

这通常表示请求过于频繁、账户额度不足，或触发了 OpenAI 的速率限制。检查 OpenAI 项目的用量和限额。

### Nginx 返回 502

检查后端是否运行：

```bash
sudo systemctl status xleave
curl http://127.0.0.1:8787/health
```

同时确认 Nginx 的 `proxy_pass` 端口与 `PORT` 一致。

## 11. 上线前安全检查

当前版本适合个人使用和受控测试。后端接口尚未实现用户登录或 API Token 鉴权。如果把域名公开，任何知道接口地址的人都可能消耗你的 OpenAI 额度。

正式对外服务前，至少应增加：

- 用户鉴权或插件 API Token
- 按用户和 IP 的速率限制
- 每日调用次数和费用上限
- 请求日志脱敏
- 异常调用监控
- 密钥定期轮换
- 隐私政策和数据保留规则

服务端会把原帖文字、作者信息、可见对话上下文、草稿和用户配置的表达风格发送给 OpenAI。部署者应向用户明确说明这些数据如何被处理。

