const GITHUB_URL = "https://github.com/Harries/xleave";

export function registerHomepage(app) {
  app.get("/", (_request, response) => {
    setPublicPageHeaders(response);
    response.type("html").send(renderHomepage());
  });

  app.get("/support", (_request, response) => {
    setPublicPageHeaders(response);
    response.type("html").send(renderSupportPage());
  });

  app.get("/privacy", (_request, response) => {
    setPublicPageHeaders(response);
    response.type("html").send(renderPrivacyPage());
  });
}

export function renderHomepage() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="XLeave 是一款帮助你在 X 回复框中生成自然、有活人感回复候选的 Chrome 插件。">
    <meta name="theme-color" content="#11132d">
    <title>XLeave · 让每一次回复更自然</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #080918;
        --panel: rgba(22, 24, 54, .72);
        --line: rgba(255, 255, 255, .11);
        --text: #f7f8ff;
        --muted: #a7accb;
        --cyan: #26d8ff;
        --blue: #5267ff;
        --violet: #9d4dff;
        font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body {
        margin: 0;
        color: var(--text);
        background:
          radial-gradient(circle at 16% 5%, rgba(38, 216, 255, .14), transparent 28rem),
          radial-gradient(circle at 86% 28%, rgba(157, 77, 255, .17), transparent 30rem),
          var(--bg);
      }
      a { color: inherit; text-decoration: none; }
      .wrap { width: min(1120px, calc(100% - 40px)); margin: 0 auto; }
      nav { display: flex; align-items: center; justify-content: space-between; padding: 24px 0; }
      .brand { display: flex; align-items: center; gap: 11px; font-weight: 800; letter-spacing: -.02em; }
      .brand-mark {
        display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px;
        background: linear-gradient(145deg, #172378, #12142e);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.12), 0 10px 30px rgba(38,216,255,.12);
      }
      .brand-mark svg { width: 27px; height: 27px; }
      .nav-links { display: flex; align-items: center; gap: 24px; color: var(--muted); font-size: 14px; }
      .nav-links a:hover { color: var(--text); }
      .hero { display: grid; grid-template-columns: 1.05fr .95fr; gap: 72px; align-items: center; padding: 94px 0 112px; }
      .eyebrow {
        display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border: 1px solid rgba(38,216,255,.22);
        border-radius: 999px; background: rgba(38,216,255,.07); color: #a8efff; font-size: 13px; font-weight: 700;
      }
      .eyebrow::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 13px var(--cyan); }
      h1 { margin: 25px 0 22px; max-width: 720px; font-size: clamp(44px, 7vw, 76px); line-height: 1.03; letter-spacing: -.055em; }
      .gradient-text { color: transparent; background: linear-gradient(90deg, #7deaff, #8992ff 55%, #ca84ff); background-clip: text; -webkit-background-clip: text; }
      .lead { max-width: 640px; margin: 0; color: var(--muted); font-size: clamp(17px, 2vw, 20px); line-height: 1.75; }
      .cta { display: flex; gap: 13px; flex-wrap: wrap; margin-top: 32px; }
      .button { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 20px; border-radius: 13px; font-weight: 750; }
      .primary { background: linear-gradient(100deg, var(--cyan), #6a70ff 65%, var(--violet)); color: #080918; box-shadow: 0 15px 38px rgba(82,103,255,.25); }
      .secondary { border: 1px solid var(--line); background: rgba(255,255,255,.045); }
      .secondary:hover { border-color: rgba(255,255,255,.24); background: rgba(255,255,255,.075); }
      .micro { margin-top: 18px; color: #777e9f; font-size: 13px; }
      .demo {
        position: relative; padding: 18px; border: 1px solid var(--line); border-radius: 26px;
        background: linear-gradient(145deg, rgba(34,37,78,.86), rgba(13,14,34,.9));
        box-shadow: 0 30px 90px rgba(0,0,0,.4);
      }
      .demo::before { content: ""; position: absolute; inset: -1px; border-radius: inherit; background: linear-gradient(135deg, rgba(38,216,255,.32), transparent 35%, rgba(157,77,255,.28)); pointer-events: none; mask: linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0); mask-composite: exclude; padding: 1px; }
      .post { padding: 18px; border-radius: 17px; background: rgba(7,8,22,.68); }
      .person { display: flex; align-items: center; gap: 11px; }
      .avatar { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg,#253585,#8547bf); font-weight: 800; }
      .person strong, .person span { display: block; }
      .person span { margin-top: 2px; color: #777e9f; font-size: 13px; }
      .post p { margin: 16px 0 4px; color: #dfe2f5; line-height: 1.65; }
      .reply-box { margin-top: 12px; padding: 16px; border: 1px solid rgba(82,103,255,.26); border-radius: 17px; background: rgba(26,29,65,.84); }
      .reply-label { display: flex; align-items: center; justify-content: space-between; margin-bottom: 13px; color: #b6bbd8; font-size: 13px; }
      .ai-pill { padding: 5px 9px; border-radius: 99px; background: linear-gradient(90deg, rgba(38,216,255,.14), rgba(157,77,255,.15)); color: #bdefff; font-weight: 700; }
      .candidate { margin-top: 9px; padding: 12px 13px; border: 1px solid var(--line); border-radius: 12px; color: #e7e9f8; font-size: 14px; line-height: 1.55; background: rgba(255,255,255,.035); }
      .candidate:first-of-type { border-color: rgba(38,216,255,.34); background: rgba(38,216,255,.07); }
      section { padding: 84px 0; }
      .section-head { max-width: 690px; margin-bottom: 34px; }
      h2 { margin: 0 0 14px; font-size: clamp(32px, 4vw, 48px); letter-spacing: -.04em; }
      .section-head p { margin: 0; color: var(--muted); font-size: 17px; line-height: 1.7; }
      .features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
      .card { padding: 26px; border: 1px solid var(--line); border-radius: 20px; background: var(--panel); backdrop-filter: blur(14px); }
      .card-icon { display: grid; place-items: center; width: 42px; height: 42px; margin-bottom: 20px; border-radius: 13px; background: rgba(82,103,255,.14); color: #aeb5ff; font-size: 20px; }
      .card h3 { margin: 0 0 10px; font-size: 18px; }
      .card p { margin: 0; color: var(--muted); line-height: 1.7; font-size: 14px; }
      .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; counter-reset: steps; }
      .step { position: relative; padding: 25px; border-top: 1px solid var(--line); counter-increment: steps; }
      .step::before { content: "0" counter(steps); display: block; margin-bottom: 23px; color: #7780cb; font: 800 13px ui-monospace, monospace; }
      .step h3 { margin: 0 0 9px; }
      .step p { margin: 0; color: var(--muted); line-height: 1.65; font-size: 14px; }
      .safety { display: grid; grid-template-columns: .85fr 1.15fr; gap: 52px; align-items: center; padding: 40px; border: 1px solid var(--line); border-radius: 26px; background: linear-gradient(135deg, rgba(38,216,255,.06), rgba(157,77,255,.075)); }
      .safety h2 { margin-bottom: 12px; }
      .safety > div > p { color: var(--muted); line-height: 1.7; }
      .checks { display: grid; gap: 12px; }
      .check { display: flex; gap: 12px; align-items: flex-start; padding: 14px; border-radius: 14px; background: rgba(8,9,24,.55); color: #dfe2f5; }
      .check b { color: #7deaff; }
      footer { display: flex; justify-content: space-between; gap: 24px; padding: 34px 0 48px; border-top: 1px solid var(--line); color: #747b9b; font-size: 13px; }
      footer div { display: flex; gap: 20px; }
      footer a:hover { color: var(--text); }
      @media (max-width: 820px) {
        .hero { grid-template-columns: 1fr; gap: 45px; padding-top: 65px; }
        .features, .steps { grid-template-columns: 1fr; }
        .safety { grid-template-columns: 1fr; padding: 27px; }
      }
      @media (max-width: 560px) {
        .wrap { width: min(100% - 28px, 1120px); }
        .nav-links > a:first-child { display: none; }
        .hero { padding: 45px 0 78px; }
        h1 { font-size: 43px; }
        section { padding: 62px 0; }
        .button { width: 100%; }
        footer { flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <nav aria-label="主导航">
        <a class="brand" href="/" aria-label="XLeave 首页">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M6.4 7.2h19.2a3.2 3.2 0 0 1 3.2 3.2v9.2a3.2 3.2 0 0 1-3.2 3.2H15l-6.7 4.3 1.2-4.3H6.4a3.2 3.2 0 0 1-3.2-3.2v-9.2a3.2 3.2 0 0 1 3.2-3.2Z" fill="url(#bubble)"/>
              <path d="m19.8 10.2 1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1 1.1-2.9Z" fill="#fff"/>
              <defs><linearGradient id="bubble" x1="3" y1="7" x2="28" y2="25" gradientUnits="userSpaceOnUse"><stop stop-color="#26D8FF"/><stop offset=".55" stop-color="#5267FF"/><stop offset="1" stop-color="#9D4DFF"/></linearGradient></defs>
            </svg>
          </span>
          XLeave
        </a>
        <div class="nav-links">
          <a href="#features">功能</a>
          <a href="#install">安装</a>
        </div>
      </nav>

      <main>
        <div class="hero">
          <div>
          <span class="eyebrow">Chrome AI 发帖与回复助手</span>
            <h1>让每一次回复，<span class="gradient-text">更自然一点。</span></h1>
            <p class="lead">发帖时自动检索近期 AI 热点，回复时识别当前帖子和对话上下文。你来选择、修改并发送，AI 只负责提供灵感。</p>
            <div class="cta">
              <a class="button primary" href="${GITHUB_URL}" rel="noreferrer">获取插件</a>
              <a class="button secondary" href="#install">查看安装方式</a>
            </div>
            <p class="micro">区分发帖与回复 · 不会自动发送 · 不读取图片或视频</p>
          </div>
          <div class="demo" aria-label="插件回复候选示意">
            <div class="post">
              <div class="person">
                <span class="avatar">L</span>
                <div><strong>Leo</strong><span>@leo · 刚刚</span></div>
              </div>
              <p>AI 产品变化这么快，长期来看真正的壁垒会是什么？</p>
            </div>
            <div class="reply-box">
              <div class="reply-label"><span>选择一条回复</span><span class="ai-pill">✦ AI 已生成</span></div>
              <div class="candidate">可能不是单个模型，而是产品迭代速度、用户习惯和数据反馈形成的组合。</div>
              <div class="candidate">同感。模型会追平，但真正懂用户场景的团队没那么容易被复制。</div>
              <div class="candidate">最后拼的也许不是谁最聪明，而是谁最懂怎么把 AI 变成日常工具。</div>
            </div>
          </div>
        </div>

        <section id="features">
          <div class="section-head">
            <h2>少一点 AI 味，多一点你的表达</h2>
            <p>XLeave 把生成、筛选和发送拆开，让回复既高效，也保留真实交流的分寸感。</p>
          </div>
          <div class="features">
            <article class="card">
              <span class="card-icon">◎</span>
              <h3>理解当前对话</h3>
              <p>提取原帖作者、正文和可见上下文，减少回复对象混淆和答非所问。</p>
            </article>
            <article class="card">
              <span class="card-icon">✦</span>
              <h3>五种自然候选</h3>
              <p>一次生成友好、简短、思考、好奇和幽默等不同语气，方便快速挑选。</p>
            </article>
            <article class="card">
              <span class="card-icon">✓</span>
              <h3>发送权始终在你</h3>
              <p>候选只会填入回复框。你可以继续修改，最终仍需亲自点击 Reply。</p>
            </article>
          </div>
        </section>

        <section id="install">
          <div class="section-head">
            <h2>三步开始使用</h2>
            <p>插件没有复杂的构建流程，安装后配置管理员分配的访问 Token 即可。</p>
          </div>
          <div class="steps">
            <article class="step"><h3>安装扩展</h3><p>下载并解压插件，在 Chrome 扩展程序页面开启开发者模式，选择“加载已解压的扩展程序”。</p></article>
            <article class="step"><h3>填写 Token</h3><p>点击插件图标进入设置，将管理员分配的访问 Token 保存到浏览器本地。</p></article>
            <article class="step"><h3>生成回复</h3><p>打开任意帖子的回复框，点击“AI 生成回复”，选择喜欢的候选并按需修改。</p></article>
          </div>
        </section>

        <section>
          <div class="safety">
            <div>
              <h2>克制，也是一种产品能力</h2>
              <p>我们只处理完成文字回复所必需的内容，不让插件替你做最终决定。</p>
            </div>
            <div class="checks">
              <div class="check"><b>01</b><span>不会自动点击发送，避免误发和机械化互动。</span></div>
              <div class="check"><b>02</b><span>不处理图片、视频任务，只提取可见文字上下文。</span></div>
              <div class="check"><b>03</b><span>后端使用用户 Token 和公网 IP 白名单双重保护接口。</span></div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <span>© 2026 XLeave · AI 回复灵感助手</span>
        <div><a href="/support">帮助与支持</a><a href="/privacy">隐私政策</a><a href="${GITHUB_URL}" rel="noreferrer">GitHub</a><a href="/health">服务状态</a></div>
      </footer>
    </div>
  </body>
</html>`;
}

export function renderSupportPage() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="XLeave Chrome 插件安装、配置与故障排查帮助。">
    <meta name="theme-color" content="#11132d">
    <title>帮助与支持 · XLeave</title>
    <style>
      :root {
        color-scheme: dark;
        --bg:#080918; --panel:#141632; --line:rgba(255,255,255,.11);
        --text:#f7f8ff; --muted:#a7accb; --cyan:#26d8ff; --violet:#9d4dff;
        font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }
      *{box-sizing:border-box} body{margin:0;color:var(--text);background:radial-gradient(circle at 15% 0,rgba(38,216,255,.13),transparent 30rem),radial-gradient(circle at 90% 30%,rgba(157,77,255,.12),transparent 28rem),var(--bg)}
      a{color:inherit;text-decoration:none}.wrap{width:min(900px,calc(100% - 36px));margin:auto}
      nav{display:flex;justify-content:space-between;align-items:center;padding:24px 0}.brand{font-size:19px;font-weight:800}.back{padding:9px 14px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:14px}
      header{padding:70px 0 45px;text-align:center}.eyebrow{color:#9cecff;font-size:13px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}
      h1{margin:15px 0;font-size:clamp(40px,7vw,64px);letter-spacing:-.05em}.lead{max-width:650px;margin:auto;color:var(--muted);font-size:18px;line-height:1.7}
      .quick{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:18px 0 54px}.quick a{padding:20px;border:1px solid var(--line);border-radius:17px;background:rgba(20,22,50,.72)}.quick strong,.quick span{display:block}.quick span{margin-top:7px;color:var(--muted);font-size:13px;line-height:1.5}.quick a:hover{border-color:rgba(38,216,255,.35)}
      section{margin:24px 0 60px}h2{margin:0 0 20px;font-size:28px;letter-spacing:-.03em}.faq{display:grid;gap:12px}
      details{border:1px solid var(--line);border-radius:16px;background:rgba(20,22,50,.72);overflow:hidden}summary{padding:19px 21px;cursor:pointer;font-weight:700;list-style:none}summary::-webkit-details-marker{display:none}summary::after{content:"＋";float:right;color:#7deaff}details[open] summary::after{content:"－"}details p,details ol{margin:0;padding:0 21px 21px;color:var(--muted);line-height:1.75}details ol{padding-left:42px}code{padding:2px 6px;border-radius:6px;background:rgba(255,255,255,.08);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
      .contact{padding:30px;border:1px solid rgba(38,216,255,.2);border-radius:22px;background:linear-gradient(135deg,rgba(38,216,255,.07),rgba(157,77,255,.08));text-align:center}.contact h2{margin-bottom:10px}.contact p{margin:0 auto 22px;max-width:590px;color:var(--muted);line-height:1.7}.button{display:inline-flex;padding:13px 20px;border-radius:12px;background:linear-gradient(100deg,var(--cyan),#6871ff 65%,var(--violet));color:#080918;font-weight:800}
      footer{display:flex;justify-content:space-between;gap:20px;padding:30px 0 44px;border-top:1px solid var(--line);color:#747b9b;font-size:13px}footer div{display:flex;gap:18px}
      @media(max-width:650px){.quick{grid-template-columns:1fr}header{padding-top:45px}.contact{padding:24px 18px}footer{flex-direction:column}}
    </style>
  </head>
  <body>
    <div class="wrap">
      <nav><a class="brand" href="/">✦ XLeave</a><a class="back" href="/">返回首页</a></nav>
      <main>
        <header>
          <span class="eyebrow">Support Center</span>
          <h1>帮助与支持</h1>
          <p class="lead">安装、配置或生成回复遇到问题？先从下面的常见解决方案开始。</p>
        </header>

        <div class="quick">
          <a href="#install"><strong>安装插件</strong><span>Chrome 开发者模式安装与更新</span></a>
          <a href="#account"><strong>Token 与 IP</strong><span>访问令牌、IP 白名单和配额</span></a>
          <a href="#troubleshooting"><strong>故障排查</strong><span>生成失败、按钮异常与页面识别</span></a>
        </div>

        <section id="install">
          <h2>安装与更新</h2>
          <div class="faq">
            <details open>
              <summary>如何安装 XLeave？</summary>
              <ol>
                <li>下载插件 ZIP 并解压到一个固定目录。</li>
                <li>在 Chrome 打开 <code>chrome://extensions</code>。</li>
                <li>开启右上角“开发者模式”。</li>
                <li>点击“加载已解压的扩展程序”，选择解压后的插件目录。</li>
                <li>打开或刷新 X 页面，然后点击任意帖子的回复按钮。</li>
              </ol>
            </details>
            <details>
              <summary>更新插件后为什么没有生效？</summary>
              <p>进入 <code>chrome://extensions</code>，找到 XLeave 后点击刷新按钮，再重新加载 X 页面。如果更新包放在新目录，请先移除旧版本再重新加载。</p>
            </details>
          </div>
        </section>

        <section id="account">
          <h2>Token、IP 与使用额度</h2>
          <div class="faq">
            <details>
              <summary>Token 在哪里填写？</summary>
              <p>点击浏览器工具栏中的 XLeave 图标，进入设置页面，粘贴管理员分配的 Token 并保存。插件不需要填写用户 ID。</p>
            </details>
            <details>
              <summary>提示“访问令牌无效”怎么办？</summary>
              <p>检查 Token 前后是否带有空格，并确认管理员没有停用用户或轮换 Token。Token 轮换后，旧 Token 会立即失效。</p>
            </details>
            <details>
              <summary>提示 IP 不在白名单怎么办？</summary>
              <p>你的公网 IP 可能发生了变化。访问本站 <a href="/ip"><code>/ip</code></a> 查看后端识别到的公网 IP，并请管理员更新该用户的 IP 白名单。</p>
            </details>
            <details>
              <summary>每天可以使用多少次？</summary>
              <p>当前后台会统计每位用户的累计 AI 使用次数。具体使用额度请联系管理员确认。</p>
            </details>
          </div>
        </section>

        <section id="troubleshooting">
          <h2>故障排查</h2>
          <div class="faq">
            <details>
              <summary>页面没有出现“AI 生成回复”按钮</summary>
              <p>先刷新 X 页面，并确认插件已启用。仍未出现时，在 <code>chrome://extensions</code> 中刷新 XLeave，再重新打开回复框。X 页面结构更新后也可能需要升级插件。</p>
            </details>
            <details>
              <summary>生成失败或显示 Extension context invalidated</summary>
              <p>这通常发生在插件刚更新、但旧页面仍在运行时。直接刷新当前 X 页面即可重新建立插件上下文。</p>
            </details>
            <details>
              <summary>自动填入后 Reply 按钮仍是灰色</summary>
              <p>请先更新到最新版插件并刷新页面。临时解决方式是在回复框末尾手动输入一个字符再删除，触发 X 编辑器状态更新。</p>
            </details>
            <details>
              <summary>识别到了错误的原帖</summary>
              <p>关闭当前回复框并重新打开，避免页面上同时保留多个回复弹窗。若问题持续，请在反馈中附上复现步骤和页面截图，但不要提交 Token。</p>
            </details>
          </div>
        </section>

        <section class="contact">
          <h2>仍然没有解决？</h2>
          <p>请在 GitHub 提交问题，说明 Chrome 版本、插件版本、操作步骤和错误提示。请勿公开 Token、OpenAI API Key 或管理员密钥。</p>
          <a class="button" href="${GITHUB_URL}/issues/new" rel="noreferrer">提交问题</a>
        </section>
      </main>
      <footer><span>© 2026 XLeave</span><div><a href="/privacy">隐私政策</a><a href="/health">服务状态</a><a href="${GITHUB_URL}" rel="noreferrer">GitHub</a><a href="/admin">管理后台</a></div></footer>
    </div>
  </body>
</html>`;
}

export function renderPrivacyPage() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="XLeave Chrome 插件隐私政策。">
    <meta name="theme-color" content="#11132d">
    <title>隐私政策 · XLeave</title>
    <style>
      :root {
        color-scheme: dark;
        --bg:#080918;--panel:rgba(20,22,50,.74);--line:rgba(255,255,255,.11);
        --text:#f7f8ff;--muted:#a7accb;--cyan:#26d8ff;--violet:#9d4dff;
        font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }
      *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:var(--text);background:radial-gradient(circle at 12% 0,rgba(38,216,255,.13),transparent 30rem),radial-gradient(circle at 92% 28%,rgba(157,77,255,.12),transparent 28rem),var(--bg)}
      a{color:inherit;text-decoration:none}.wrap{width:min(880px,calc(100% - 36px));margin:auto}
      nav{display:flex;justify-content:space-between;align-items:center;padding:24px 0}.brand{font-size:19px;font-weight:800}.nav-actions{display:flex;gap:10px}.pill{padding:9px 14px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:14px}
      header{padding:68px 0 42px;text-align:center}.eyebrow{color:#9cecff;font-size:13px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}h1{margin:15px 0;font-size:clamp(40px,7vw,62px);letter-spacing:-.05em}.lead{max-width:650px;margin:auto;color:var(--muted);font-size:18px;line-height:1.72}.updated{margin-top:18px;color:#737a9b;font-size:13px}
      .notice{margin:10px 0 28px;padding:21px 23px;border:1px solid rgba(38,216,255,.22);border-radius:17px;background:linear-gradient(135deg,rgba(38,216,255,.07),rgba(157,77,255,.07));line-height:1.75}
      .toc{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:38px}.toc a{padding:13px 15px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.025);color:var(--muted);font-size:13px}.toc a:hover{color:var(--text);border-color:rgba(38,216,255,.3)}
      article{display:grid;gap:14px}.section{padding:25px;border:1px solid var(--line);border-radius:19px;background:var(--panel)}h2{margin:0 0 13px;font-size:22px;letter-spacing:-.025em}.section p,.section li{color:var(--muted);line-height:1.78}.section p{margin:10px 0}.section ul{margin:9px 0;padding-left:22px}.section strong{color:#e8eaff}.section a{color:#8beaff;text-decoration:underline;text-underline-offset:3px}code{padding:2px 6px;border-radius:6px;background:rgba(255,255,255,.08);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
      .data-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:15px}.data-card{padding:16px;border-radius:14px;background:rgba(8,9,24,.52)}.data-card b{display:block;margin-bottom:7px;color:#b7f2ff}.data-card span{color:var(--muted);font-size:14px;line-height:1.65}
      footer{display:flex;justify-content:space-between;gap:20px;margin-top:42px;padding:30px 0 44px;border-top:1px solid var(--line);color:#747b9b;font-size:13px}footer div{display:flex;gap:18px}
      @media(max-width:650px){header{padding-top:45px}.toc{grid-template-columns:1fr 1fr}.data-grid{grid-template-columns:1fr}.section{padding:21px}.nav-actions .support{display:none}footer{flex-direction:column}}
    </style>
  </head>
  <body>
    <div class="wrap">
      <nav>
        <a class="brand" href="/">✦ XLeave</a>
        <div class="nav-actions"><a class="pill support" href="/support">帮助与支持</a><a class="pill" href="/">返回首页</a></div>
      </nav>
      <main>
        <header>
          <span class="eyebrow">Privacy Policy</span>
          <h1>隐私政策</h1>
          <p class="lead">我们只处理生成文字回复所必需的信息，并尽量减少保存的数据。</p>
          <p class="updated">生效日期：2026 年 6 月 22 日</p>
        </header>

        <div class="notice"><strong>简要说明：</strong>XLeave 不会自动发送内容，不读取图片或视频，也不会在数据库中保存你的帖子正文、草稿或 AI 文案候选。生成新帖子时会联网检索近期 AI 热点。</div>

        <nav class="toc" aria-label="隐私政策目录">
          <a href="#collect">处理的信息</a><a href="#purpose">使用目的</a><a href="#storage">存储方式</a>
          <a href="#sharing">第三方处理</a><a href="#security">安全措施</a><a href="#rights">你的选择</a>
        </nav>

        <article>
          <section class="section" id="collect">
            <h2>1. 我们处理哪些信息</h2>
            <p>当你主动点击“AI 生成回复”时，插件会从当前 X 页面提取并提交以下信息：</p>
            <ul>
              <li>当前回复目标的作者名称、账号、帖子文字和帖子链接；</li>
              <li>可选的可见对话上下文，最多三条；</li>
              <li>回复框中已有的文字草稿及当前页面地址；</li>
              <li>你配置的语言、最大字数、是否包含上下文和个人表达偏好。</li>
            </ul>
            <p>在独立发帖输入框点击“AI 生成帖子”时，后端会通过 OpenAI Web Search 检索近期公开 AI 新闻与信息，并将来源链接返回插件展示。</p>
            <p>为验证访问权限，后端还会处理你的访问 Token 和公网 IP 地址。</p>
          </section>

          <section class="section" id="purpose">
            <h2>2. 信息的使用目的</h2>
            <p>这些信息仅用于识别回复对象、验证用户权限、生成回复候选、保障接口安全、排查服务故障以及统计用户的 AI 使用次数。</p>
            <p>XLeave 不会出售个人信息，不会使用上述内容投放广告，也不会替你自动发布或发送回复。</p>
          </section>

          <section class="section" id="storage">
            <h2>3. 信息如何存储</h2>
            <div class="data-grid">
              <div class="data-card"><b>浏览器本地</b><span>访问 Token 保存在 Chrome 本地存储中；后端地址、语言、字数和表达偏好保存在 Chrome 同步存储中，并可能随你的 Chrome 账号同步。</span></div>
              <div class="data-card"><b>Neon 数据库</b><span>保存用户 ID、Token 哈希和尾号提示、IP 白名单、启用状态、累计使用次数、最后使用时间及管理时间戳。</span></div>
              <div class="data-card"><b>回复内容</b><span>帖子正文、文字草稿和生成的回复候选不会写入 XLeave 的 Neon 用户数据库。</span></div>
              <div class="data-card"><b>运行日志</b><span>服务日志可能包含公网 IP、用户 ID、请求错误和安全拦截信息。Vercel 等托管服务可能按其政策保存运行日志。</span></div>
            </div>
          </section>

          <section class="section" id="sharing">
            <h2>4. 第三方服务处理</h2>
            <p>为了提供服务，XLeave 会使用以下第三方基础设施：</p>
            <ul>
              <li><strong>OpenAI：</strong>接收生成回复所需的文字和偏好。请求设置为 <code>store: false</code>，具体处理仍受 OpenAI API 数据政策约束。</li>
              <li><strong>Vercel：</strong>托管后端服务，并可能处理请求 IP、网络元数据和运行日志。</li>
              <li><strong>Neon：</strong>托管用户鉴权和使用统计数据库。</li>
              <li><strong>Google Chrome：</strong>通过扩展存储机制保存插件设置；同步设置受 Chrome 同步服务控制。</li>
            </ul>
            <p>你在 X 网站上的浏览和发送行为还受 X 自身的隐私政策约束。</p>
          </section>

          <section class="section" id="security">
            <h2>5. 安全措施</h2>
            <ul>
              <li>接口使用用户 Token 和公网 IP 白名单双重验证；</li>
              <li>Token 在 Neon 中仅保存 SHA-256 哈希，明文只在创建或轮换时显示；</li>
              <li>OpenAI 请求明确关闭模型响应存储；</li>
              <li>插件不会把 OpenAI API Key 或管理员密钥放入前端代码。</li>
            </ul>
            <p>任何互联网服务都无法保证绝对安全。请勿在公开截图或问题反馈中粘贴 Token、API Key 或管理员密钥。</p>
          </section>

          <section class="section" id="rights">
            <h2>6. 你的选择与数据管理</h2>
            <ul>
              <li>你可以关闭“包含上下文”，减少发送给后端的对话内容；</li>
              <li>你可以清空个人表达偏好和 Token，或直接卸载插件；</li>
              <li>如需停用账号、轮换 Token、修改 IP 或删除 Neon 用户记录，请联系管理员；</li>
              <li>如需报告隐私或安全问题，请通过 <a href="${GITHUB_URL}/issues/new" rel="noreferrer">GitHub Issues</a> 联系我们，并避免提交任何密钥。</li>
            </ul>
          </section>

          <section class="section">
            <h2>7. 政策更新</h2>
            <p>功能、数据处理方式或第三方服务发生变化时，我们可能更新本政策。更新后的版本会发布在本页面，并修改生效日期。</p>
          </section>
        </article>
      </main>
      <footer><span>© 2026 XLeave</span><div><a href="/support">帮助与支持</a><a href="/health">服务状态</a><a href="${GITHUB_URL}" rel="noreferrer">GitHub</a></div></footer>
    </div>
  </body>
</html>`;
}

function setPublicPageHeaders(response) {
  response.set({
    "Cache-Control": "public, max-age=300, s-maxage=3600",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  });
}
