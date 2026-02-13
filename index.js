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
    // Split PIN into segments: 16-02-324-011-0000
    const segments = {
      seg1: pin.substring(0, 2),
      seg2: pin.substring(2, 4),
      seg3: pin.substring(4, 7),
      seg4: pin.substring(7, 10),
      seg5: pin.substring(10, 14)
    };

    // Launch headless browser
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
    
    // Go to Cook County site
    await page.goto('https://www.cookcountypropertyinfo.com/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait a bit for any JavaScript to load
    await page.waitForTimeout(3000);

    // Try to find input fields with different selectors
    const inputSelectors = [
      'input[name*="pin"]',
      'input[id*="pin"]',
      'input[id*="Pin"]',
      'input[type="text"]'
    ];

    // Get all input fields on the page
    const inputs = await page.$$('input[type="text"]');
    console.log(`Found ${inputs.length} text input fields`);

    // If we have at least 5 inputs, assume they're the PIN boxes
    if (inputs.length >= 5) {
      await inputs[0].type(segments.seg1);
      await inputs[1].type(segments.seg2);
      await inputs[2].type(segments.seg3);
      await inputs[3].type(segments.seg4);
      await inputs[4].type(segments.seg5);

      // Find and click search button
      const buttons = await page.$$('button, input[type="submit"], input[type="button"]');
      
      // Try to find the search/submit button
      for (const button of buttons) {
        const text = await page.evaluate(el => el.textContent || el.value, button);
        if (text && (text.includes('Search') || text.includes('Submit') || text.includes('Find'))) {
          await button.click();
          break;
        }
      }

      // Wait for navigation
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

      // Get the full page HTML to help us find the data
      const html = await page.content();

      // Try to extract taxpayer info
      const data = await page.evaluate(() => {
        // Try multiple possible selectors
        const getTextBySelectors = (selectors) => {
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) return el.textContent.trim();
          }
          return null;
        };

        return {
          pageTitle: document.title,
          bodyText: document.body.innerText.substring(0, 500) // First 500 chars
        };
      });

      await browser.close();

      res.json({
        success: true,
        pin: pin,
        data: data,
        note: "Successfully navigated. Check 'bodyText' to find taxpayer info."
      });

    } else {
      await browser.close();
      res.json({
        success: false,
        error: `Only found ${inputs.length} input fields. Expected at least 5 for PIN entry.`
      });
    }

  } catch (error) {
    if (browser) await browser.close();
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
