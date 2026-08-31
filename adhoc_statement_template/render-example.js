// npm install express handlebars playwright mssql
// This example renders the template with sample JSON. Replace sample-data.json with SQL Server results.
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const { chromium } = require('playwright');

async function renderPdf() {
  const templatePath = path.join(__dirname, 'templates', 'adhoc-statement.hbs');
  const dataPath = path.join(__dirname, 'sample', 'sample-data.json');
  const outputPath = path.join(__dirname, 'adhoc-statement-sample.pdf');

  const template = Handlebars.compile(fs.readFileSync(templatePath, 'utf8'));
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const html = template(data).replace('../public/css/adhoc-statement.css', path.join(__dirname, 'public/css/adhoc-statement.css'));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.pdf({ path: outputPath, format: 'A4', printBackground: true });
  await browser.close();

  console.log(`PDF saved to ${outputPath}`);
}

renderPdf().catch(console.error);
