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

    // Fill in the PIN using page.evaluate
    await page.evaluate((segs) => {
      const inputs = document.querySelectorAll('input[type="text"]');
      if (inputs.length >= 5) {
        inputs[0].value = segs.seg1;
        inputs[1].value = segs.seg2;
        inputs[2].value = segs.seg3;
        inputs[3].value = segs.seg4;
        inputs[4].value = segs.seg5;
      }
    }, segments);

    console.log('Filled in PIN fields');

    // Click the search button using JavaScript
    const buttonClicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"], a');
      
      for (const button of buttons) {
        const text = (button.textContent || button.value || '').toLowerCase();
        if (text.includes('search') || text.includes('submit') || text.includes('find')) {
          console.log('Found button:', text);
          button.click();
          return true;
        }
      }
      return false;
    });

    if (!buttonClicked) {
      await browser.close();
      return res.json({
        success: false,
        error: "Could not find or click search button"
      });
    }

    console.log('Button clicked');

    // Wait for results (either navigation or dynamic content)
    try {
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
        page.waitForTimeout(8000)
      ]);
    } catch (e) {
      console.log('Navigation/wait completed');
    }

    // Get current state
    const currentUrl = page.url();
    const pageTitle = await page.title();
    const bodyText = await page.evaluate(() => document.body.innerText);

    await browser.close();

    res.json({
      success: true,
      pin: pin,
      url: currentUrl,
      pageTitle: pageTitle,
      bodyText: bodyText.substring(0, 2000),
      note: "Check bodyText for taxpayer info. If URL changed, we navigated successfully."
    });

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
