---
title: "用 GitHub Actions 打造全自動 YouTube 頻道（免費、免伺服器）2026"
description: "如何用免費 API + GitHub Actions 打造一個每天自動產片、自動上傳的 faceless YouTube 頻道：爬新聞 → AI 寫腳本 → TTS 配音 → FFmpeg 合成 → 自動發布。完整架構與免費工具，附一鍵套用的現成系統。"
date: 2026-07-08
lastmod: 2026-07-20
slug: "automated-youtube-github-actions"
---
<p>「faceless（無人露臉）頻道」聽起來很夢幻，但多數教學不是要你買貴桑桑的工具，就是還要租一台雲端主機每個月燒錢。我自己實際跑了半年後發現：整條產線其實可以<strong>完全免費</strong>、<strong>不用自己的機器</strong>——全部跑在 GitHub Actions 的免費額度上，每天固定時間自動抓題材、寫稿、配音、合成、上傳一支影片，然後你去睡覺。這篇把我踩過的坑和完整架構一次攤開給你看，讓你少走幾個週末的冤枉路。</p>

  <h2>整條產線長這樣</h2>
  <p>先看全貌。這是一條線性的資料管線：每個步驟吃上一步的輸出、吐出下一步要用的檔案，最後把成品推上 YouTube。中間沒有任何一步需要真人介入。</p>
  <div class="flow">
    <b>1. 找題材</b>　爬 iThome / TechOrange / Inside 等 RSS 或網頁<br>
    <b>2. 寫腳本</b>　用 LLM（如 DeepSeek 免費額度）產出「主持＋專家」雙人對話<br>
    <b>3. 配音</b>　Edge TTS（微軟免費語音）分別合成兩個角色再合併<br>
    <b>4. 做畫面</b>　Pillow 產投影片 + FFmpeg 加 Ken Burns 慢速縮放<br>
    <b>5. 合成</b>　FFmpeg 把音軌＋畫面＋背景音樂合成 720p 影片<br>
    <b>6. 上傳</b>　YouTube Data API v3 自動發布<br>
    <b>7. 排程</b>　GitHub Actions <a href="https://slashmantools.us/cron-expression-generator/">cron</a> 每天自動跑，零維運
  </div>
  <p style="font-size:14px;color:#8888c0">🔧 順手的免費工具：<a href="https://slashmantools.us/cron-expression-generator/">Cron 排程產生器</a>（產生／解讀 GitHub Actions 的排程字串）、<a href="https://slashmantools.us/youtube-thumbnail-downloader/">YouTube 縮圖下載器</a>（抓任何影片的縮圖來做參考）。</p>

  <h2>各階段用什麼、免費額度、產出什麼</h2>
  <p>下面這張表是整條產線的骨架。每一列都對應一個獨立的 Python 腳本或 shell 步驟，彼此只靠檔案溝通，所以任何一步壞了都能單獨重跑而不影響其他步驟。</p>
  <table>
    <tr><th>階段</th><th>用的工具 / API</th><th>免費額度</th><th>產出</th></tr>
    <tr><td>爬新聞</td><td>feedparser / requests + BeautifulSoup</td><td>完全免費（讀公開 RSS）</td><td>今日候選標題＋摘要（JSON）</td></tr>
    <tr><td>AI 腳本</td><td>DeepSeek / 其他有免費額度的 LLM API</td><td>每日免費 token 足夠一支稿</td><td>雙人對話逐句稿（JSON）</td></tr>
    <tr><td>TTS 配音</td><td>Edge TTS（微軟 edge-tts 套件）</td><td>免費、不需金鑰</td><td>每句一段 .mp3，含台灣腔</td></tr>
    <tr><td>畫面素材</td><td>Pillow 產字卡 + 免費圖庫（CC0）</td><td>開源，零成本</td><td>投影片 .png 序列</td></tr>
    <tr><td>影片合成</td><td>FFmpeg（filter_complex + concat）</td><td>開源，零成本</td><td>720p .mp4 成品</td></tr>
    <tr><td>上傳發布</td><td>YouTube Data API v3</td><td>每日 10,000 配額點數</td><td>已公開／排程的 YouTube 影片</td></tr>
    <tr><td>運算 / 排程</td><td>GitHub Actions（Ubuntu runner）</td><td>公開 repo 幾乎無上限</td><td>每天自動觸發整條產線</td></tr>
  </table>

  <h2>GitHub Actions 工作流程長什麼樣</h2>
  <p>核心就是一支 <code>.github/workflows/daily.yml</code>。它做三件事：定時觸發、裝好環境、跑主程式。概念上像這樣：</p>
  <div class="flow">
    <b>on.schedule</b>　用 cron 設定觸發時間（記得 GitHub 的 cron 是 <b>UTC</b>）<br>
    <b>on.workflow_dispatch</b>　留一個手動按鈕，方便你隨時測試整條線<br>
    <b>steps</b>　① checkout 程式碼 → ② setup-python → ③ <code>apt-get install ffmpeg</code> → ④ <code>pip install</code> 依賴 → ⑤ 跑 <code>python make_video.py</code> → ⑥ 跑 <code>python upload.py</code>
  </div>
  <p>金鑰的部分是關鍵：LLM 的 API key、YouTube 的 <code>client_secret</code> 與 <code>refresh_token</code>，全部丟進 repo 的 <strong>Settings → Secrets and variables → Actions</strong>，在 workflow 裡用 <code>${{ secrets.XXX }}</code> 帶進環境變數。這樣程式碼可以公開，機密卻不會外洩，也才能吃到公開 repo 的免費額度。</p>
  <h3>為什麼用 workflow_dispatch 也很重要</h3>
  <p>剛開始除錯時，你不會想等到明天早上 cron 才知道昨晚的改動有沒有效。保留 <code>workflow_dispatch</code> 讓你在 Actions 頁面隨手按一下就整條重跑，是把「一個週末」壓縮成「一個下午」的關鍵。</p>

  <h2>幾個實作眉角</h2>
  <ul>
    <li><strong>YouTube OAuth</strong>：在本機用瀏覽器授權一次，拿到 refresh token 存進 GitHub Secrets，之後 runner 就能無人換取 access token 上傳，不用再開瀏覽器。</li>
    <li><strong>雙人語音</strong>：兩個不同的 Edge TTS 聲線分開生成、再用 FFmpeg 依對話順序串接，中間補 0.3 秒左右的靜音，聽起來才像真的在對談而不是機器人念稿。</li>
    <li><strong>字幕去標點</strong>：自動上字幕時把逗號句號拿掉，畫面更乾淨；同時把中文數字口語化（例如把「2026」念成「二〇二六」），配音才自然。</li>
    <li><strong>Ken Burns 效果</strong>：靜態圖太死板，用 FFmpeg 的 <code>zoompan</code> 加上慢速縮放平移，一張圖也能有動態感。</li>
    <li><strong>版權</strong>：新聞「事實」可以引用，但千萬別照抄原文；用 AI 改寫成自己的口語敘述，音樂與圖片一律用可商用 / CC0 來源，並在資訊欄註明。</li>
  </ul>

  <h2>常見坑（我踩過的）</h2>
  <h3>API 配額</h3>
  <p>LLM 免費額度通常以「每分鐘 token」或「每日請求數」計。一天只產一支稿其實用不了多少，但如果你在除錯時反覆重跑，很容易在幾分鐘內把當日額度打爆。解法：把 LLM 的回應<strong>快取成本地 JSON</strong>，除錯畫面或配音時就重用同一份稿，不要每次都重新呼叫 API。</p>
  <h3>YouTube 上傳限制</h3>
  <p>YouTube Data API v3 每天給 10,000 點配額，而一次影片上傳就吃掉約 <strong>1,600 點</strong>，所以一天大概只能自動上傳 6 支左右。每天 1 支綽綽有餘，但別把它拿來一次補上一整週的存貨。另外，用 API 上傳的新頻道預設會被鎖成「私人」，需要先在 YouTube 後台完成帳號驗證，才能自動設為「公開」。</p>
  <h3>排程時區與失敗重試</h3>
  <p>GitHub cron 跑的是 UTC，想在台灣早上 8 點發片就得設成 <code>0 0 * * *</code>（UTC 0 點）。還有一點：GitHub 對排程觸發<strong>不保證準時</strong>，尖峰時可能延遲幾分鐘甚至偶爾跳過，所以別把邏輯寫死成「一定會在某分鐘執行」。建議把每步的產出檔上傳成 artifact，失敗時才好回頭查是哪一段爆掉。</p>

  <h2>自己接，還是用現成的？</h2>
  <p>上面每一環都能自己接——這也是很好的練習，你會對 FFmpeg 濾鏡和 OAuth 流程熟很多。但把「爬蟲 → LLM 腳本 → 雙人 TTS → FFmpeg 合成 → YouTube 上傳 → GitHub Actions 排程」全部串成<strong>穩定天天跑</strong>的產線，光是處理各種邊界狀況（空新聞、API 逾時、配音檔長度對不上畫面）通常就要耗掉不少週末。如果想跳過除錯直接開跑：</p>

  

  <h2>常見問題（FAQ）</h2>
  <p><strong>Q：真的完全不用錢嗎？</strong><br>只要 repo 是公開的、每天產 1 支影片，運算（GitHub Actions）、配音（Edge TTS）、合成（FFmpeg）都是零成本；LLM 用有免費額度的供應商也能撐住。唯一可能花錢的是你想換更高品質的付費 LLM 或付費語音，但那是選配。</p>
  <p><strong>Q：沒有伺服器，影片檔存哪？</strong><br>影片是在 GitHub runner 的暫存空間裡即時合成、上傳完就隨 runner 一起消失，不需要你長期保存。真正的「儲存」是 YouTube 本身。想留備份的話，把成品上傳成 workflow artifact 即可。</p>
  <p><strong>Q：頻道會不會因為是 AI 生成而被 YouTube 處罰？</strong><br>關鍵在「有沒有加值」。純轉貼、機器念稿的內容確實容易被判定為重複性內容；但如果你的腳本是經過 AI 改寫、重新編排觀點、加上雙人對談的形式，屬於有轉化的再創作，一般沒問題。務必自己確認來源授權。</p>
  <p><strong>Q：一天可以產幾支？</strong><br>受限於 YouTube 每日 10,000 配額（每支上傳約 1,600 點），自動上傳上限約 6 支。實務上建議每天 1 支，維持穩定更新頻率比一次灌量重要。</p>
  <p><strong>Q：不會寫 Python 可以做嗎？</strong><br>可以照著現成專案的設定教學把金鑰填好、cron 設好就能跑；但如果哪天 API 改版或想客製，還是需要一點基本的 Python 與 YAML 讀寫能力來排錯。</p>

  <h2>重點整理</h2>
  <ol>
    <li>整條產線可用免費 API + GitHub Actions，不用租伺服器。</li>
    <li>金鑰全部存 GitHub Secrets，程式碼可公開又能吃免費額度。</li>
    <li>YouTube refresh token 存 Secrets，達成無人自動上傳。</li>
    <li>把頻率控制在每天 1 支，多半落在各家免費額度內。</li>
    <li>cron 用 UTC、除錯時快取 LLM 回應、新聞務必改寫，是三個最省心的習慣。</li>
  </ol>

  <div style="margin-top:32px;padding:16px 18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:13.5px;color:#9898b8;line-height:1.7"><strong style="color:#c7c7f0">關於作者</strong><br>由 <a href="https://slashmantools.us/about.html">slashman413</a> 撰寫 — <a href="https://slashmantools.us/">AI工具人 (slashmantools.us)</a> 免費工具站的作者，專注於 AI、開發工具與個人理財的實務教學。<a href="https://slashmantools.us/about.html">更多關於我們 →</a></div>
