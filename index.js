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

    await page.waitForTimeout(3000);

    // Fill in the PIN boxes with the correct IDs
    await page.type('#pinBox1', segments.seg1);
    await page.type('#pinBox2', segments.seg2);
    await page.type('#pinBox3', segments.seg3);
    await page.type('#pinBox4', segments.seg4);
    await page.type('#pinBox5', segments.seg5);

    console.log('Filled PIN fields');

    // Click the search button
    await page.click('#ContentPlaceHolder1_PINAddressSearch_btnSearch');
    
    console.log('Clicked search button');

    // Wait for navigation to results page
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    console.log('Navigated to results');

    // Extract data from results page
    const data = await page.evaluate(() => {
      // Get all the text content
      const bodyText = document.body.innerText;
      
      // We'll return the full body text to see what's on the page
      // Then we can identify the correct selectors for taxpayer name, etc.
      return {
        url: window.location.href,
        title: document.title,
        bodyText: bodyText
      };
    });

    await browser.close();

    res.json({
      success: true,
      pin: pin,
      url: data.url,
      pageTitle: data.title,
      bodyText: data.bodyText.substring(0, 3000), // First 3000 chars
      note: "Successfully retrieved results. Check bodyText for taxpayer info."
    });

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
