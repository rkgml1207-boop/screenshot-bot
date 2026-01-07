const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const MAX_TOTAL_TIME = 90_000;   // ⏱️ 전체 1.5분
const MAX_LOADING_TIME = 40_000; // ⏳ 로딩 최대 40초

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
  await page.setViewport({ width: 400, height: 800, deviceScaleFactor: 3 });

  // 페이지 진입 (최대 30초)
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 });

  // 폰트 (최대 2초)
  await Promise.race([
    page.evaluateHandle('document.fonts.ready'),
    sleep(2000),
  ]);

  // 🔥 로딩 전체를 40초로 제한
  await Promise.race([
    (async () => {
      /* 1️⃣ 스크롤 (lazy-load 트리거) */
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

      /* 2️⃣ 고해상도 이미지 대기 (src 교체 감지) */
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
                  !cur.includes('blur') &&
                  !cur.includes('thumb')
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

  // ⏱️ 전체 1.5분 초과 방지
  const elapsed = Date.now() - startTime;
  if (elapsed > MAX_TOTAL_TIME) {
    console.warn('⏱️ total timeout reached, capture anyway');
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
    ].forEach(s => {
      document.querySelectorAll(s).forEach(e => e.remove());
    });
  });

  const content = await page.$('.se-main-container');
  if (!content) throw new Error('container not found');

  await content.screenshot({
    path: `screenshot_${requestId}.png`,
  });

  await browser.close();
})();
