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

  let browser;
  try {
    const segments = {
      seg1: pin.substring(0, 2),
      seg2: pin.substring(2, 4),
      seg3: pin.substring(4, 7),
      seg4: pin.substring(7, 10),
      seg5: pin.substring(10, 14)
    };

    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    await page.goto('https://www.cookcountypropertyinfo.com/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await page.waitForTimeout(2000);

    const inputs = await page.$$('input[type="text"]');
    console.log(`Found ${inputs.length} text input fields`);

    if (inputs.length >= 5) {
      // Fill in PIN
      await inputs[0].type(segments.seg1);
      await inputs[1].type(segments.seg2);
      await inputs[2].type(segments.seg3);
      await inputs[3].type(segments.seg4);
      await inputs[4].type(segments.seg5);

      // Click search button and wait for either navigation OR results to load
      const buttons = await page.$$('button, input[type="submit"], input[type="button"], a');
      
      let clicked = false;
      for (const button of buttons) {
        const text = await page.evaluate(el => (el.textContent || el.value || '').toLowerCase(), button);
        if (text.includes('search') || text.includes('submit') || text.includes('find') || text.includes('go')) {
          console.log(`Clicking button with text: ${text}`);
          await button.click();
          clicked = true;
          break;
        }
      }

      if (!clicked) {
        await browser.close();
        return res.json({
          success: false,
          error: "Could not find search button"
        });
      }

      // Wait for results to load (either navigation OR dynamic content)
      // Try both approaches
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
        console.log("Page navigated to results");
      } catch (navError) {
        console.log("No navigation detected, checking for dynamic content");
        // Wait a bit for AJAX to complete
        await page.waitForTimeout(5000);
      }

      // Get the page URL and content
      const currentUrl = page.url();
      const pageTitle = await page.title();
      
      // Get page content to find taxpayer info
      const bodyText = await page.evaluate(() => document.body.innerText);

      await browser.close();

      res.json({
        success: true,
        pin: pin,
        url: currentUrl,
        pageTitle: pageTitle,
        bodyText: bodyText.substring(0, 1000), // First 1000 chars to see what's on the page
        note: "Check bodyText for taxpayer name and tax info"
      });

    } else {
      await browser.close();
      res.json({
        success: false,
        error: `Only found ${inputs.length} input fields`
      });
    }

  } catch (error) {
    if (browser) await browser.close();
    console.error('Scraping error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

app.listen(PORT, () => {
  console.log(`Scraper running on port ${PORT}`);
});
