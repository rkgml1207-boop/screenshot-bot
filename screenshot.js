const puppeteer = require('puppeteer');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const MAX_LOADING_TIME = 40_000;

(async () => {
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

  // lazy-load 스크롤
  await Promise.race([
    (async () => {
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

      // 이미지 고해상도 대기
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

  // 본문 selector
  let content;
  try {
    await page.waitForSelector('.se-main-container', { timeout: 10_000 });
    content = await page.$('.se-main-container');
  } catch {
    content = await page.$('body');
  }

  // UI 제거
  // 클래스 뒤 해시(예: __y00DX, --vWRCb)는 네이버 배포 때마다 바뀌므로 일부만 맞춘다
  await page.evaluate(() => {
    [
      '[class*="interact_section"]', // 하트·댓글·공유 바 (하단 고정 포함)
      '[class*="comment_area"]',
      '[class*="splugin_area"]',
      '.naver-splugin-dimmed',
      '.Ngnb',
      '#ad-bottom-portal',
      '[id^="ad-content"]',
    ].forEach(s =>
      document.querySelectorAll(s).forEach(e => e.remove())
    );

    // 화면에 떠 있는 고정 요소는 본문 캡처 위에 겹쳐 찍히므로 숨긴다
    document.querySelectorAll('body *').forEach(e => {
      const pos = getComputedStyle(e).position;
      if (pos === 'fixed' || pos === 'sticky') {
        e.style.setProperty('display', 'none', 'important');
      }
    });
  });

  await content.screenshot({
    path: `screenshot_${requestId}.png`,
  });

  await browser.close();
})();
