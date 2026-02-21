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
        '--disable-gpu',
        '--single-process',
        '--disable-extensions'
      ]
    });
    const page = await browser.newPage();
    
    await page.goto('https://www.cookcountypropertyinfo.com/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await page.waitForTimeout(3000);
    await page.type('#pinBox1', segments.seg1);
    await page.type('#pinBox2', segments.seg2);
    await page.type('#pinBox3', segments.seg3);
    await page.type('#pinBox4', segments.seg4);
    await page.type('#pinBox5', segments.seg5);
    await page.click('#ContentPlaceHolder1_PINAddressSearch_btnSearch');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    const data = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      
      const mailingMatch = bodyText.match(/MAILING ADDRESS\s+([^\n]+)/);
      const taxpayerName = mailingMatch ? mailingMatch[1].trim() : 'Not found';
      
      const mailingAddressMatch = bodyText.match(/MAILING ADDRESS\s+([^\n]+)\s+([^\n]+)\s+([^\n]+)/);
      let mailingAddress = 'Not found';
      if (mailingAddressMatch) {
        const line2 = mailingAddressMatch[2].trim();
        const line3 = mailingAddressMatch[3].trim();
        mailingAddress = `${line2}, ${line3}`;
      }
      
      const tax2024Match = bodyText.match(/2024:\s*\$?([\d,]+\.?\d*)\s*\n\s*Pay Online:\s*\$?([\d,]+\.?\d*)/);
      const amountOwed = tax2024Match ? tax2024Match[2] : 'Not found';
      
      const paidInFull = bodyText.includes('2024:') && bodyText.match(/2024:[^\n]*Paid in Full/);
      
      return {
        taxpayerName,
        mailingAddress,
        amountOwed,
        status: paidInFull ? 'Paid in Full' : (amountOwed !== '0' ? 'Unpaid' : 'Unknown')
      };
    });
    await browser.close();
    res.json({
      success: true,
      pin: pin,
      taxpayer: data.taxpayerName,
      mailingAddress: data.mailingAddress,
      amountOwed: data.amountOwed,
      status: data.status
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
