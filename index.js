const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.send('Cook County Tax Scraper is running! Use /scrape?pin=YOUR_PIN');
});

app.get('/scrape', async (req, res) => {
  const pin = req.query.pin;

  if (!pin || pin.length !== 14) {
    return res.status(400).json({ error: 'Invalid PIN. Must be 14 digits.' });
  }

  try {
    // Split PIN into segments: 16-02-324-011-0000
    const segments = {
      seg1: pin.substring(0, 2),
      seg2: pin.substring(2, 4),
      seg3: pin.substring(4, 7),
      seg4: pin.substring(7, 10),
      seg5: pin.substring(10, 14)
    };

    // Launch headless browser
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Go to Cook County site
    await page.goto('https://www.cookcountypropertyinfo.com/', {
      waitUntil: 'networkidle0'
    });

    // Fill in the PIN boxes
    await page.type('#Pin1', segments.seg1);
    await page.type('#Pin2', segments.seg2);
    await page.type('#Pin3', segments.seg3);
    await page.type('#Pin4', segments.seg4);
    await page.type('#Pin5', segments.seg5);

    // Click the search button
    await page.click('#propertySearchButton');

    // Wait for results page to load
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });

    // Extract data from the results page
    const data = await page.evaluate(() => {
      const taxpayerElement = document.querySelector('.taxpayer-name');
      const statusElement = document.querySelector('.tax-status');
      const amountElement = document.querySelector('.amount-owed');

      return {
        taxpayer: taxpayerElement ? taxpayerElement.textContent.trim() : 'Not found',
        status: statusElement ? statusElement.textContent.trim() : 'Not found',
        amount: amountElement ? amountElement.textContent.trim() : 'Not found'
      };
    });

    await browser.close();

    res.json({
      success: true,
      pin: pin,
      ...data
    });

  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Scraper running on port ${PORT}`);
});