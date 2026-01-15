const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const MAX_LOADING_TIME = 40_000;
const MAX_TOTAL_TIME = 90_000;

/* ---------------------------------- */
/* 폰트 깨짐 감지                      */
/* ---------------------------------- */
async function isFontBroken(page) {
  return await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    let checked = 0;
    while (walker.nextNode() && checked < 80) {
      const t = walker.currentNode.textContent;
      if (t && /[\u25A1\u25A0\uFFFD]/.test(t)) return true;
      checked++;
    }
    return false;
  });
}

/* ---------------------------------- */
/* 네이버 블로그 전용 폰트 주입 (핵심) */
/* ---------------------------------- */
async function injectNaverFont(page) {
  await page.addStyleTag({
    content: `
      @font-face {
        font-family: 'NaverKR';
        src: url('https://fonts.gstatic.com/s/notosanskr/v27/PbykFmXiEBPT4ITbgNA5CgmOelzI7Xc.woff2')
             format('woff2');
        font-weight: 400;
        font-style: normal;
        font-display: block;
      }

      .se-main-container,
      .se-main-container * {
        font-family: 'NaverKR', system-ui, -apple-system, BlinkMacSystemFont, Arial, sans-serif !important;
      }
    `
  });
}

/* ---------------------------------- */
/* 메인                               */
/* ---------------------------------- */
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

  /* ---------- 페이지 진입 ---------- */
  await page.goto(url, {
    waitUntil: 'domcontentloaded', // ⭐ 네이버 전용
    timeout: 30_000,
  });

  /* ---------- lazy-load + 이미지 대기 ---------- */
  await Promise.race([
    (async () => {
      // lazy scroll
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

      // 이미지 고해상도 src 대기
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
                ) resolve();
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

  /* ---------- 본문 selector ---------- */
  let content;
  try {
    await page.waitForSelector('.se-main-container', { timeout: 10_000 });
    content = await page.$('.se-main-container');
  } catch {
    console.warn('⚠️ se-main-container not found, fallback to body');
    content = await page.$('body');
  }

  /* ---------- UI 제거 ---------- */
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

  /* ---------- ⭐ 폰트 주입 + 대기 ---------- */
  await injectNaverFont(page);

  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  });
  await sleep(1200);

  const filePath = `screenshot_${requestId}.png`;

  /* ---------- 1차 캡처 ---------- */
  await content.screenshot({ path: filePath });

  /* ---------- 폰트 깨짐 시 1회 재시도 ---------- */
  if (await isFontBroken(page)) {
    console.warn('⚠️ Font broken detected → retrying once');
    await injectNaverFont(page);
    await page.evaluate(() => document.fonts.ready);
    await sleep(1200);
    await content.screenshot({ path: filePath });
  }

  if (Date.now() - startTime > MAX_TOTAL_TIME) {
    console.warn('⏱️ Total time exceeded, forced finish');
  }

  await browser.close();
})();
