const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const MAX_LOADING_TIME = 40_000; // 로딩 최대 40초
const MAX_TOTAL_TIME = 90_000;   // 전체 최대 1.5분

async function isFontBroken(page) {
  return await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    let checked = 0;
    while (walker.nextNode() && checked < 50) {
      const t = walker.currentNode.textContent;
      if (t && /[\u25A1\u25A0\uFFFD]/.test(t)) return true;
      checked++;
    }
    return false;
  });
}

async function injectNanumGothic(page) {
  // 나눔고딕 웹폰트 CSS 로드
  await page.addStyleTag({
    url: 'https://hangeul.pstatic.net/hangeul_static/css/nanum-gothic.css',
  });

  // font-face 실제 로딩 강제
  await page.evaluate(async () => {
    const fonts = [
      'NanumGothic',
      'NanumGothicBold',
      'NanumGothicExtraBold',
      'NanumGothicLight',
    ];

    await Promise.all(
      fonts.map(f =>
        document.fonts.load(`16px "${f}"`).catch(() => {})
      )
    );

    await document.fonts.ready;
  });

  // 전체 강제 적용
  await page.addStyleTag({
    content: `
      * {
        font-family:
          "NanumGothic",
          "NanumGothicBold",
          -apple-system,
          BlinkMacSystemFont,
          "Apple SD Gothic Neo",
          "Malgun Gothic",
          "Noto Sans KR",
          Arial,
          sans-serif !important;
      }
    `,
  });
}

(async () => {
  const startTime = Date.now();

  const rawUrl = process.env.TARGET_URL;
  const requestId = process.env.REQUEST_ID;
  if (!rawUrl || !requestId) throw new Error('env missing');

  const url = rawUrl.replace(/^=/, '');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: 400,
    height: 800,
    deviceScaleFactor: 3,
  });

  // 페이지 진입
  await page.goto(url, {
    waitUntil: 'networkidle0',
    timeout: 30_000,
  });

  // ✅ 나눔고딕 웹폰트 강제 주입 (핵심)
  await injectNanumGothic(page);
  await sleep(500);

  // 폰트 기본 대기 (기존 로직 유지)
  await Promise.race([
    page.evaluateHandle('document.fonts.ready'),
    sleep(2000),
  ]);

  // 🔥 로딩 전체를 40초로 제한
  await Promise.race([
    (async () => {
      // lazy-load 스크롤
      await page.evaluate(async () => {
        const start = Date.now();
        const MAX_SCROLL = 15_000;
        await new Promise(resolve => {
          let y = 0;
          const timer = setInterval(() => {
            window.scrollBy(0, 300);
            y += 300;
            if (
              y >= document.body.scrollHeight ||
              Date.now() - start > MAX_SCROLL
            ) {
              clearInterval(timer);
              resolve();
            }
          }, 300);
        });
      });

      // 이미지 src 교체 대기 (저해상도 회피)
      await page.evaluate(async () => {
        const start = Date.now();
        const MAX_WAIT = 25_000;
        const imgs = Array.from(
          document.querySelectorAll('.se-main-container img')
        );

        await Promise.all(
          imgs.map(img => {
            const initial = img.currentSrc || img.src;
            return new Promise(resolve => {
              const check = () => {
                const cur = img.currentSrc || img.src;
                if (
                  cur &&
                  cur !== initial &&
                  !/blur|thumb|placeholder|low/i.test(cur)
                ) {
                  resolve();
                }
                if (Date.now() - start > MAX_WAIT) resolve();
              };

              const obs = new MutationObserver(check);
              obs.observe(img, {
                attributes: true,
                attributeFilter: ['src', 'srcset'],
              });

              const timer = setInterval(check, 300);
              setTimeout(() => {
                clearInterval(timer);
                obs.disconnect();
                resolve();
              }, MAX_WAIT);
            });
          })
        );
      });
    })(),
    sleep(MAX_LOADING_TIME),
  ]);

  // 본문 selector 확보 (fallback 포함)
  let content;
  try {
    await page.waitForSelector('.se-main-container', { timeout: 10_000 });
    content = await page.$('.se-main-container');
  } catch {
    console.warn('⚠️ se-main-container not found, fallback to body');
    content = await page.$('body');
  }

  // UI 제거
  await page.evaluate(() => {
    [
      '.interact_section__y00DX',
      '.comment_area__nxrQe',
      '.splugin_area__Ajs0X',
      '.Ngnb',
      '#ad-bottom-portal',
      '[id^="ad-content"]',
    ].forEach(s =>
      document.querySelectorAll(s).forEach(e => e.remove())
    );
  });

  const filePath = `screenshot_${requestId}.png`;

  // 1차 캡처
  await content.screenshot({ path: filePath });

  // 🔁 폰트 깨짐 시 1회 재시도 (기존 로직 유지)
  if (await isFontBroken(page)) {
    console.warn('⚠️ Font broken detected → retrying once');
    await injectNanumGothic(page);
    await sleep(1500);
    await content.screenshot({ path: filePath });
  }

  // 전체 시간 초과 방지
  if (Date.now() - startTime > MAX_TOTAL_TIME) {
    console.warn('⏱️ Total time exceeded, forced finish');
  }

  await browser.close();
})();
