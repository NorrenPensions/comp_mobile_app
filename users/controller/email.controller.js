const Sentry = require('@sentry/node');
const nodemailer = require("nodemailer");
var currencyFormatter = require('currency-formatter');
const { getConnection } = require("../../database/connection");
const sql = require('mssql');
const path = require('path');
const puppeteer = require('puppeteer');
const handlebars = require("handlebars");
const fs = require("fs");
const os = require('os');
const normalizePin = require('../utility/normalizePin');

var price;

async function generatePDF(htmlContent, outputPath) {
    let browser;
    try {
        // Ensure output directory exists
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const launchOptions = {
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-zygote"
            ]
        };

        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        }

        browser = await puppeteer.launch(launchOptions);

        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });
        await page.waitForNetworkIdle({ idleTime: 500 });

        // Capture PDF in memory
        const pdfBuffer = await page.pdf({
            format: "A4",
            landscape: false,
            margin: { top: "2mm", right: "2mm", bottom: "2mm", left: "2mm" },
            printBackground: true
        });

        fs.writeFileSync(outputPath, pdfBuffer);

        await page.close();
    } catch (error) {
        console.error("Error generating PDF:", error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: 587,
    auth: {
        user: process.env.EMAIL_ADDRESS,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
})


const sendStatement = async (req, res) => {
    const { pin: rawPin, from, to, sendToEmail } = req.body;

    if (!rawPin || !from || !to || !sendToEmail) {
        return res.status(400).json({ error: "PIN, from, to, and sendToEmail are required" });
    }

    const pin = normalizePin(rawPin);

    try {
        const pool = await getConnection();

        // 1. Run stored procedure
        const request = pool.request();
        request.input("PIN", sql.VarChar(30), pin);
        request.input("DATEFROM", sql.VarChar(30), from);
        request.input("DATETO", sql.VarChar(30), to);
        await request.execute("[PFA].[dbo].[proc_adhoc_statement]");

        // 2. Fetch header
        const headerResult = await pool.request()
            .input("pin", sql.VarChar(30), pin)
            .query("SELECT * FROM [PFA].[dbo].[ADHOC_STATEMENT_HEADER] WHERE PIN = @pin");

        if (headerResult.recordset.length === 0) {
            return res.status(404).json({ error: "No statement header found for the provided PIN" });
        }

        const dbHeader = headerResult.recordset[0];

        // 3. Fetch body
        const bodyResult = await pool.request()
            .input("pin", sql.VarChar(30), pin)
            .query("SELECT * FROM [PFA].[dbo].[ADHOC_STATEMENT_BODY] WHERE PIN = @pin ORDER BY SN, CONTDATE, TRANS_DATE, DESCR DESC");

        const dbBody = bodyResult.recordset;

        // Formatter functions
        const formatAmount = (val) => {
            if (val === undefined || val === null) return "0.00";
            const num = parseFloat(val);
            if (isNaN(num)) return "0.00";
            if (num < 0) {
                return `(${Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
            }
            return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        const formatUnits = (val) => {
            if (val === undefined || val === null) return "0.0000";
            const num = parseFloat(val);
            if (isNaN(num)) return "0.0000";
            return num.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
        };

        const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        const formatEndLabel = (dateString) => {
            if (!dateString) return "";
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return "";
            return `${date.getDate().toString().padStart(2, "0")}-${months[date.getMonth()]}-${date.getFullYear()}`;
        };

        // Format Header
        const header = {
            fullname: dbHeader.FULLNAME || "",
            addresses: dbHeader.ADDRESSES || "",
            employerName: dbHeader.EMPLOYER_NAME || "",
            states: dbHeader.STATES || "",
            dofc: dbHeader.DOFC || "",
            fund: dbHeader.FUND || "",
            pin: dbHeader.PIN || "",
            mandCont: formatAmount(dbHeader.MAND_CONT),
            volCont: formatAmount(dbHeader.VOL_CONT),
            preactNsitfCont: formatAmount(dbHeader.PREACTNSITF_CONT),
            totalCont: formatAmount(dbHeader.TOTAL_CONT),
            mandWtdr: formatAmount(dbHeader.MAND_WTDR),
            volWtdr: formatAmount(dbHeader.VOL_WTDR),
            preactNsitfWtdr: formatAmount(dbHeader.PREACTNSITF_WTDR),
            totalWtdr: formatAmount(dbHeader.TOTAL_WTDR),
            mandNet: formatAmount(dbHeader.MAND_NET),
            volNet: formatAmount(dbHeader.VOL_NET),
            preactNsitfNet: formatAmount(dbHeader.PREACTNSITF_NET),
            totalNet: formatAmount(dbHeader.TOTAL_NET),
            mandGrowth: formatAmount(dbHeader.MAND_GROWTH),
            volGrowth: formatAmount(dbHeader.VOL_GROWTH),
            preactNsitfGrowth: formatAmount(dbHeader.PREACTNSITF_GROWTH),
            totalGrowth: formatAmount(dbHeader.TOTAL_GROWTH),
            mandBal: formatAmount(dbHeader.MAND_BAL),
            volBal: formatAmount(dbHeader.VOL_BAL),
            preactNsitfBal: formatAmount(dbHeader.PREACTNSITF_BAL),
            totalBal: formatAmount(dbHeader.TOTAL_BAL),
            mandUnits: formatUnits(dbHeader.MAND_UNITS),
            volUnits: formatUnits(dbHeader.VOL_UNITS),
            preactNsitfUnits: formatUnits(dbHeader.PREACTNSITF_UNITS),
            totalUnits: formatUnits(dbHeader.TOTAL_UNITS),
            unitPrice: formatUnits(dbHeader.UNIT_PRICE)
        };

        // Format Body and Group them
        const body = [];
        let lastHeader = null;

        dbBody.forEach((row) => {
            const isGainLoss = row.DESCR && row.DESCR.toLowerCase().includes("gain/loss");

            if (row.HEADER && row.HEADER.trim() !== "") {
                const currentHeader = row.HEADER.trim();
                if (currentHeader !== lastHeader) {
                    body.push({ isGroupHeader: true, header: currentHeader });
                    lastHeader = currentHeader;
                }
            }

            body.push({
                descr: row.DESCR || "",
                transDate: row.TRANS_DATE || "",
                mandatory: formatAmount(row.MANDATORY),
                voluntary: formatAmount(row.VOLUNTARY),
                preactNsitf: formatAmount(row.PREACTNSITF),
                total: formatAmount(row.TOTAL),
                remark: row.REMARK || "",
                isFinal: isGainLoss
            });
        });

        // 4. Compile and render Handlebars template
        const templatePath = path.join(__dirname, "../../adhoc_statement_template/templates/adhoc-statement.hbs");
        const cssPath = path.join(__dirname, "../../adhoc_statement_template/public/css/adhoc-statement.css");
        const logoPath = path.join(__dirname, "../../adhoc_statement_template/public/img/norren-logo.png");
        const footerPath = path.join(__dirname, "../../adhoc_statement_template/public/img/footer.png");
        const watermarkPath = path.join(__dirname, "../../adhoc_statement_template/public/img/watermark.png");

        const logoUrl = fs.existsSync(logoPath) ? `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}` : "";
        const bannerUrl = fs.existsSync(footerPath) ? `data:image/png;base64,${fs.readFileSync(footerPath).toString("base64")}` : "";
        const watermarkUrl = fs.existsSync(watermarkPath) ? `data:image/png;base64,${fs.readFileSync(watermarkPath).toString("base64")}` : "";

        const templateSource = fs.readFileSync(templatePath, "utf8");
        const template = handlebars.compile(templateSource);

        const templateData = {
            statementEndLabel: formatEndLabel(to),
            logoUrl,
            bannerUrl,
            watermarkUrl,
            header,
            body
        };

        let finalHtml = template(templateData);

        if (fs.existsSync(cssPath)) {
            const cssContent = fs.readFileSync(cssPath, "utf8");
            finalHtml = finalHtml.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/i, `<style>${cssContent}</style>`);
        }

        // 5. Generate PDF
        const pdfPath = path.join(__dirname, "../../statements", `${pin}_statement.pdf`);
        await generatePDF(finalHtml, pdfPath);

        // 6. Send email with attachment
        const fname = dbHeader.FULLNAME ? dbHeader.FULLNAME.split(" ")[0] : "Customer";

        const mailOptions = {
            from: `Norrenberger Pensions <noreply-npl@norrenpensions.com>`,
            to: sendToEmail,
            subject: "E-Statement",
            html: `<b>Dear ${fname},</b><br>
               <p>Thank you for choosing Norrenberger Pensions Managers LTD.</p>
               <p>Kindly find attached e-statement.</p>`,
            attachments: [{ filename: `${pin}_statement.pdf`, path: pdfPath }]
        };

        transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
                console.error("Error sending statement email:", err);
                Sentry.captureException(err);
            }
            if (fs.existsSync(pdfPath)) {
                try {
                    fs.unlinkSync(pdfPath); // Delete PDF after sending email
                } catch (e) {
                    console.error("Error deleting PDF file:", e);
                }
            }
        });

        return res.status(200).json({
            code: 200,
            message: "Statement generated and sent successfully"
        });

    } catch (error) {
        console.error("Error generating and sending statement:", error);
        Sentry.captureException(error);
        return res.status(500).json({ error: "An error occurred while generating and sending the statement." });
    }
};

// ================= OLD IMPLEMENTATION (PRESERVED FOR REFERENCE) =================
// const sendStatement = async (req, res) => {
//     try {
//         const { from, to, sendToEmail } = req.body;
//         const npin = req.body.pin;
//         const pin = normalizePin(npin);
//         console.log('payload to users folder: ', pin, from, to, sendToEmail);
//         const pool = await getConnection();
// 
//         const today = new Date().toDateString();
//         var start = new Date(from).toDateString();
//         var end = new Date(to).toDateString();
//         console.log('End date: ', end);
// 
//         const result = await pool.request().input('pin', pin).query(`SELECT 
//             E.PIN,
//             
//             'FUND_CODE' = CASE 
//                          WHEN C.FUND_ID = 73 THEN 'FUND1'
//                          WHEN C.FUND_ID = 1 THEN 'FUND2'
//                          WHEN C.FUND_ID = 74 THEN 'FUND3'
//                          WHEN C.FUND_ID = 12 THEN 'FUND4'
//                          WHEN C.FUND_ID = 79 THEN 'FUND5'
//                          WHEN C.FUND_ID = 84 THEN 'FUND6 ACTIVE'
//             
//                          ELSE 'UNKNOWN'
//     
//                          END
//             FROM PFA.dbo.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
//             WHERE C.FUND_ID IN (73,1,74,12, 79, 84)
//             
//             AND E.PIN IN (@pin)
//             
//             GROUP BY C.FUND_ID,  E.PIN
//            
//             HAVING SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) > 0
//             
//             `);
// 
// 
//         if (result.recordset.length > 0) {
// 
//             const fundid = result.recordset[0]['FUND_CODE'];
// 
//             //FUND 1
//             if (fundid == "FUND1") {
//                 const fundCode = await pool.request()
//                     .input('to', to)
//                     .query(`
//     
//             SELECT top (1)  SCHEME_ID AS FUND_ID,
//             'FUND_CODE' = CASE 
//                                  WHEN SCHEME_ID = 73 THEN 'FUND1'
//                                 
//                                  ELSE 'OTHERS'
//             
//                                  END,
//             
//             BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
//             
//             WHERE  SCHEME_ID IN (73)
//             
//             
//             ORDER BY VALUATION_DATE DESC
//             `)
// 
//                 if (fundCode.recordset.length == 0) {
// 
//                     const fundCode2 = await pool.request()
// 
//                         .query(`
//     
//                             SELECT top (1)  SCHEME_ID AS FUND_ID,
//                             'FUND_CODE' = CASE 
//                              WHEN SCHEME_ID = 73 THEN 'FUND1'
//                             
//                              ELSE 'OTHERS'
//         
//                              END,
//         
//                             BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
//         
//                             WHERE  SCHEME_ID IN (73)
//         
//                             ORDER BY VALUATION_DATE DESC`)
// 
//                     price = fundCode2.recordset[0]['BID_PRICE']
// 
// 
//                 } else {
//                     price = fundCode.recordset[0]['BID_PRICE']
//                 }
// 
//                 const results = await pool.request()
//                     .input('pin', pin)
//                     .input('from', from)
//                     .input('to', to)
//                     .input('price', price)
//                     .query(`SELECT 
//     
//                     E.PIN,E.SURNAME, E.FIRSTNAME, E.OTHERNAMES, 
//                     
//                     'FUND_CODE' = CASE 
//                     
//                                  WHEN C.FUND_ID = 73 THEN 'FUND2'
//                                  
//                                  ELSE 'UNKNOWN'
//                     
//                                  END,
//                              
//                     'RSA_BALANCE' = CASE
//                     
//                                 WHEN C.FUND_ID = 73 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
//                     
//                     
//                                 END,  
//                                 (CASE
//                     
//                                 WHEN C.FUND_ID = 73 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
//                     
//                               
//                                 END)-(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS [RSA_GROWTH],
//                                 SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS [RSA_CUMULATIVE_UNITS],
//                               
//                                    SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "RSA_NET_CONTRIBUTION",
//                     
//                                 SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
//                     
//                     'VOLUNTARY_BALANCE' = CASE
//                     
//                                 WHEN C.FUND_ID = 73 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                 END,  
//                     
//                                 (CASE
//                     
//                                 WHEN C.FUND_ID = 73 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//             
//                                 END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
//                     
//                                 SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
//                     
//                                 SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
//                     
//                             SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
//                                 
//                                 SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS "NET_CONTRIBUTION",
//                             
//                     'TOTAL_BALANCE' = CASE
//                                 WHEN C.FUND_ID = 73 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                 END,  
//                     
//                                 (CASE
//                                WHEN C.FUND_ID = 73 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//  
//                                 END)- (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH],
//                     
//                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
//                     
//                                  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2) AS "WITHDRAWAL",
//                     
//                                  ROUND(SUM(ISNULL(C.WITHDRAWAL_VC, 0)), 2) AS "VC_WITHDRAWAL",
//                     
//                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN FEE]
//                     
//                     FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
//                     
//                     INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID
//                     
//                     WHERE C.FUND_ID IN (73)
//                     
//                     AND E.PIN = @pin
//                     
//                     GROUP BY E.PIN, E.SURNAME, E.FIRSTNAME, E.OTHERNAMES,  C.FUND_ID
//                     
//                     HAVING sum(ISNULL(trans_UNITS_R,0) + ISNULL(TRANS_UNITS_V,0))  <> 0
//                     
//                     ORDER BY E.PIN 
//     
//             `);
// 
//                 if (results.recordsets[0].length != 0) {
// 
//                     const narates = await (await pool)
//                         .request()
//                         .input('pin', pin)
//                         .input('from', from)
//                         .input('to', to)
//                         .query(`
//     
//                 SELECT DISTINCT  
//                 CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
//                       CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
//                       FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
//                        B.NARRATION,
//                        CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
//               
//                                   , C.VALUE_DATE ,
//                                   SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
//     
//                                   FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
//                      
//                                   SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
//                                   
//     
//               
//               FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
//               INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
//                         WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
//                       
//                  
//               
//                     AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
//                    
//               
//                    AND C.VALUE_DATE BETWEEN @from AND @to
//                    --AND B.NARRATION NOT LIKE  '%INTEREST%'
//                    AND E.PIN IN (@pin)
//     
//               GROUP BY    
//               E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
//                            E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
//               
//               ORDER BY  C.VALUE_DATE ASC
//                 `);
// 
//                     const userData = await (await pool)
//                         .request()
//                         .input('pin', pin)
//                         .query(`
//                 SELECT PIN, FIRSTNAME, OTHERNAMES, SURNAME, MOBILE_PHONE                     
//                 FROM PFA.DBO.EMPLOYEES  WHERE PIN = @pin
//     
//                 `);
// 
// 
//                     // Voluntry contributions
// 
//                     const vc = await pool
//                         .request()
//                         .input('pin', pin)
//                         .input('from', from)
//                         .input('to', to)
//                         .query(`
//                         SELECT DISTINCT  
//                         CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
//                             CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
//                             FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
//                             FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
//                             FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
//                             FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
//                             FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
//                             FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
//                             FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
//                                 B.NARRATION,
//                                 CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
//        
//                            , C.VALUE_DATE ,
//                            SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
// 
//                            FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
//               
//                            SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
//                            
// 
//        
//                             FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
//                             INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
//                                         WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
//                
//           
//        
//                             AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
//             
//        
//                             AND C.VALUE_DATE BETWEEN @from AND @to
//                             --AND B.NARRATION NOT LIKE  '%INTEREST%'
//                             AND E.PIN IN (@pin)
//                             AND C.OTHER_CONTRIBUTION != 0
// 
//                     GROUP BY    
//                     E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
//                                     E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
//        
//                     ORDER BY  C.VALUE_DATE ASC
//                         `);
// 
//                     var employee = currencyFormatter.format(results.recordsets[0][0]['EMPLOYEE_CONTRIBUTION'], { code: '' })
//                     var employer = currencyFormatter.format(results.recordsets[0][0]['EMPLOYER_CONTRIBUTION'], { code: '' })
//                     var tnet = currencyFormatter.format(results.recordsets[0][0]['NET_CONTRIBUTION'], { code: '' })
// 
//                     var vGrowth = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_GROWTH'], { code: '' })
//                     var tGrowth = currencyFormatter.format(results.recordsets[0][0]['TOTAL_GROWTH'], { code: '' })
//                     var rGrowth = currencyFormatter.format(results.recordsets[0][0]['RSA_GROWTH'], { code: '' })
//                     var vat = currencyFormatter.format(narates?.recordsets?.[0]?.[0]?.['VAT_FEE'] ?? 0, { code: '' })
//                     var fee = currencyFormatter.format(narates?.recordsets?.[0]?.[0]?.['ADMIN_FEE'] ?? 0, { code: '' })
//                     var balance = currencyFormatter.format(results.recordsets[0][0]['RSA_BALANCE'], { code: '' })
//                     var vbalance = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_BALANCE'], { code: '' })
//                     var tbalance = currencyFormatter.format(results.recordsets[0][0]['TOTAL_BALANCE'], { code: '' })
//                     var tcon = currencyFormatter.format(results.recordsets[0][0]['TOTAL_CONTRIBUTION'], { code: '' })
//                     var voluntry = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_CONTRIBUTION'], { code: '' })
//                     var rnet = currencyFormatter.format(results.recordsets[0][0]['RSA_NET_CONTRIBUTION'], { code: '' })
//                     var unit = currencyFormatter.format(results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
//                     var vunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'], { code: '' })
// 
//                     var prices = price;
//                     var tunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'] + results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
// 
//                     var rsapin = userData.recordset[0]['PIN']
//                     var phone = userData.recordset[0]['MOBILE_PHONE']
//                     var name = userData.recordset[0]['FIRSTNAME'] + " " + userData.recordset[0]['OTHERNAMES'] + " " + userData.recordset[0]['SURNAME']
//                     var fname = userData.recordset[0]['FIRSTNAME'];
// 
//                     let htmlTemplate = fs.readFileSync("template.html", "utf8");
// 
//                     const fundType = 'NORRENBERGER RSA FUND 1';
// 
//                     const template = handlebars.compile(htmlTemplate);
// 
//                     const data = {
//                         data: narates.recordsets[0],
//                         vc: vc.recordsets[0],
//                         pin: pin,
//                         value: 0,
//                         balance,
//                         tcon,
//                         voluntry,
//                         rnet,
//                         unit,
//                         prices,
//                         fundType,
//                         phone,
//                         rsapin,
//                         name,
//                         employee,
//                         employer,
//                         vat,
//                         fee,
//                         tbalance,
//                         vunit,
//                         tunit,
//                         vbalance,
//                         today,
//                         start,
//                         end,
//                         tGrowth,
//                         vGrowth,
//                         rGrowth,
//                         tnet
//                     }
// 
//                     const finalHtml = template(data);
// 
//                     const pdfPath = path.join(__dirname, '../../statements', `${pin}_statement.pdf`);
// 
//                     await generatePDF(finalHtml, pdfPath);
// 
//                     const mailOptions = {
//                         from: `Norrenberger Pensions <noreply-npl@norrenpensions.com>`,
//                         to: sendToEmail,
//                         subject: "E-Statement",
//                         html: `<b>Dear ${fname},</b><br>
//                                <p>Thank you for choosing Norrenberger Pensions Managers LTD.</p>
//                                <p>Kindly find attached e-statement.</p>`,
//                         attachments: [{ filename: `${pin}_statement.pdf`, path: pdfPath }]
//                     };
// 
//                     transporter.sendMail(mailOptions, (err, info) => {
//                         if (err) {
//                             console.log(err);
//                             Sentry.captureException(err);
//                         }
//                         if (fs.existsSync(pdfPath)) {
//                             try {
//                                 fs.unlinkSync(pdfPath); // Delete PDF after sending email
//                             } catch (e) {
//                                 console.error("Error deleting PDF file:", e);
//                             }
//                         }
//                     });
// 
//                     return res.json({ code: 200, data: results.recordsets[0] });
// 
// 
//                 } else {
//                     console.log('Statement sending failed.');
//                     return res.json({ msg: 0 })
//                 }
// 
//             }
// 
// 
//             // FUND 2
// 
//             if (fundid == "FUND2") {
//                 const fundCode = await pool.request()
//                     .input('to', to)
//                     .query(`
//                             SELECT top 1  SCHEME_ID AS FUND_ID,
//                             'FUND_CODE' = CASE 
//                                  WHEN SCHEME_ID = 1 THEN 'FUND2'
//                                 
//                                  ELSE 'OTHERS'
//             
//                                  END,
//             
//                             BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
//             
//                             WHERE  SCHEME_ID IN (1)
//             
//             
//                             ORDER BY VALUATION_DATE DESC
//             `)
// 
// 
//                 if (fundCode.recordset.length == 0) {
// 
//                     const fundCode2 = await pool.request()
// 
//                         .query(`
//     
//                         SELECT top (1)  SCHEME_ID AS FUND_ID,
//                         'FUND_CODE' = CASE 
//                                  WHEN SCHEME_ID = 1 THEN 'FUND2'
//                                 
//                                  ELSE 'OTHERS'
//             
//                                  END,
//             
//                         BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
//             
//                         WHERE  SCHEME_ID IN (1)
//             
//                         ORDER BY VALUATION_DATE DESC`)
// 
//                     price = fundCode2.recordset[0]['BID_PRICE']
// 
//                 } else {
//                     price = fundCode.recordset[0]['BID_PRICE']
//                 }
// 
//                 const results = await pool.request()
//                     .input('pin', pin)
//                     .input('from', from)
//                     .input('to', to)
//                     .input('price', price)
//                     .query(`SELECT 
//     
//                     E.PIN,E.SURNAME, E.FIRSTNAME, E.OTHERNAMES, 
//                     
//                     'FUND_CODE' = CASE 
//                     
//                                  WHEN C.FUND_ID = 1 THEN 'FUND2'
//                                  
//                                  ELSE 'UNKNOWN'
//                     
//                                  END,
//                              
//                     'RSA_BALANCE' = CASE
//                     
//                                 WHEN C.FUND_ID = 1 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
//                     
//                     
//                                 END,  
//                                 (CASE
//                     
//                                 WHEN C.FUND_ID = 1 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
//                     
//                               
//                                 END)-(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS [RSA_GROWTH],
//                                 SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS [RSA_CUMULATIVE_UNITS],
//                               
//                                    SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "RSA_NET_CONTRIBUTION",
//                     
//                                 SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
//                     
//                     'VOLUNTARY_BALANCE' = CASE
//                     
//                                 WHEN C.FUND_ID = 1 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                 END,  
//                     
//                                 (CASE
//                     
//                                 WHEN C.FUND_ID = 1 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                
//                     
//                                 END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
//                     
//                                 SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
//                     
//                                 SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
//                     
//                             SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
//                                 
//                                 SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS "NET_CONTRIBUTION",
//                             
//                     'TOTAL_BALANCE' = CASE
//                                 WHEN C.FUND_ID = 1 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                 END,  
//                     
//                                 (CASE
//                                WHEN C.FUND_ID = 1 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                
//                     
//                                 END)- (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH],
//                     
//                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
//                     
//                                  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2) AS "WITHDRAWAL",
//                     
//                                  ROUND(SUM(ISNULL(C.WITHDRAWAL_VC, 0)), 2) AS "VC_WITHDRAWAL",
//                     
//                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN FEE]
//                     
//                     FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
//                     
//                     INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID
//                     
//                     WHERE C.FUND_ID IN (1)
//                     
//                     AND E.PIN = @pin
//                     
//                     GROUP BY E.PIN, E.SURNAME, E.FIRSTNAME, E.OTHERNAMES,  C.FUND_ID
//                     
//                     HAVING sum(ISNULL(trans_UNITS_R,0) + ISNULL(TRANS_UNITS_V,0))  <> 0
//                     
//                     ORDER BY E.PIN 
//                          
//             `);
// 
//                 if (results.recordsets[0].length != 0) {
// 
//                     // normal contributions
// 
//                     const narates = await (await pool)
//                         .request()
//                         .input('pin', pin)
//                         .input('from', from)
//                         .input('to', to)
//                         .query(`
//     
//                 SELECT DISTINCT  
//                 CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
//                       CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
//                       FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
//                        B.NARRATION,
//                        CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
//               
//                                   , C.VALUE_DATE ,
//                                   SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
//     
//                                   FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
//                      
//                                   SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
//                                   
//     
//               
//               FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
//               INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
//                         WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
//                       
//                  
//               
//                     AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
//                    
//               
//                    AND C.VALUE_DATE BETWEEN @from AND @to
//                    --AND B.NARRATION NOT LIKE  '%INTEREST%'
//                    AND E.PIN IN (@pin)
//     
//               GROUP BY    
//               E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
//                            E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
//               
//               ORDER BY  C.VALUE_DATE ASC
//                 `);
// 
//                     const userData = await (await pool)
//                         .request()
//                         .input('pin', pin)
//                         .query(`
//                     SELECT PIN, FIRSTNAME, OTHERNAMES, SURNAME, MOBILE_PHONE                     
//                     FROM PFA.DBO.EMPLOYEES  WHERE PIN = @pin
// 
//                 `);
// 
//                     // Voluntry contributions
// 
//                     const vc = await pool
//                         .request()
//                         .input('pin', pin)
//                         .input('from', from)
//                         .input('to', to)
//                         .query(`
//     
//                 SELECT DISTINCT  
//                 CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
//                       CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
//                       FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
//                        B.NARRATION,
//                        CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
//               
//                                   , C.VALUE_DATE ,
//                                   SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
//     
//                                   FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
//                      
//                                   SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE], C.PRICE
//                                   
//     
//               
//               FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
//               INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
//                         WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
//                       
//                  
//               
//                     AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
//                    
//               
//                    AND C.VALUE_DATE BETWEEN @from AND @to
//                    --AND B.NARRATION NOT LIKE  '%INTEREST%'
//                    AND E.PIN IN (@pin)
//                    AND C.OTHER_CONTRIBUTION != 0
//     
//               GROUP BY    
//               E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
//                            E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
//               
//               ORDER BY  C.VALUE_DATE 
//                 `);
// 
//                     var employee = currencyFormatter.format(results.recordsets[0][0]['EMPLOYEE_CONTRIBUTION'], { code: '' })
//                     var employer = currencyFormatter.format(results.recordsets[0][0]['EMPLOYER_CONTRIBUTION'], { code: '' })
//                     var tnet = currencyFormatter.format(results.recordsets[0][0]['NET_CONTRIBUTION'], { code: '' })
// 
//                     var vGrowth = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_GROWTH'], { code: '' })
//                     var tGrowth = currencyFormatter.format(results.recordsets[0][0]['TOTAL_GROWTH'], { code: '' })
//                     var rGrowth = currencyFormatter.format(results.recordsets[0][0]['RSA_GROWTH'], { code: '' })
//                     var rawVat = Number(narates?.recordsets?.[0]?.[0]?.VAT_FEE || 0);
//                     var vat = currencyFormatter.format(rawVat, { code: '' });
//                     var fee = currencyFormatter.format(narates?.recordsets?.[0]?.[0]?.['ADMIN_FEE'] ?? 0, { code: '' });
//                     var balance = currencyFormatter.format(results.recordsets[0][0]['RSA_BALANCE'], { code: '' })
//                     var vbalance = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_BALANCE'], { code: '' })
//                     var tbalance = currencyFormatter.format(results.recordsets[0][0]['TOTAL_BALANCE'], { code: '' })
//                     var tcon = currencyFormatter.format(results.recordsets[0][0]['TOTAL_CONTRIBUTION'], { code: '' })
//                     var voluntry = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_CONTRIBUTION'], { code: '' })
//                     var rnet = currencyFormatter.format(results.recordsets[0][0]['RSA_NET_CONTRIBUTION'], { code: '' })
//                     var unit = currencyFormatter.format(results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
//                     var vunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'], { code: '' })
// 
//                     var prices = price
//                     var tunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'] + results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
// 
//                     var rsapin = userData.recordset[0]['PIN']
//                     var phone = userData.recordset[0]['MOBILE_PHONE']
//                     var name = userData.recordset[0]['FIRSTNAME'] + " " + userData.recordset[0]['OTHERNAMES'] + " " + userData.recordset[0]['SURNAME']
//                     var fname = userData.recordset[0]['FIRSTNAME'];
// 
//                     let htmlTemplate = fs.readFileSync("template.html", "utf8");
// 
//                     const fundType = 'NORRENBERGER RSA FUND 2';
// 
//                     const template = handlebars.compile(htmlTemplate);
// 
//                     const data = {
//                         data: narates.recordsets[0],
//                         vc: vc.recordsets[0],
//                         pin: pin,
//                         value: 0,
//                         balance,
//                         tcon,
//                         voluntry,
//                         rnet,
//                         unit,
//                         prices,
//                         fundType,
//                         phone,
//                         rsapin,
//                         name,
//                         employee,
//                         employer,
//                         vat,
//                         fee,
//                         tbalance,
//                         vunit,
//                         tunit,
//                         vbalance,
//                         today,
//                         start,
//                         end,
//                         tGrowth,
//                         vGrowth,
//                         rGrowth,
//                         tnet
//                     }
// 
//                     const finalHtml = template(data);
// 
//                     const pdfPath = path.join(__dirname, '../../statements', `${pin}_statement.pdf`);
// 
//                     await generatePDF(finalHtml, pdfPath);
//                     const mailOptions = {
//                         from: `Norrenberger Pensions <noreply-npl@norrenpensions.com>`,
//                         to: sendToEmail,
//                         subject: "E-Statement",
//                         html: `<b>Dear ${fname},</b><br>
//                                <p>Thank you for choosing Norrenberger Pensions Managers LTD.</p>
//                                <p>Kindly find attached e-statement.</p>`,
//                         attachments: [{ filename: `${pin}_statement.pdf`, path: pdfPath }]
//                     };
// 
//                     transporter.sendMail(mailOptions, (err, info) => {
//                         if (err) {
//                             console.log(err);
//                             Sentry.captureException(err);
//                         }
//                         if (fs.existsSync(pdfPath)) {
//                             try {
//                                 fs.unlinkSync(pdfPath); // Delete PDF after sending email
//                             } catch (e) {
//                                 console.error("Error deleting PDF file:", e);
//                             }
//                         }
//                     });
// 
//                     return res.json({ code: 200, data: results.recordsets[0] });
// 
//                 } else {
//                     console.log('Statement sending failed.');
//                     return res.json({ msg: 0 })
//                 }
// 
//             }
// 
// 
//             //FUND 3
//             if (fundid == "FUND3") {
// 
//                 const fundCode = await pool.request()
//                     .input('to', to)
//                     .query(`
//     
//              SELECT top (1)  SCHEME_ID AS FUND_ID,
//             'FUND_CODE' = CASE 
//                                  WHEN SCHEME_ID = 74 THEN 'FUND3'
//                                 
//                                  ELSE 'OTHERS'
//             
//                                  END,
//             
//             BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
//             
//             WHERE  SCHEME_ID IN (74)
//             
//             
//             ORDER BY VALUATION_DATE DESC
//             `)
// 
//                 if (fundCode.recordset.length == 0) {
// 
//                     const fundCode2 = await pool.request()
// 
//                         .query(`
// 
//                     SELECT top (1)  SCHEME_ID AS FUND_ID,
//                     'FUND_CODE' = CASE 
//                         WHEN SCHEME_ID = 74 THEN 'FUND3'
//                     
//                         ELSE 'OTHERS'
// 
//                         END,
// 
//                     BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
// 
//                     WHERE  SCHEME_ID IN (74)
// 
//                     ORDER BY VALUATION_DATE DESC`)
// 
//                     price = fundCode2.recordset[0]['BID_PRICE'];
// 
//                 } else {
//                     price = fundCode.recordset[0]['BID_PRICE']
//                 }
// 
//                 const results = await pool.request()
//                     .input('pin', pin)
//                     .input('from', from)
//                     .input('to', to)
//                     .input('price', price)
//                     .query(`SELECT 
// 
//                 E.PIN,E.SURNAME, E.FIRSTNAME, E.OTHERNAMES, 
//                 
//                 'FUND_CODE' = CASE 
//                 
//                              WHEN C.FUND_ID = 74 THEN 'FUND3'
//                              
//                              ELSE 'UNKNOWN'
//                 
//                              END,
//                          
//             'RSA_BALANCE' = CASE
//                 
//                             WHEN C.FUND_ID = 74 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
//                 
//                 
//                             END,  
//                             (CASE
//                 
//                             WHEN C.FUND_ID = 74 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
//                 
//                           
//                             END)-(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS [RSA_GROWTH],
//                             SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS [RSA_CUMULATIVE_UNITS],
//                           
//                                SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "RSA_NET_CONTRIBUTION",
//                 
//                             SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
//                 
//             'VOLUNTARY_BALANCE' = CASE
//                 
//                             WHEN C.FUND_ID = 74 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                 
//                             END,  
//                 
//                             (CASE
//                 
//                             WHEN C.FUND_ID = 74 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                 
//                            
//                 
//                             END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
//                 
//                             SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
//                 
//                             SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
//                 
//                         SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
//                             
//                             SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS "NET_CONTRIBUTION",
//                         
//             'TOTAL_BALANCE' = CASE
//                             WHEN C.FUND_ID = 74 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                 
//                             END,  
//                 
//                             (CASE
//                            WHEN C.FUND_ID = 74 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                 
//                            
//                 
//                             END)- (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH],
//                 
//                              SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
//                 
//                              ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2) AS "WITHDRAWAL",
//                 
//                              ROUND(SUM(ISNULL(C.WITHDRAWAL_VC, 0)), 2) AS "VC_WITHDRAWAL",
//                 
//                              SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN FEE]
//                 
//                 FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
//                 
//                 INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID
//                 
//                 WHERE C.FUND_ID IN (74)
//                 
//                 AND E.PIN = @pin
//                 
//                 GROUP BY E.PIN, E.SURNAME, E.FIRSTNAME, E.OTHERNAMES,  C.FUND_ID
//                 
//                 HAVING sum(ISNULL(trans_UNITS_R,0) + ISNULL(TRANS_UNITS_V,0))  <> 0
//                 
//                 ORDER BY E.PIN 
//                 
//                 
//         `);
// 
//                 if (results.recordsets[0].length != 0) {
// 
//                     const narates = await (await pool)
//                         .request()
//                         .input('pin', pin)
//                         .input('from', from)
//                         .input('to', to)
//                         .query(`
//     
//                 SELECT DISTINCT  
//                 CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
//                       CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
//                       FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
//                        B.NARRATION,
//                        CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
//               
//                                   , C.VALUE_DATE ,
//                                   SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
//     
//                                   FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
//                      
//                                   SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
//                                   
//     
//               
//               FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
//               INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
//                         WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
//                       
//                  
//               
//                     AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
//                    
//               
//                    AND C.VALUE_DATE BETWEEN @from AND @to
//                    --AND B.NARRATION NOT LIKE  '%INTEREST%'
//                    AND E.PIN IN (@pin)
//     
//               GROUP BY    
//               E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
//                            E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
//               
//               ORDER BY  C.VALUE_DATE ASC
//                 `);
// 
//                     const userData = await (await pool)
//                         .request()
//                         .input('pin', pin)
//                         .query(`
//                     SELECT PIN, FIRSTNAME, OTHERNAMES, SURNAME, MOBILE_PHONE                     
//                     FROM PFA.DBO.EMPLOYEES  WHERE PIN = @pin
// 
//         `);
// 
//                     // Voluntry contributions
// 
//                     const vc = await pool
//                         .request()
//                         .input('pin', pin)
//                         .input('from', from)
//                         .input('to', to)
//                         .query(`
//     
//                 SELECT DISTINCT  
//                 CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
//                       CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
//                       FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
//                        B.NARRATION,
//                        CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
//               
//                                   , C.VALUE_DATE ,
//                                   SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
//     
//                                   FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
//                      
//                                   SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
//                                   
//     
//               
//               FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
//               INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
//                         WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
//                       
//                  
//               
//                     AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
//                    
//               
//                    AND C.VALUE_DATE BETWEEN @from AND @to
//                    --AND B.NARRATION NOT LIKE  '%INTEREST%'
//                    AND E.PIN IN (@pin)
//                    AND C.OTHER_CONTRIBUTION != 0
//     
//               GROUP BY    
//               E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
//                            E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
//               
//               ORDER BY  C.VALUE_DATE ASC
//                 `);
// 
//                     var employee = currencyFormatter.format(results.recordsets[0][0]['EMPLOYEE_CONTRIBUTION'], { code: '' })
//                     var employer = currencyFormatter.format(results.recordsets[0][0]['EMPLOYER_CONTRIBUTION'], { code: '' })
//                     var tnet = currencyFormatter.format(results.recordsets[0][0]['NET_CONTRIBUTION'], { code: '' })
// 
//                     var vGrowth = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_GROWTH'], { code: '' })
//                     var tGrowth = currencyFormatter.format(results.recordsets[0][0]['TOTAL_GROWTH'], { code: '' })
//                     var rGrowth = currencyFormatter.format(results.recordsets[0][0]['RSA_GROWTH'], { code: '' })
//                     var vat = currencyFormatter.format(narates?.recordsets?.[0]?.[0]?.['VAT_FEE'] ?? 0, { code: '' })
//                     var fee = currencyFormatter.format(narates?.recordsets?.[0]?.[0]?.['ADMIN_FEE'] ?? 0, { code: '' })
//                     var balance = currencyFormatter.format(results.recordsets[0][0]['RSA_BALANCE'], { code: '' })
//                     var vbalance = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_BALANCE'], { code: '' })
//                     var tbalance = currencyFormatter.format(results.recordsets[0][0]['TOTAL_BALANCE'], { code: '' })
//                     var tcon = currencyFormatter.format(results.recordsets[0][0]['TOTAL_CONTRIBUTION'], { code: '' })
//                     var voluntry = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_CONTRIBUTION'], { code: '' })
//                     var rnet = currencyFormatter.format(results.recordsets[0][0]['RSA_NET_CONTRIBUTION'], { code: '' })
//                     var unit = currencyFormatter.format(results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
//                     var vunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'], { code: '' })
// 
//                     var prices = price
//                     var tunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'] + results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
// 
//                     var rsapin = userData.recordset[0]['PIN']
//                     var phone = userData.recordset[0]['MOBILE_PHONE']
//                     var name = userData.recordset[0]['FIRSTNAME'] + " " + userData.recordset[0]['OTHERNAMES'] + " " + userData.recordset[0]['SURNAME']
//                     var fname = userData.recordset[0]['FIRSTNAME'];
// 
//                     let htmlTemplate = fs.readFileSync("template.html", "utf8");
// 
//                     const fundType = 'NORRENBERGER RSA FUND 3';
// 
//                     const template = handlebars.compile(htmlTemplate);
// 
//                     const data = {
//                         data: narates.recordsets[0],
//                         vc: vc.recordsets[0],
//                         pin: pin,
//                         value: 0,
//                         balance,
//                         tcon,
//                         voluntry,
//                         rnet,
//                         unit,
//                         prices,
//                         fundType,
//                         phone,
//                         rsapin,
//                         name,
//                         employee,
//                         employer,
//                         vat,
//                         fee,
//                         tbalance,
//                         vunit,
//                         tunit,
//                         vbalance,
//                         today,
//                         start,
//                         end,
//                         tGrowth,
//                         vGrowth,
//                         rGrowth,
//                         tnet
//                     }
// 
//                     const finalHtml = template(data);
// 
//                     const pdfPath = path.join(__dirname, '../../statements', `${pin}_statement.pdf`);
// 
//                     await generatePDF(finalHtml, pdfPath);
// 
//                     const mailOptions = {
//                         from: `Norrenberger Pensions <noreply-npl@norrenpensions.com>`,
//                         to: sendToEmail,
//                         subject: "E-Statement",
//                         html: `<b>Dear ${fname},</b><br>
//                            <p>Thank you for choosing Norrenberger Pensions Managers LTD.</p>
//                            <p>Kindly find attached e-statement.</p>`,
//                         attachments: [{ filename: `${pin}_statement.pdf`, path: pdfPath }]
//                     };
// 
//                     transporter.sendMail(mailOptions, (err, info) => {
//                         if (err) {
//                             console.log(err);
//                             Sentry.captureException(err);
//                         }
//                         if (fs.existsSync(pdfPath)) {
//                             try {
//                                 fs.unlinkSync(pdfPath); // Delete PDF after sending email
//                             } catch (e) {
//                                 console.error("Error deleting PDF file:", e);
//                             }
//                         }
//                     });
// 
//                     return res.json({ code: 200, data: results.recordsets[0] });
// 
//                 } else {
//                     console.log('Statement sending failed.');
//                     return res.json({ msg: 0 })
//                 }
// 
//             }
// 
//             // FUND 4
// 
//             if (fundid == "FUND4") {
// 
//                 const fundCode = await pool.request()
//                     .input('to', to)
//                     .query(`
//                             SELECT top (1)  SCHEME_ID AS FUND_ID,
//                             'FUND_CODE' = CASE 
//                                  WHEN SCHEME_ID = 12 THEN 'FUND4'
//                                 
//                                  ELSE 'OTHERS'
//             
//                                  END,
//             
//                             BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
//             
//                             WHERE  SCHEME_ID IN (12)
//            
//             
//                             ORDER BY VALUATION_DATE DESC
//             `)
// 
//                 if (fundCode.recordset.length == 0) {
// 
// 
// 
//                     const fundCode2 = await pool.request()
// 
//                         .query(`
//                         SELECT top (1)  SCHEME_ID AS FUND_ID,
//                         'FUND_CODE' = CASE 
//                             WHEN SCHEME_ID = 12 THEN 'FUND4'
//                         
//                             ELSE 'OTHERS'
//     
//                             END,
//     
//                         BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
//     
//                         WHERE  SCHEME_ID IN (12)
//     
//                         ORDER BY VALUATION_DATE DESC`)
// 
// 
// 
//                     price = fundCode2.recordset[0]['BID_PRICE']
// 
// 
//                 } else {
//                     price = fundCode.recordset[0]['BID_PRICE']
//                 }
// 
// 
//                 const results = await pool.request()
//                     .input('pin', pin)
//                     .input('from', from)
//                     .input('to', to)
//                     .input('price', price)
//                     .query(`SELECT 
//     
//                     E.PIN,E.SURNAME, E.FIRSTNAME, E.OTHERNAMES, 
//                     
//                     'FUND_CODE' = CASE 
//                     
//                                  WHEN C.FUND_ID = 12 THEN 'FUND4'
//                                  
//                                  ELSE 'UNKNOWN'
//                     
//                                  END,
//                              
//                 'RSA_BALANCE' = CASE
//                     
//                                 WHEN C.FUND_ID = 12 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
//                     
//                     
//                                 END,  
//                                 (CASE
//                     
//                                 WHEN C.FUND_ID = 12 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
//                     
//                               
//                                 END)-(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS [RSA_GROWTH],
//                                 SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS [RSA_CUMULATIVE_UNITS],
//                               
//                                    SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "RSA_NET_CONTRIBUTION",
//                     
//                                 SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
//                     
//                 'VOLUNTARY_BALANCE' = CASE
//                     
//                                 WHEN C.FUND_ID = 12 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                 END,  
//                     
//                                 (CASE
//                     
//                                 WHEN C.FUND_ID = 12 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                
//                     
//                                 END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
//                     
//                                 SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
//                     
//                                 SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
//                     
//                             SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
//                                 
//                                 SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS "NET_CONTRIBUTION",
//                             
//                 'TOTAL_BALANCE' = CASE
//                                 WHEN C.FUND_ID = 12 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                 END,  
//                     
//                                 (CASE
//                                WHEN C.FUND_ID = 12 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                
//                     
//                                 END)- (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH],
//                     
//                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
//                     
//                                  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2) AS "WITHDRAWAL",
//                     
//                                  ROUND(SUM(ISNULL(C.WITHDRAWAL_VC, 0)), 2) AS "VC_WITHDRAWAL",
//                     
//                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN FEE]
//                     
//                     FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
//                     
//                     INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID
//                     
//                     WHERE C.FUND_ID IN (12)
//                     
//                     AND E.PIN = @pin
//                     
//                     GROUP BY E.PIN, E.SURNAME, E.FIRSTNAME, E.OTHERNAMES,  C.FUND_ID
//                     
//                     HAVING sum(ISNULL(trans_UNITS_R,0) + ISNULL(TRANS_UNITS_V,0))  <> 0
//                     
//                     ORDER BY E.PIN 
//                     
//                     
//             `);
// 
//                 if (results.recordsets[0].length != 0) {
// 
//                     const narates = await (await pool)
//                         .request()
//                         .input('pin', pin)
//                         .input('from', from)
//                         .input('to', to)
//                         .query(`
//     
//                 SELECT DISTINCT  
//                 CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
//                       CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
//                       FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
//                        B.NARRATION,
//                        CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
//               
//                                   , C.VALUE_DATE ,
//                                   SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
//     
//                                   FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
//                      
//                                   SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
//                                   
//     
//               
//               FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
//               INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
//                         WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
//                       
//                  
//               
//                     AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
//                    
//               
//                    AND C.VALUE_DATE BETWEEN @from AND @to
//                    --AND B.NARRATION NOT LIKE  '%INTEREST%'
//                    AND E.PIN IN (@pin)
//     
//               GROUP BY    
//               E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
//                            E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
//               
//               ORDER BY  C.VALUE_DATE ASC
//                 `);
// 
//                     const userData = await (await pool)
//                         .request()
//                         .input('pin', pin)
//                         .query(`
//                 SELECT PIN, FIRSTNAME, OTHERNAMES, SURNAME, MOBILE_PHONE                     
//                 FROM PFA.DBO.EMPLOYEES  WHERE PIN = @pin
//     
//                 `);
// 
//                     // Voluntry contributions
// 
//                     const vc = await pool
//                         .request()
//                         .input('pin', pin)
//                         .input('from', from)
//                         .input('to', to)
//                         .query(`
//     
//                 SELECT DISTINCT  
//                 CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
//                       CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
//                       FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
//                        B.NARRATION,
//                        CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
//               
//                                   , C.VALUE_DATE ,
//                                   SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
//     
//                                   FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
//                      
//                                   SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
//                                   
//     
//               
//               FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
//               INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
//                         WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
//                       
//                  
//               
//                     AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
//                    
//               
//                    AND C.VALUE_DATE BETWEEN @from AND @to
//                    --AND B.NARRATION NOT LIKE  '%INTEREST%'
//                    AND E.PIN IN (@pin)
//                    AND C.OTHER_CONTRIBUTION != 0
//     
//               GROUP BY    
//               E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
//                            E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
//               
//               ORDER BY  C.VALUE_DATE ASC
//                 `);
// 
//                     var employee = currencyFormatter.format(results.recordsets[0][0]['EMPLOYEE_CONTRIBUTION'], { code: '' })
//                     var employer = currencyFormatter.format(results.recordsets[0][0]['EMPLOYER_CONTRIBUTION'], { code: '' })
//                     var tnet = currencyFormatter.format(results.recordsets[0][0]['NET_CONTRIBUTION'], { code: '' })
// 
//                     var vGrowth = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_GROWTH'], { code: '' })
//                     var tGrowth = currencyFormatter.format(results.recordsets[0][0]['TOTAL_GROWTH'], { code: '' })
//                     var rGrowth = currencyFormatter.format(results.recordsets[0][0]['RSA_GROWTH'], { code: '' })
//                     var vat = currencyFormatter.format(narates?.recordsets?.[0]?.[0]?.['VAT_FEE'] ?? 0, { code: '' })
//                     var fee = currencyFormatter.format(narates?.recordsets?.[0]?.[0]?.['ADMIN_FEE'] ?? 0, { code: '' })
//                     var balance = currencyFormatter.format(results.recordsets[0][0]['RSA_BALANCE'], { code: '' })
//                     var vbalance = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_BALANCE'], { code: '' })
//                     var tbalance = currencyFormatter.format(results.recordsets[0][0]['TOTAL_BALANCE'], { code: '' })
//                     var tcon = currencyFormatter.format(results.recordsets[0][0]['TOTAL_CONTRIBUTION'], { code: '' })
//                     var voluntry = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_CONTRIBUTION'], { code: '' })
//                     var rnet = currencyFormatter.format(results.recordsets[0][0]['RSA_NET_CONTRIBUTION'], { code: '' })
//                     var unit = currencyFormatter.format(results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
//                     var vunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'], { code: '' })
// 
//                     var prices = price
//                     var tunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'] + results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
// 
//                     var rsapin = userData.recordset[0]['PIN']
//                     var phone = userData.recordset[0]['MOBILE_PHONE']
//                     var name = userData.recordset[0]['FIRSTNAME'] + " " + userData.recordset[0]['OTHERNAMES'] + " " + userData.recordset[0]['SURNAME']
//                     var fname = userData.recordset[0]['FIRSTNAME'];
// 
//                     let htmlTemplate = fs.readFileSync("template.html", "utf8");
// 
//                     const fundType = 'NORRENBERGER RSA FUND 4';
// 
//                     const template = handlebars.compile(htmlTemplate);
// 
//                     const data = {
//                         data: narates.recordsets[0],
//                         vc: vc.recordsets[0],
//                         pin: pin,
//                         value: 0,
//                         balance,
//                         tcon,
//                         voluntry,
//                         rnet,
//                         unit,
//                         prices,
//                         fundType,
//                         phone,
//                         rsapin,
//                         name,
//                         employee,
//                         employer,
//                         vat,
//                         fee,
//                         tbalance,
//                         vunit,
//                         tunit,
//                         vbalance,
//                         today,
//                         start,
//                         end,
//                         tGrowth,
//                         vGrowth,
//                         rGrowth,
//                         tnet
//                     }
// 
//                     const finalHtml = template(data);
// 
//                     const pdfPath = path.join(__dirname, '../../statements', `${pin}_statement.pdf`);
// 
//                     await generatePDF(finalHtml, pdfPath);
// 
//                     const mailOptions = {
//                         from: `Norrenberger Pensions <noreply-npl@norrenpensions.com>`,
//                         to: sendToEmail,
//                         subject: "E-Statement",
//                         html: `<b>Dear ${fname},</b><br>
//                            <p>Thank you for choosing Norrenberger Pensions Managers LTD.</p>
//                            <p>Kindly find attached e-statement.</p>`,
//                         attachments: [{ filename: `${pin}_statement.pdf`, path: pdfPath }]
//                     };
// 
//                     transporter.sendMail(mailOptions, (err, info) => {
//                         if (err) {
//                             console.log(err);
//                             Sentry.captureException(err);
//                         }
//                         if (fs.existsSync(pdfPath)) {
//                             try {
//                                 fs.unlinkSync(pdfPath); // Delete PDF after sending email
//                             } catch (e) {
//                                 console.error("Error deleting PDF file:", e);
//                             }
//                         }
//                     });
// 
//                     return res.json({ code: 200, data: results.recordsets[0] });
// 
//                 } else {
//                     console.log('Statement sending failed.');
//                     return res.json({ msg: 0 })
//                 }
// 
//             }
// 
//             //FUND 5
//             if (fundid == "FUND5") {
// 
//                 const fundCode = await pool.request()
//                     .input('to', to)
//                     .query(`
//     
//             SELECT top (1)  SCHEME_ID AS FUND_ID,
//             'FUND_CODE' = CASE 
//                                  WHEN SCHEME_ID = 79 THEN 'FUND5'
//                                 
//                                  ELSE 'OTHERS'
//             
//                                  END,
//             
//             BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
//             
//             WHERE  SCHEME_ID IN (79)
//            
//             
//             ORDER BY VALUATION_DATE DESC
//             `)
// 
//                 if (fundCode.recordset.length == 0) {
// 
// 
// 
//                     const fundCode2 = await pool.request()
// 
//                         .query(`
//                             SELECT top (1)  SCHEME_ID AS FUND_ID,
//                             'FUND_CODE' = CASE 
//                                 WHEN SCHEME_ID = 79 THEN 'FUND5'
//                         
//                                 ELSE 'OTHERS'
//     
//                                 END,
//     
//                             BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
//     
//                             WHERE  SCHEME_ID IN (79)
//     
//                             ORDER BY VALUATION_DATE DESC`)
// 
// 
// 
//                     price = fundCode2.recordset[0]['BID_PRICE']
// 
// 
//                 } else {
//                     price = fundCode.recordset[0]['BID_PRICE']
//                 }
// 
//                 const results = await pool.request()
//                     .input('pin', pin)
//                     .input('from', from)
//                     .input('to', to)
//                     .input('price', price)
//                     .query(`SELECT 
//     
//                     E.PIN,E.SURNAME, E.FIRSTNAME, E.OTHERNAMES, 
//                     
//                     'FUND_CODE' = CASE 
//                     
//                                  WHEN C.FUND_ID = 79 THEN 'FUND5'
//                                  
//                                  ELSE 'UNKNOWN'
//                     
//                                  END,
//                              
//                 'RSA_BALANCE' = CASE
//                     
//                                 WHEN C.FUND_ID = 79 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
//                     
//                     
//                                 END,  
//                                 (CASE
//                     
//                                 WHEN C.FUND_ID = 79 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
//                     
//                               
//                                 END)-(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS [RSA_GROWTH],
//                                 SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS [RSA_CUMULATIVE_UNITS],
//                               
//                                    SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "RSA_NET_CONTRIBUTION",
//                     
//                                 SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
//                     
//                 'VOLUNTARY_BALANCE' = CASE
//                     
//                                 WHEN C.FUND_ID = 79 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                 END,  
//                     
//                                 (CASE
//                     
//                                 WHEN C.FUND_ID = 79 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                
//                     
//                                 END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
//                     
//                                 SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
//                     
//                                 SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
//                     
//                             SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
//                                 
//                                 SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS "NET_CONTRIBUTION",
//                             
//                 'TOTAL_BALANCE' = CASE
//                                 WHEN C.FUND_ID = 79 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                 END,  
//                     
//                                 (CASE
//                                WHEN C.FUND_ID = 79 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                
//                     
//                                 END)- (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH],
//                     
//                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
//                     
//                                  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2) AS "WITHDRAWAL",
//                     
//                                  ROUND(SUM(ISNULL(C.WITHDRAWAL_VC, 0)), 2) AS "VC_WITHDRAWAL",
//                     
//                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN FEE]
//                     
//                     FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
//                     
//                     INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID
//                     
//                     WHERE C.FUND_ID IN (79)
//                     
//                     AND E.PIN = @pin
//                     
//                     GROUP BY E.PIN, E.SURNAME, E.FIRSTNAME, E.OTHERNAMES,  C.FUND_ID
//                     
//                     HAVING sum(ISNULL(trans_UNITS_R,0) + ISNULL(TRANS_UNITS_V,0))  <> 0
//                     
//                     ORDER BY E.PIN 
//                     
//                     
//             `);
// 
//                 if (results.recordsets[0].length != 0) {
// 
//                     const narates = await (await pool)
//                         .request()
//                         .input('pin', pin)
//                         .input('from', from)
//                         .input('to', to)
//                         .query(`
//     
//                 SELECT DISTINCT  
//                 CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
//                       CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
//                       FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
//                        B.NARRATION,
//                        CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
//               
//                                   , C.VALUE_DATE ,
//                                   SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
//     
//                                   FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
//                      
//                                   SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
//                                   
//     
//               
//               FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
//               INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
//                         WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
//                       
//                  
//               
//                     AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
//                    
//               
//                    AND C.VALUE_DATE BETWEEN @from AND @to
//                    --AND B.NARRATION NOT LIKE  '%INTEREST%'
//                    AND E.PIN IN (@pin)
//     
//               GROUP BY    
//               E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
//                            E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
//               
//               ORDER BY  C.VALUE_DATE ASC
//                 `);
// 
//                     const userData = await (await pool)
//                         .request()
//                         .input('pin', pin)
//                         .query(`
//                 SELECT PIN, FIRSTNAME, OTHERNAMES, SURNAME, MOBILE_PHONE                     
//                 FROM PFA.DBO.EMPLOYEES  WHERE PIN = @pin
//     
//                 `);
// 
//                     // Voluntry contributions
// 
//                     const vc = await pool
//                         .request()
//                         .input('pin', pin)
//                         .input('from', from)
//                         .input('to', to)
//                         .query(`
// 
//         SELECT DISTINCT  
//         CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
//               CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
//               FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
//               FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
//               FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
//               FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
//               FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
//               FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
//               FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
//                B.NARRATION,
//                CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
//       
//                           , C.VALUE_DATE ,
//                           SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
// 
//                           FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
//              
//                           SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
//       
//                 FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
//                 INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
//                             WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
//               
//          
//       
//                         AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
//            
//       
//                     AND C.VALUE_DATE BETWEEN @from AND @to
//                     --AND B.NARRATION NOT LIKE  '%INTEREST%'
//                     AND E.PIN IN (@pin)
//                     AND C.OTHER_CONTRIBUTION != 0
// 
//                 GROUP BY    
//                 E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
//                             E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
//       
//                 ORDER BY  C.VALUE_DATE ASC
//                     `);
// 
//                     var employee = currencyFormatter.format(results.recordsets[0][0]['EMPLOYEE_CONTRIBUTION'], { code: '' })
//                     var employer = currencyFormatter.format(results.recordsets[0][0]['EMPLOYER_CONTRIBUTION'], { code: '' })
//                     var tnet = currencyFormatter.format(results.recordsets[0][0]['NET_CONTRIBUTION'], { code: '' })
// 
//                     var vGrowth = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_GROWTH'], { code: '' })
//                     var tGrowth = currencyFormatter.format(results.recordsets[0][0]['TOTAL_GROWTH'], { code: '' })
//                     var rGrowth = currencyFormatter.format(results.recordsets[0][0]['RSA_GROWTH'], { code: '' })
//                     var vat = currencyFormatter.format(narates?.recordsets?.[0]?.[0]?.['VAT_FEE'] ?? 0, { code: '' })
//                     var fee = currencyFormatter.format(narates?.recordsets?.[0]?.[0]?.['ADMIN_FEE'] ?? 0, { code: '' })
//                     var balance = currencyFormatter.format(results.recordsets[0][0]['RSA_BALANCE'], { code: '' })
//                     var vbalance = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_BALANCE'], { code: '' })
//                     var tbalance = currencyFormatter.format(results.recordsets[0][0]['TOTAL_BALANCE'], { code: '' })
//                     var tcon = currencyFormatter.format(results.recordsets[0][0]['TOTAL_CONTRIBUTION'], { code: '' })
//                     var voluntry = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_CONTRIBUTION'], { code: '' })
//                     var rnet = currencyFormatter.format(results.recordsets[0][0]['RSA_NET_CONTRIBUTION'], { code: '' })
//                     var unit = currencyFormatter.format(results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
//                     var vunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'], { code: '' })
// 
//                     var prices = price
//                     var tunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'] + results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
// 
//                     var rsapin = userData.recordset[0]['PIN']
//                     var phone = userData.recordset[0]['MOBILE_PHONE']
//                     var name = userData.recordset[0]['FIRSTNAME'] + " " + userData.recordset[0]['OTHERNAMES'] + " " + userData.recordset[0]['SURNAME']
//                     var fname = userData.recordset[0]['FIRSTNAME'];
// 
//                     let htmlTemplate = fs.readFileSync("template.html", "utf8");
// 
//                     const fundType = 'NORRENBERGER RSA FUND 5';
// 
//                     const template = handlebars.compile(htmlTemplate);
// 
//                     const data = {
//                         data: narates.recordsets[0],
//                         vc: vc.recordsets[0],
//                         pin: pin,
//                         value: 0,
//                         balance,
//                         tcon,
//                         voluntry,
//                         rnet,
//                         unit,
//                         prices,
//                         fundType,
//                         phone,
//                         rsapin,
//                         name,
//                         employee,
//                         employer,
//                         vat,
//                         fee,
//                         tbalance,
//                         vunit,
//                         tunit,
//                         vbalance,
//                         today,
//                         start,
//                         end,
//                         tGrowth,
//                         vGrowth,
//                         rGrowth,
//                         tnet
//                     }
// 
//                     const finalHtml = template(data);
// 
//                     const pdfPath = path.join(__dirname, '../../statements', `${pin}_statement.pdf`);
// 
//                     await generatePDF(finalHtml, pdfPath);
// 
//                     const mailOptions = {
//                         from: `Norrenberger Pensions <noreply-npl@norrenpensions.com>`,
//                         to: sendToEmail,
//                         subject: "E-Statement",
//                         html: `<b>Dear ${fname},</b><br>
//                                <p>Thank you for choosing Norrenberger Pensions Managers LTD.</p>
//                                <p>Kindly find attached e-statement.</p>`,
//                         attachments: [{ filename: `${pin}_statement.pdf`, path: pdfPath }]
//                     };
// 
//                     transporter.sendMail(mailOptions, (err, info) => {
//                         if (err) {
//                             console.log(err);
//                             Sentry.captureException(err);
//                         }
//                         if (fs.existsSync(pdfPath)) {
//                             try {
//                                 fs.unlinkSync(pdfPath); // Delete PDF after sending email
//                             } catch (e) {
//                                 console.error("Error deleting PDF file:", e);
//                             }
//                         }
//                     });
// 
//                     return res.json({ code: 200, data: results.recordsets[0] });
// 
//                 } else {
//                     console.log('Statement sending failed.');
//                     return res.json({ msg: 0 })
//                 }
// 
//             }
// 
//             //FUND 6
// 
//             if (fundid == "FUND6 ACTIVE") {
// 
//                 const fundCode = await pool.request()
//                     .input('to', to)
//                     .query(`
//                     SELECT top (1)  SCHEME_ID AS FUND_ID,
//                     'FUND_CODE' = CASE 
//                          WHEN SCHEME_ID = 84 THEN 'FUND6 ACTIVE'
//                         
//                          ELSE 'OTHERS'
//     
//                          END,
//     
//                     BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
//     
//                     WHERE  SCHEME_ID IN (84)
//     
//                     ORDER BY VALUATION_DATE DESC
//                     `)
// 
//                 if (fundCode.recordset.length == 0) {
// 
// 
// 
//                     const fundCode2 = await pool.request()
// 
//                         .query(`
//         
//             SELECT top (1)  SCHEME_ID AS FUND_ID,
//             'FUND_CODE' = CASE 
//                                  WHEN SCHEME_ID = 84 THEN 'FUND1'
//                                 
//                                  ELSE 'OTHERS'
//             
//                                  END,
//             
//             BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
//             
//             WHERE  SCHEME_ID IN (84)
//             
//             ORDER BY VALUATION_DATE DESC`)
// 
// 
// 
//                     price = fundCode2.recordset[0]['BID_PRICE']
// 
// 
//                 } else {
//                     price = fundCode.recordset[0]['BID_PRICE']
//                 }
// 
//                 const results = await pool.request()
//                     .input('pin', pin)
//                     .input('from', from)
//                     .input('to', to)
//                     .input('price', price)
//                     .query(`SELECT 
//     
//                     E.PIN,E.SURNAME, E.FIRSTNAME, E.OTHERNAMES, 
//                     
//                     'FUND_CODE' = CASE 
//                     
//                                  WHEN C.FUND_ID = 84 THEN 'FUND2'
//                                  
//                                  ELSE 'UNKNOWN'
//                     
//                                  END,
//                              
//                 'RSA_BALANCE' = CASE
//                     
//                                 WHEN C.FUND_ID = 84 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
//                     
//                     
//                                 END,  
//                                 (CASE
//                     
//                                 WHEN C.FUND_ID = 84 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
//                     
//                               
//                                 END)-(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS [RSA_GROWTH],
//                                 SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS [RSA_CUMULATIVE_UNITS],
//                               
//                                    SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "RSA_NET_CONTRIBUTION",
//                     
//                                 SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
//                     
//                 'VOLUNTARY_BALANCE' = CASE
//                     
//                                 WHEN C.FUND_ID = 84 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                 END,  
//                     
//                                 (CASE
//                     
//                                 WHEN C.FUND_ID = 84 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                
//                     
//                                 END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
//                     
//                                 SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
//                     
//                                 SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
//                     
//                             SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
//                                 
//                                 SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS "NET_CONTRIBUTION",
//                             
//                 'TOTAL_BALANCE' = CASE
//                                 WHEN C.FUND_ID = 84 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                 END,  
//                     
//                                 (CASE
//                                WHEN C.FUND_ID = 84 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
//                     
//                                
//                     
//                                 END)- (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH],
//                     
//                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
//                     
//                                  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2) AS "WITHDRAWAL",
//                     
//                                  ROUND(SUM(ISNULL(C.WITHDRAWAL_VC, 0)), 2) AS "VC_WITHDRAWAL",
//                     
//                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN FEE]
//                     
//                     FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
//                     
//                     INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID
//                     
//                     WHERE C.FUND_ID IN (84)
//                     
//                     AND E.PIN = @pin
//                     
//                     GROUP BY E.PIN, E.SURNAME, E.FIRSTNAME, E.OTHERNAMES,  C.FUND_ID
//                     
//                     HAVING sum(ISNULL(trans_UNITS_R,0) + ISNULL(TRANS_UNITS_V,0))  <> 0
//                     
//                     ORDER BY E.PIN 
// 
//             
//             `);
// 
//                 if (results.recordsets[0].length != 0) {
// 
//                     const narates = await (await pool)
//                         .request()
//                         .input('pin', pin)
//                         .input('from', from)
//                         .input('to', to)
//                         .query(`
//     
//                 SELECT DISTINCT  
//                 CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
//                       CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
//                       FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
//                        B.NARRATION,
//                        CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
//               
//                                   , C.VALUE_DATE ,
//                                   SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
//     
//                                   FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
//                      
//                                   SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
//                                   
//     
//               
//               FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
//               INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
//                         WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
//                       
//                  
//               
//                     AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
//                    
//               
//                    AND C.VALUE_DATE BETWEEN @from AND @to
//                    --AND B.NARRATION NOT LIKE  '%INTEREST%'
//                    AND E.PIN IN (@pin)
//     
//               GROUP BY    
//               E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
//                            E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
//               
//               ORDER BY  C.VALUE_DATE ASC
//                 `);
// 
//                     const userData = await (await pool)
//                         .request()
//                         .input('pin', pin)
//                         .query(`
//                 SELECT PIN, FIRSTNAME, OTHERNAMES, SURNAME, MOBILE_PHONE                     
//                 FROM PFA.DBO.EMPLOYEES  WHERE PIN = @pin
//     
//                 `);
// 
//                     // Voluntry contributions
// 
//                     const vc = await pool
//                         .request()
//                         .input('pin', pin)
//                         .input('from', from)
//                         .input('to', to)
//                         .query(`
//     
//                 SELECT DISTINCT  
//                 CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
//                       CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
//                       FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
//                       FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
//                       FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
//                       FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
//                        B.NARRATION,
//                        CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
//               
//                                   , C.VALUE_DATE ,
//                                   SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
//     
//                                   FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
//                      
//                                   SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
//                                   
//     
//               
//               FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
//               INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
//                         WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
//                       
//                  
//               
//                     AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
//                    
//               
//                    AND C.VALUE_DATE BETWEEN @from AND @to
//                    --AND B.NARRATION NOT LIKE  '%INTEREST%'
//                    AND E.PIN IN (@pin)
//                    AND C.OTHER_CONTRIBUTION != 0
//     
//               GROUP BY    
//               E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
//                            E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
//               
//               ORDER BY  C.VALUE_DATE ASC
//                 `);
// 
//                     var employee = currencyFormatter.format(results.recordsets[0][0]['EMPLOYEE_CONTRIBUTION'], { code: '' })
//                     var employer = currencyFormatter.format(results.recordsets[0][0]['EMPLOYER_CONTRIBUTION'], { code: '' })
//                     var tnet = currencyFormatter.format(results.recordsets[0][0]['NET_CONTRIBUTION'], { code: '' })
// 
//                     var vGrowth = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_GROWTH'], { code: '' })
//                     var tGrowth = currencyFormatter.format(results.recordsets[0][0]['TOTAL_GROWTH'], { code: '' })
//                     var rGrowth = currencyFormatter.format(results.recordsets[0][0]['RSA_GROWTH'], { code: '' })
//                     var vat = currencyFormatter.format(narates?.recordsets?.[0]?.[0]?.['VAT_FEE'] ?? 0, { code: '' })
//                     var fee = currencyFormatter.format(narates?.recordsets?.[0]?.[0]?.['ADMIN_FEE'] ?? 0, { code: '' })
//                     var balance = currencyFormatter.format(results.recordsets[0][0]['RSA_BALANCE'], { code: '' })
//                     var vbalance = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_BALANCE'], { code: '' })
//                     var tbalance = currencyFormatter.format(results.recordsets[0][0]['TOTAL_BALANCE'], { code: '' })
//                     var tcon = currencyFormatter.format(results.recordsets[0][0]['TOTAL_CONTRIBUTION'], { code: '' })
//                     var voluntry = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_CONTRIBUTION'], { code: '' })
//                     var rnet = currencyFormatter.format(results.recordsets[0][0]['RSA_NET_CONTRIBUTION'], { code: '' })
//                     var unit = currencyFormatter.format(results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
//                     var vunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'], { code: '' })
// 
//                     var prices = price
//                     var tunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'] + results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
// 
//                     var rsapin = userData.recordset[0]['PIN']
//                     var phone = userData.recordset[0]['MOBILE_PHONE']
//                     var name = userData.recordset[0]['FIRSTNAME'] + " " + userData.recordset[0]['OTHERNAMES'] + " " + userData.recordset[0]['SURNAME']
//                     var fname = userData.recordset[0]['FIRSTNAME'];
// 
//                     let htmlTemplate = fs.readFileSync("template.html", "utf8");
// 
//                     const fundType = 'NORRENBERGER RSA FUND 6';
// 
//                     const template = handlebars.compile(htmlTemplate);
// 
//                     const data = {
//                         data: narates.recordsets[0],
//                         vc: vc.recordsets[0],
//                         pin: pin,
//                         value: 0,
//                         balance,
//                         tcon,
//                         voluntry,
//                         rnet,
//                         unit,
//                         prices,
//                         fundType,
//                         phone,
//                         rsapin,
//                         name,
//                         employee,
//                         employer,
//                         vat,
//                         fee,
//                         tbalance,
//                         vunit,
//                         tunit,
//                         vbalance,
//                         today,
//                         start,
//                         end,
//                         tGrowth,
//                         vGrowth,
//                         rGrowth,
//                         tnet
//                     }
// 
//                     const finalHtml = template(data);
// 
//                     const pdfPath = path.join(__dirname, '../../statements', `${pin}_statement.pdf`);
// 
//                     await generatePDF(finalHtml, pdfPath);
// 
//                     const mailOptions = {
//                         from: `Norrenberger Pensions <noreply-npl@norrenpensions.com>`,
//                         to: sendToEmail,
//                         subject: "E-Statement",
//                         html: `<b>Dear ${fname},</b><br>
//                            <p>Thank you for choosing Norrenberger Pensions Managers LTD.</p>
//                            <p>Kindly find attached e-statement.</p>`,
//                         attachments: [{ filename: `${pin}_statement.pdf`, path: pdfPath }]
//                     };
// 
//                     transporter.sendMail(mailOptions, (err, info) => {
//                         if (err) {
//                             console.log(err);
//                             Sentry.captureException(err);
//                         }
//                         if (fs.existsSync(pdfPath)) {
//                             try {
//                                 fs.unlinkSync(pdfPath); // Delete PDF after sending email
//                             } catch (e) {
//                                 console.error("Error deleting PDF file:", e);
//                             }
//                         }
//                     });
// 
//                     return res.json({ code: 200, data: results.recordsets[0] });
// 
//                 } else {
//                     console.log('Statement sending failed.');
//                     return res.json({ msg: 0 })
//                 }
// 
//             }
// 
// 
// 
//         } else {
//             return res.json({ code: 500 })
//         }
// 
// 
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ error: "An error occurred while generating the statement." });
//     }
// };


module.exports = { sendStatement };