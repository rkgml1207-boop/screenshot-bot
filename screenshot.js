const puppeteer = require('puppeteer');

(async () => {
  const url = process.env.TARGET_URL;

  console.log('TARGET_URL:', url);

  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error(`Invalid TARGET_URL: ${url}`);
  }

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

  await page.goto(url, { waitUntil: 'networkidle0' });

  await page.screenshot({
    path: 'screenshot.png',
    fullPage: true,
  });

  await browser.close();
})();
