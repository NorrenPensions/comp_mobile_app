const Sentry = require('@sentry/node');
const nodemailer = require("nodemailer");
var currencyFormatter = require('currency-formatter');
const { getConnection } = require("../database/connection")
const sql = require('mssql')
//Required package
const fs = require("fs");
const normalizePin = require('../users/utility/normalizePin');


var price;
var senderName = 'Norrenberger Pensions';

const transporter = nodemailer.createTransport({
	host: 'smtp.office365.com',
	port: 587,
	auth: {
		user: 'noreply-npl@norrenpensions.com',
		pass: 'G3n3r@l.comm' 
	},
	tls: {
		rejectUnauthorized: false
	}
})

const sendStatement = async (req, res) => {

    try {

        const { from, to, sendToEmail } = req.body;
        const npin = req.body.pin;
        const pin = normalizePin(npin);
        console.log("Statement Req Payload: ", from, to, sendToEmail, pin);

        const pool = await getConnection();

        const today = new Date().toDateString();

        var start = new Date(from).toDateString()
        var end = new Date(to).toDateString()

        //const today = dateFormat(now, "dddd, mmmm , yyyy");
        //Sentry.captureException(now)

        const result = await pool.request().input('pin', pin).query(`SELECT 
        E.PIN,
        
        'FUND_CODE' = CASE 
                     WHEN C.FUND_ID = 73 THEN 'FUND1'
                     WHEN C.FUND_ID = 1 THEN 'FUND2'
                     WHEN C.FUND_ID = 74 THEN 'FUND3'
                     WHEN C.FUND_ID = 12 THEN 'FUND4'
                     WHEN C.FUND_ID = 79 THEN 'FUND5'
                     WHEN C.FUND_ID = 84 THEN 'FUND6 ACTIVE'
        
                     ELSE 'UNKNOWN'

                     END
        FROM PFA.dbo.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
        WHERE C.FUND_ID IN (73,1,74,12, 79, 84)
        
        AND E.PIN IN (@pin)
        
        GROUP BY C.FUND_ID,  E.PIN
       
        HAVING SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) > 0
        
        `);

        if (result.recordset.length > 0) {


            const fundid = result.recordset[0]['FUND_CODE']

            //FUND 1
            if (fundid == "FUND1") {
                const fundCode = await pool.request()
                    .input('to', to)
                    .query(`
    
            SELECT top (1)  SCHEME_ID AS FUND_ID,
            'FUND_CODE' = CASE 
                                 WHEN SCHEME_ID = 73 THEN 'FUND1'
                                
                                 ELSE 'OTHERS'
            
                                 END,
            
            BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
            
            WHERE  SCHEME_ID IN (73)
            
            
            ORDER BY VALUATION_DATE DESC
            `)


                if (fundCode.recordset.length == 0) {



                    const fundCode2 = await pool.request()

                        .query(`
    
        SELECT top (1)  SCHEME_ID AS FUND_ID,
        'FUND_CODE' = CASE 
                             WHEN SCHEME_ID = 73 THEN 'FUND1'
                            
                             ELSE 'OTHERS'
        
                             END,
        
        BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
        
        WHERE  SCHEME_ID IN (73)
        
        ORDER BY VALUATION_DATE DESC`)



                    price = fundCode2.recordset[0]['BID_PRICE']


                } else {
                    price = fundCode.recordset[0]['BID_PRICE']
                }

                const results = await pool.request()
                    .input('pin', pin)
                    .input('from', from)
                    .input('to', to)
                    .input('price', price)
                    .query(`SELECT 
    
                    E.PIN,E.SURNAME, E.FIRSTNAME, E.OTHERNAMES, 
                    
                    'FUND_CODE' = CASE 
                    
                                 WHEN C.FUND_ID = 73 THEN 'FUND2'
                                 
                                 ELSE 'UNKNOWN'
                    
                                 END,
                             
                'RSA_BALANCE' = CASE
                    
                                WHEN C.FUND_ID = 73 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                    
                    
                                END,  
                                (CASE
                    
                                WHEN C.FUND_ID = 73 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                    
                              
                                END)-(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS [RSA_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS [RSA_CUMULATIVE_UNITS],
                              
                                   SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "RSA_NET_CONTRIBUTION",
                    
                                SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                    
                'VOLUNTARY_BALANCE' = CASE
                    
                                WHEN C.FUND_ID = 73 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                                END,  
                    
                                (CASE
                    
                                WHEN C.FUND_ID = 73 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                               
                    
                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                    
                                SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
                    
                                SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                    
                            SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                                
                                SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS "NET_CONTRIBUTION",
                            
                'TOTAL_BALANCE' = CASE
                                WHEN C.FUND_ID = 73 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                                END,  
                    
                                (CASE
                               WHEN C.FUND_ID = 73 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                               
                    
                                END)- (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH],
                    
                                 SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
                    
                                 ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2) AS "WITHDRAWAL",
                    
                                 ROUND(SUM(ISNULL(C.WITHDRAWAL_VC, 0)), 2) AS "VC_WITHDRAWAL",
                    
                                 SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN FEE]
                    
                    FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                    
                    INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID
                    
                    WHERE C.FUND_ID IN (73)
                    
                    AND E.PIN = @pin
                    
                    GROUP BY E.PIN, E.SURNAME, E.FIRSTNAME, E.OTHERNAMES,  C.FUND_ID
                    
                    HAVING sum(ISNULL(trans_UNITS_R,0) + ISNULL(TRANS_UNITS_V,0))  <> 0
                    
                    ORDER BY E.PIN 
                    
                    
                    
            
            
            `);

                if (results.recordsets[0].length != 0) {

                    const narates = await (await pool)
                        .request()
                        .input('pin', pin)
                        .input('from', from)
                        .input('to', to)
                        .query(`
    
                SELECT DISTINCT  
                CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
                      CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
                      FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
                       B.NARRATION,
                       CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
              
                                  , C.VALUE_DATE ,
                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
    
                                  FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
                     
                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
                                  
    
              
              FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
              INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
                        WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
                      
                 
              
                    AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
                   
              
                   AND C.VALUE_DATE BETWEEN @from AND @to
                   --AND B.NARRATION NOT LIKE  '%INTEREST%'
                   AND E.PIN IN (@pin)
    
              GROUP BY    
              E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
                           E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
              
              ORDER BY  C.VALUE_DATE ASC
                `);


                    const userData = await (await pool)
                        .request()
                        .input('pin', pin)
                        .query(`
                SELECT PIN, FIRSTNAME, OTHERNAMES, SURNAME, MOBILE_PHONE                     
                FROM PFA.DBO.EMPLOYEES  WHERE PIN = @pin
    
                `);



                    // Voluntry contributions


                    const vc = await pool
                        .request()
                        .input('pin', pin)
                        .input('from', from)
                        .input('to', to)
                        .query(`
    
                SELECT DISTINCT  
                CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
                      CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
                      FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
                       B.NARRATION,
                       CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
              
                                  , C.VALUE_DATE ,
                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
    
                                  FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
                     
                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
                                  
    
              
              FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
              INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
                        WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
                      
                 
              
                    AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
                   
              
                   AND C.VALUE_DATE BETWEEN @from AND @to
                   --AND B.NARRATION NOT LIKE  '%INTEREST%'
                   AND E.PIN IN (@pin)
                   AND C.OTHER_CONTRIBUTION != 0
    
              GROUP BY    
              E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
                           E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
              
              ORDER BY  C.VALUE_DATE ASC
                `);






                    // 

                    var employee = currencyFormatter.format(results.recordsets[0][0]['EMPLOYEE_CONTRIBUTION'], { code: '' })
                    var employer = currencyFormatter.format(results.recordsets[0][0]['EMPLOYER_CONTRIBUTION'], { code: '' })
                    var tnet = currencyFormatter.format(results.recordsets[0][0]['NET_CONTRIBUTION'], { code: '' })

                    var vGrowth = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_GROWTH'], { code: '' })
                    var tGrowth = currencyFormatter.format(results.recordsets[0][0]['TOTAL_GROWTH'], { code: '' })
                    var rGrowth = currencyFormatter.format(results.recordsets[0][0]['RSA_GROWTH'], { code: '' })
                    var vat = currencyFormatter.format(narates.recordsets[0][0]['VAT_FEE'], { code: '' })
                    var fee = currencyFormatter.format(narates.recordsets[0][0]['ADMIN_FEE'], { code: '' })
                    var balance = currencyFormatter.format(results.recordsets[0][0]['RSA_BALANCE'], { code: '' })
                    var vbalance = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_BALANCE'], { code: '' })
                    var tbalance = currencyFormatter.format(results.recordsets[0][0]['TOTAL_BALANCE'], { code: '' })
                    var tcon = currencyFormatter.format(results.recordsets[0][0]['TOTAL_CONTRIBUTION'], { code: '' })
                    var voluntry = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_CONTRIBUTION'], { code: '' })
                    var rnet = currencyFormatter.format(results.recordsets[0][0]['RSA_NET_CONTRIBUTION'], { code: '' })
                    var unit = currencyFormatter.format(results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
                    var vunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'], { code: '' })
                    var prices = price
                    var tunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'] + results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })

                    var rsapin = userData.recordset[0]['PIN']
                    var phone = userData.recordset[0]['MOBILE_PHONE']
                    var name = userData.recordset[0]['FIRSTNAME'] + " " + userData.recordset[0]['OTHERNAMES'] + " " + userData.recordset[0]['SURNAME']
                    var fname = userData.recordset[0]['FIRSTNAME'];

                    const html = fs.readFileSync("template.html", "utf8");

                    var options = {
                        format: "A4",
                        orientation: "portrait",
                        border: "5mm",



                    };

                    var document = {
                        html: html,
                        data: {

                            data: narates.recordsets[0],
                            vc: vc.recordsets[0],
                            pin: pin,
                            value: 0,
                            balance,
                            tcon,
                            voluntry,
                            rnet,
                            unit,
                            prices,
                            fundType: 'IEI-ANCHOR RSA FUND I',
                            phone,
                            rsapin,
                            name,
                            employee,
                            employer,
                            vat,
                            fee,
                            tbalance,
                            vunit,
                            tunit,
                            vbalance,
                            today,
                            start,
                            end,
                            tGrowth,
                            vGrowth,
                            rGrowth,
                            tnet


                        },
                        path: `./statements/${pin}_statement.pdf`,
                        type: "",
                    };

                    pdf
                        .create(document, options)
                        .then((res) => {
                            const option = {
                                from: `${senderName} <estatement@ieianchorpensions.com.ng>`,
                                to: sendToEmail,
                                subject: "E-Statement",
                                html: `
                                
                                <b>Dear ${fname},</b> <br>
                                
                                <p>Thank you for choosing IEI-Anchor Pensions Managers LTD</p>
                                <p>Kindly find attached e-statement</p>
                                
                                `,
                                attachments: [{
                                    filename: `${pin}_statement.pdf`, path: `./statements/${pin}_statement.pdf`
                                }]

                            }

                            transporter.sendMail(option, function (err, info) {
                                if (err) {
                                    Sentry.captureException(err)
                                    var filePath = `./statements/${pin}_statement.pdf`;
                                    fs.unlinkSync(filePath);
                                    return
                                }
                                else {
                                    var filePath = `./statements/${pin}_statement.pdf`;
                                    fs.unlinkSync(filePath);

                                }
                            })

                        })
                        .catch((error) => {
                            console.error(error);
                        });


                    res.json({ code: 200, data: results.recordsets[0] })

                } else {
                    res.json({ msg: 0 })
                }

            }

            // FUND 2

            if (fundid == "FUND2") {
                const fundCode = await pool.request()
                    .input('to', to)
                    .query(`
    
            SELECT top 1  SCHEME_ID AS FUND_ID,
            'FUND_CODE' = CASE 
                                 WHEN SCHEME_ID = 1 THEN 'FUND2'
                                
                                 ELSE 'OTHERS'
            
                                 END,
            
            BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
            
            WHERE  SCHEME_ID IN (1)
            
            
            ORDER BY VALUATION_DATE DESC
            `)





                if (fundCode.recordset.length == 0) {



                    const fundCode2 = await pool.request()

                        .query(`
        
                SELECT top (1)  SCHEME_ID AS FUND_ID,
                'FUND_CODE' = CASE 
                                     WHEN SCHEME_ID = 1 THEN 'FUND2'
                                    
                                     ELSE 'OTHERS'
                
                                     END,
                
                BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
                
                WHERE  SCHEME_ID IN (1)
                
                ORDER BY VALUATION_DATE DESC`)



                    price = fundCode2.recordset[0]['BID_PRICE']


                } else {
                    price = fundCode.recordset[0]['BID_PRICE']
                }

                //  Sentry.captureException(price)


                const results = await pool.request()
                    .input('pin', pin)
                    .input('from', from)
                    .input('to', to)
                    .input('price', price)
                    .query(`SELECT 
    
                    E.PIN,E.SURNAME, E.FIRSTNAME, E.OTHERNAMES, 
                    
                    'FUND_CODE' = CASE 
                    
                                 WHEN C.FUND_ID = 1 THEN 'FUND2'
                                 
                                 ELSE 'UNKNOWN'
                    
                                 END,
                             
                'RSA_BALANCE' = CASE
                    
                                WHEN C.FUND_ID = 1 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                    
                    
                                END,  
                                (CASE
                    
                                WHEN C.FUND_ID = 1 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                    
                              
                                END)-(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS [RSA_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS [RSA_CUMULATIVE_UNITS],
                              
                                   SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "RSA_NET_CONTRIBUTION",
                    
                                SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                    
                'VOLUNTARY_BALANCE' = CASE
                    
                                WHEN C.FUND_ID = 1 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                                END,  
                    
                                (CASE
                    
                                WHEN C.FUND_ID = 1 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                               
                    
                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                    
                                SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
                    
                                SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                    
                            SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                                
                                SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS "NET_CONTRIBUTION",
                            
                'TOTAL_BALANCE' = CASE
                                WHEN C.FUND_ID = 1 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                                END,  
                    
                                (CASE
                               WHEN C.FUND_ID = 1 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                               
                    
                                END)- (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH],
                    
                                 SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
                    
                                 ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2) AS "WITHDRAWAL",
                    
                                 ROUND(SUM(ISNULL(C.WITHDRAWAL_VC, 0)), 2) AS "VC_WITHDRAWAL",
                    
                                 SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN FEE]
                    
                    FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                    
                    INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID
                    
                    WHERE C.FUND_ID IN (1)
                    
                    AND E.PIN = @pin
                    
                    GROUP BY E.PIN, E.SURNAME, E.FIRSTNAME, E.OTHERNAMES,  C.FUND_ID
                    
                    HAVING sum(ISNULL(trans_UNITS_R,0) + ISNULL(TRANS_UNITS_V,0))  <> 0
                    
                    ORDER BY E.PIN 
                    
                    
            `);








                if (results.recordsets[0].length != 0) {


                    // normal contributions

                    const narates = await (await pool)
                        .request()
                        .input('pin', pin)
                        .input('from', from)
                        .input('to', to)
                        .query(`
    
                SELECT DISTINCT  
                CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
                      CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
                      FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
                       B.NARRATION,
                       CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
              
                                  , C.VALUE_DATE ,
                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
    
                                  FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
                     
                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
                                  
    
              
              FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
              INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
                        WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
                      
                 
              
                    AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
                   
              
                   AND C.VALUE_DATE BETWEEN @from AND @to
                   --AND B.NARRATION NOT LIKE  '%INTEREST%'
                   AND E.PIN IN (@pin)
    
              GROUP BY    
              E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
                           E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
              
              ORDER BY  C.VALUE_DATE ASC
                `);


                    const userData = await (await pool)
                        .request()
                        .input('pin', pin)
                        .query(`
                SELECT PIN, FIRSTNAME, OTHERNAMES, SURNAME, MOBILE_PHONE                     
                FROM PFA.DBO.EMPLOYEES  WHERE PIN = @pin
    
                `);



                    // Voluntry contributions


                    const vc = await pool
                        .request()
                        .input('pin', pin)
                        .input('from', from)
                        .input('to', to)
                        .query(`
    
                SELECT DISTINCT  
                CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
                      CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
                      FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
                       B.NARRATION,
                       CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
              
                                  , C.VALUE_DATE ,
                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
    
                                  FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
                     
                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
                                  
    
              
              FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
              INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
                        WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
                      
                 
              
                    AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
                   
              
                   AND C.VALUE_DATE BETWEEN @from AND @to
                   --AND B.NARRATION NOT LIKE  '%INTEREST%'
                   AND E.PIN IN (@pin)
                   AND C.OTHER_CONTRIBUTION != 0
    
              GROUP BY    
              E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
                           E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
              
              ORDER BY  C.VALUE_DATE 
                `);

                    var employee = currencyFormatter.format(results.recordsets[0][0]['EMPLOYEE_CONTRIBUTION'], { code: '' })
                    var employer = currencyFormatter.format(results.recordsets[0][0]['EMPLOYER_CONTRIBUTION'], { code: '' })
                    var tnet = currencyFormatter.format(results.recordsets[0][0]['NET_CONTRIBUTION'], { code: '' })

                    var vGrowth = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_GROWTH'], { code: '' })
                    var tGrowth = currencyFormatter.format(results.recordsets[0][0]['TOTAL_GROWTH'], { code: '' })
                    var rGrowth = currencyFormatter.format(results.recordsets[0][0]['RSA_GROWTH'], { code: '' })
                    var vat = currencyFormatter.format(narates.recordsets[0][0]['VAT_FEE'], { code: '' })
                    var fee = currencyFormatter.format(narates.recordsets[0][0]['ADMIN_FEE'], { code: '' })
                    var balance = currencyFormatter.format(results.recordsets[0][0]['RSA_BALANCE'], { code: '' })
                    var vbalance = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_BALANCE'], { code: '' })
                    var tbalance = currencyFormatter.format(results.recordsets[0][0]['TOTAL_BALANCE'], { code: '' })
                    var tcon = currencyFormatter.format(results.recordsets[0][0]['TOTAL_CONTRIBUTION'], { code: '' })
                    var voluntry = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_CONTRIBUTION'], { code: '' })
                    var rnet = currencyFormatter.format(results.recordsets[0][0]['RSA_NET_CONTRIBUTION'], { code: '' })
                    var unit = currencyFormatter.format(results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
                    var vunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'], { code: '' })
                    var prices = price
                    var tunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'] + results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
                    var rsapin = userData.recordset[0]['PIN']
                    var phone = userData.recordset[0]['MOBILE_PHONE']
                    var name = userData.recordset[0]['FIRSTNAME'] + " " + userData.recordset[0]['OTHERNAMES'] + " " + userData.recordset[0]['SURNAME']
                    var fname = userData.recordset[0]['FIRSTNAME'];


                    const html = fs.readFileSync("template.html", "utf8");

                    var options = {
                        format: "A4",
                        orientation: "portrait",
                        border: "5mm",

                    };

                    var document = {
                        html: html,
                        data: {

                            data: narates.recordsets[0],
                            vc: vc.recordsets[0],
                            pin: pin,
                            value: 0,
                            balance,
                            tcon,
                            voluntry,
                            rnet,
                            unit,
                            prices,
                            fundType: 'IEI-ANCHOR RSA FUND II',
                            phone,
                            rsapin,
                            name,
                            employee,
                            employer,
                            vat,
                            fee,
                            tbalance,
                            vunit,
                            tunit,
                            vbalance,
                            today,
                            start,
                            end,
                            tGrowth,
                            vGrowth,
                            rGrowth,
                            tnet


                        },
                        path: `./statements/${pin}_statement.pdf`,
                        type: "",
                    };

                    pdf
                        .create(document, options)
                        .then((res) => {


                            const option = {
                                from: " Account Statement <estatement@ieianchorpensions.com.ng>",
                                to: sendToEmail,
                                subject: "E-Statement",
                                html: `
                        
                        <b>Dear ${fname},</b> <br>
                        
                        <p>Thank you for choosing IEI-Anchor Pensions Managers LTD</p>
                        <p>Kindly find attached e-statement</p>
                        
                        `,
                                attachments: [{
                                    filename: `${pin}_statement.pdf`, path: `./statements/${pin}_statement.pdf`
                                }]

                            }


                            transporter.sendMail(option, function (err, info) {
                                if (err) {
                                    Sentry.captureException(err)
                                    var filePath = `./statements/${pin}_statement.pdf`;
                                    fs.unlinkSync(filePath);
                                    return
                                }
                                else {
                                    var filePath = `./statements/${pin}_statement.pdf`;
                                    fs.unlinkSync(filePath);

                                }
                            })

                        })
                        .catch((error) => {
                            console.error(error);
                        });


                    res.json({ code: 200, data: results.recordsets[0] })
                } else {
                    res.json({ msg: 0 })
                }


            }


            //FUND 3
            if (fundid == "FUND3") {


                const fundCode = await pool.request()
                    .input('to', to)
                    .query(`
    
             SELECT top (1)  SCHEME_ID AS FUND_ID,
            'FUND_CODE' = CASE 
                                 WHEN SCHEME_ID = 74 THEN 'FUND3'
                                
                                 ELSE 'OTHERS'
            
                                 END,
            
            BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
            
            WHERE  SCHEME_ID IN (74)
            
            
            ORDER BY VALUATION_DATE DESC
            `)


                if (fundCode.recordset.length == 0) {



                    const fundCode2 = await pool.request()

                        .query(`
    
        SELECT top (1)  SCHEME_ID AS FUND_ID,
        'FUND_CODE' = CASE 
                             WHEN SCHEME_ID = 74 THEN 'FUND3'
                            
                             ELSE 'OTHERS'
        
                             END,
        
        BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
        
        WHERE  SCHEME_ID IN (74)
        
        ORDER BY VALUATION_DATE DESC`)



                    price = fundCode2.recordset[0]['BID_PRICE']


                } else {
                    price = fundCode.recordset[0]['BID_PRICE']
                }

                const results = await pool.request()
                    .input('pin', pin)
                    .input('from', from)
                    .input('to', to)
                    .input('price', price)
                    .query(`SELECT 

                E.PIN,E.SURNAME, E.FIRSTNAME, E.OTHERNAMES, 
                
                'FUND_CODE' = CASE 
                
                             WHEN C.FUND_ID = 74 THEN 'FUND3'
                             
                             ELSE 'UNKNOWN'
                
                             END,
                         
            'RSA_BALANCE' = CASE
                
                            WHEN C.FUND_ID = 74 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                
                
                            END,  
                            (CASE
                
                            WHEN C.FUND_ID = 74 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                
                          
                            END)-(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS [RSA_GROWTH],
                            SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS [RSA_CUMULATIVE_UNITS],
                          
                               SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "RSA_NET_CONTRIBUTION",
                
                            SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                
            'VOLUNTARY_BALANCE' = CASE
                
                            WHEN C.FUND_ID = 74 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                
                            END,  
                
                            (CASE
                
                            WHEN C.FUND_ID = 74 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                
                           
                
                            END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                
                            SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
                
                            SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                
                        SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                            
                            SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS "NET_CONTRIBUTION",
                        
            'TOTAL_BALANCE' = CASE
                            WHEN C.FUND_ID = 74 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                
                            END,  
                
                            (CASE
                           WHEN C.FUND_ID = 74 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                
                           
                
                            END)- (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH],
                
                             SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
                
                             ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2) AS "WITHDRAWAL",
                
                             ROUND(SUM(ISNULL(C.WITHDRAWAL_VC, 0)), 2) AS "VC_WITHDRAWAL",
                
                             SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN FEE]
                
                FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                
                INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID
                
                WHERE C.FUND_ID IN (74)
                
                AND E.PIN = @pin
                
                GROUP BY E.PIN, E.SURNAME, E.FIRSTNAME, E.OTHERNAMES,  C.FUND_ID
                
                HAVING sum(ISNULL(trans_UNITS_R,0) + ISNULL(TRANS_UNITS_V,0))  <> 0
                
                ORDER BY E.PIN 
                
                
        `);








                if (results.recordsets[0].length != 0) {

                    const narates = await (await pool)
                        .request()
                        .input('pin', pin)
                        .input('from', from)
                        .input('to', to)
                        .query(`
    
                SELECT DISTINCT  
                CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
                      CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
                      FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
                       B.NARRATION,
                       CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
              
                                  , C.VALUE_DATE ,
                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
    
                                  FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
                     
                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
                                  
    
              
              FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
              INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
                        WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
                      
                 
              
                    AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
                   
              
                   AND C.VALUE_DATE BETWEEN @from AND @to
                   --AND B.NARRATION NOT LIKE  '%INTEREST%'
                   AND E.PIN IN (@pin)
    
              GROUP BY    
              E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
                           E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
              
              ORDER BY  C.VALUE_DATE ASC
                `);


                    const userData = await (await pool)
                        .request()
                        .input('pin', pin)
                        .query(`
                SELECT PIN, FIRSTNAME, OTHERNAMES, SURNAME, MOBILE_PHONE                     
                FROM PFA.DBO.EMPLOYEES  WHERE PIN = @pin
    
                `);



                    // Voluntry contributions


                    const vc = await pool
                        .request()
                        .input('pin', pin)
                        .input('from', from)
                        .input('to', to)
                        .query(`
    
                SELECT DISTINCT  
                CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
                      CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
                      FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
                       B.NARRATION,
                       CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
              
                                  , C.VALUE_DATE ,
                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
    
                                  FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
                     
                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
                                  
    
              
              FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
              INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
                        WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
                      
                 
              
                    AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
                   
              
                   AND C.VALUE_DATE BETWEEN @from AND @to
                   --AND B.NARRATION NOT LIKE  '%INTEREST%'
                   AND E.PIN IN (@pin)
                   AND C.OTHER_CONTRIBUTION != 0
    
              GROUP BY    
              E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
                           E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
              
              ORDER BY  C.VALUE_DATE ASC
                `);






                    // 

                    var employee = currencyFormatter.format(results.recordsets[0][0]['EMPLOYEE_CONTRIBUTION'], { code: '' })
                    var employer = currencyFormatter.format(results.recordsets[0][0]['EMPLOYER_CONTRIBUTION'], { code: '' })
                    var tnet = currencyFormatter.format(results.recordsets[0][0]['NET_CONTRIBUTION'], { code: '' })

                    var vGrowth = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_GROWTH'], { code: '' })
                    var tGrowth = currencyFormatter.format(results.recordsets[0][0]['TOTAL_GROWTH'], { code: '' })
                    var rGrowth = currencyFormatter.format(results.recordsets[0][0]['RSA_GROWTH'], { code: '' })
                    var vat = currencyFormatter.format(narates.recordsets[0][0]['VAT_FEE'], { code: '' })
                    var fee = currencyFormatter.format(narates.recordsets[0][0]['ADMIN_FEE'], { code: '' })
                    var balance = currencyFormatter.format(results.recordsets[0][0]['RSA_BALANCE'], { code: '' })
                    var vbalance = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_BALANCE'], { code: '' })
                    var tbalance = currencyFormatter.format(results.recordsets[0][0]['TOTAL_BALANCE'], { code: '' })
                    var tcon = currencyFormatter.format(results.recordsets[0][0]['TOTAL_CONTRIBUTION'], { code: '' })
                    var voluntry = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_CONTRIBUTION'], { code: '' })
                    var rnet = currencyFormatter.format(results.recordsets[0][0]['RSA_NET_CONTRIBUTION'], { code: '' })
                    var unit = currencyFormatter.format(results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
                    var vunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'], { code: '' })

                    var prices = price
                    var tunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'] + results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })

                    var rsapin = userData.recordset[0]['PIN']
                    var phone = userData.recordset[0]['MOBILE_PHONE']
                    var name = userData.recordset[0]['FIRSTNAME'] + " " + userData.recordset[0]['OTHERNAMES'] + " " + userData.recordset[0]['SURNAME']
                    var fname = userData.recordset[0]['FIRSTNAME'];

                    //const sum = narates.recordset[0][0]['PRICE'].reduce((partial_sum, a) => partial_sum + a, 0);






                    // res.json({ data: results.recordsets[0], balance: balances.recordsets[0]})

                    const html = fs.readFileSync("template.html", "utf8");

                    var options = {
                        format: "A4",
                        orientation: "portrait",
                        border: "5mm",



                    };

                    var document = {
                        html: html,
                        data: {

                            data: narates.recordsets[0],
                            vc: vc.recordsets[0],
                            pin: pin,
                            value: 0,
                            balance,
                            tcon,
                            voluntry,
                            rnet,
                            unit,
                            prices,
                            fundType: 'IEI-ANCHOR RSA FUND III',
                            phone,
                            rsapin,
                            name,
                            employee,
                            employer,
                            vat,
                            fee,
                            tbalance,
                            vunit,
                            tunit,
                            vbalance,
                            today,
                            start,
                            end,
                            tGrowth,
                            vGrowth,
                            rGrowth,
                            tnet


                        },
                        path: `./statements/${pin}_statement.pdf`,
                        type: "",
                    };

                    pdf
                        .create(document, options)
                        .then((res) => {
                            const option = {
                                from: `${senderName} <estatement@ieianchorpensions.com.ng>`,
                                to: sendToEmail,
                                subject: "E-Statement",
                                html: `
                                
                                <b>Dear ${fname},</b> <br>
                                
                                <p>Thank you for choosing IEI-Anchor Pensions Managers LTD</p>
                                <p>Kindly find attached e-statement</p>
                                
                                `,
                                attachments: [{
                                    filename: `${pin}_statement.pdf`, path: `./statements/${pin}_statement.pdf`
                                }]

                            }

                            transporter.sendMail(option, function (err, info) {
                                if (err) {
                                    Sentry.captureException(err)
                                    var filePath = `./statements/${pin}_statement.pdf`;
                                    fs.unlinkSync(filePath);
                                    return
                                }
                                else {
                                    var filePath = `./statements/${pin}_statement.pdf`;
                                    fs.unlinkSync(filePath);

                                }
                            })


                        })
                        .catch((error) => {
                            console.error(error);
                        });


                    res.json({ code: 200, data: results.recordsets[0] })

                } else {
                    res.json({ msg: 0 })
                }






            }

            // fund 4
            if (fundid == "FUND4") {
                const fundCode = await pool.request()
                    .input('to', to)
                    .query(`
    
             SELECT top (1)  SCHEME_ID AS FUND_ID,
            'FUND_CODE' = CASE 
                                 WHEN SCHEME_ID = 12 THEN 'FUND4'
                                
                                 ELSE 'OTHERS'
            
                                 END,
            
            BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
            
            WHERE  SCHEME_ID IN (12)
           
            
            ORDER BY VALUATION_DATE DESC
            `)


                if (fundCode.recordset.length == 0) {



                    const fundCode2 = await pool.request()

                        .query(`
    
        SELECT top (1)  SCHEME_ID AS FUND_ID,
        'FUND_CODE' = CASE 
                             WHEN SCHEME_ID = 12 THEN 'FUND4'
                            
                             ELSE 'OTHERS'
        
                             END,
        
        BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
        
        WHERE  SCHEME_ID IN (12)
        
        ORDER BY VALUATION_DATE DESC`)



                    price = fundCode2.recordset[0]['BID_PRICE']


                } else {
                    price = fundCode.recordset[0]['BID_PRICE']
                }


                const results = await pool.request()
                    .input('pin', pin)
                    .input('from', from)
                    .input('to', to)
                    .input('price', price)
                    .query(`SELECT 
    
                    E.PIN,E.SURNAME, E.FIRSTNAME, E.OTHERNAMES, 
                    
                    'FUND_CODE' = CASE 
                    
                                 WHEN C.FUND_ID = 12 THEN 'FUND4'
                                 
                                 ELSE 'UNKNOWN'
                    
                                 END,
                             
                'RSA_BALANCE' = CASE
                    
                                WHEN C.FUND_ID = 12 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                    
                    
                                END,  
                                (CASE
                    
                                WHEN C.FUND_ID = 12 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                    
                              
                                END)-(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS [RSA_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS [RSA_CUMULATIVE_UNITS],
                              
                                   SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "RSA_NET_CONTRIBUTION",
                    
                                SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                    
                'VOLUNTARY_BALANCE' = CASE
                    
                                WHEN C.FUND_ID = 12 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                                END,  
                    
                                (CASE
                    
                                WHEN C.FUND_ID = 12 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                               
                    
                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                    
                                SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
                    
                                SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                    
                            SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                                
                                SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS "NET_CONTRIBUTION",
                            
                'TOTAL_BALANCE' = CASE
                                WHEN C.FUND_ID = 12 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                                END,  
                    
                                (CASE
                               WHEN C.FUND_ID = 12 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                               
                    
                                END)- (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH],
                    
                                 SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
                    
                                 ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2) AS "WITHDRAWAL",
                    
                                 ROUND(SUM(ISNULL(C.WITHDRAWAL_VC, 0)), 2) AS "VC_WITHDRAWAL",
                    
                                 SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN FEE]
                    
                    FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                    
                    INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID
                    
                    WHERE C.FUND_ID IN (12)
                    
                    AND E.PIN = @pin
                    
                    GROUP BY E.PIN, E.SURNAME, E.FIRSTNAME, E.OTHERNAMES,  C.FUND_ID
                    
                    HAVING sum(ISNULL(trans_UNITS_R,0) + ISNULL(TRANS_UNITS_V,0))  <> 0
                    
                    ORDER BY E.PIN 
                    
                    
            `);







                if (results.recordsets[0].length != 0) {

                    const narates = await (await pool)
                        .request()
                        .input('pin', pin)
                        .input('from', from)
                        .input('to', to)
                        .query(`
    
                SELECT DISTINCT  
                CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
                      CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
                      FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
                       B.NARRATION,
                       CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
              
                                  , C.VALUE_DATE ,
                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
    
                                  FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
                     
                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
                                  
    
              
              FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
              INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
                        WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
                      
                 
              
                    AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
                   
              
                   AND C.VALUE_DATE BETWEEN @from AND @to
                   --AND B.NARRATION NOT LIKE  '%INTEREST%'
                   AND E.PIN IN (@pin)
    
              GROUP BY    
              E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
                           E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
              
              ORDER BY  C.VALUE_DATE ASC
                `);


                    const userData = await (await pool)
                        .request()
                        .input('pin', pin)
                        .query(`
                SELECT PIN, FIRSTNAME, OTHERNAMES, SURNAME, MOBILE_PHONE                     
                FROM PFA.DBO.EMPLOYEES  WHERE PIN = @pin
    
                `);



                    // Voluntry contributions


                    const vc = await pool
                        .request()
                        .input('pin', pin)
                        .input('from', from)
                        .input('to', to)
                        .query(`
    
                SELECT DISTINCT  
                CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
                      CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
                      FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
                       B.NARRATION,
                       CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
              
                                  , C.VALUE_DATE ,
                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
    
                                  FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
                     
                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
                                  
    
              
              FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
              INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
                        WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
                      
                 
              
                    AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
                   
              
                   AND C.VALUE_DATE BETWEEN @from AND @to
                   --AND B.NARRATION NOT LIKE  '%INTEREST%'
                   AND E.PIN IN (@pin)
                   AND C.OTHER_CONTRIBUTION != 0
    
              GROUP BY    
              E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
                           E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
              
              ORDER BY  C.VALUE_DATE ASC
                `);






                    // 

                    var employee = currencyFormatter.format(results.recordsets[0][0]['EMPLOYEE_CONTRIBUTION'], { code: '' })
                    var employer = currencyFormatter.format(results.recordsets[0][0]['EMPLOYER_CONTRIBUTION'], { code: '' })
                    var tnet = currencyFormatter.format(results.recordsets[0][0]['NET_CONTRIBUTION'], { code: '' })

                    var vGrowth = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_GROWTH'], { code: '' })
                    var tGrowth = currencyFormatter.format(results.recordsets[0][0]['TOTAL_GROWTH'], { code: '' })
                    var rGrowth = currencyFormatter.format(results.recordsets[0][0]['RSA_GROWTH'], { code: '' })
                    var vat = currencyFormatter.format(narates.recordsets[0][0]['VAT_FEE'], { code: '' })
                    var fee = currencyFormatter.format(narates.recordsets[0][0]['ADMIN_FEE'], { code: '' })
                    var balance = currencyFormatter.format(results.recordsets[0][0]['RSA_BALANCE'], { code: '' })
                    var vbalance = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_BALANCE'], { code: '' })
                    var tbalance = currencyFormatter.format(results.recordsets[0][0]['TOTAL_BALANCE'], { code: '' })
                    var tcon = currencyFormatter.format(results.recordsets[0][0]['TOTAL_CONTRIBUTION'], { code: '' })
                    var voluntry = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_CONTRIBUTION'], { code: '' })
                    var rnet = currencyFormatter.format(results.recordsets[0][0]['RSA_NET_CONTRIBUTION'], { code: '' })
                    var unit = currencyFormatter.format(results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
                    var vunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'], { code: '' })

                    var prices = price
                    var tunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'] + results.recordsets[0][0]['UNITS'], { code: '' })






                    var rsapin = userData.recordset[0]['PIN']
                    var phone = userData.recordset[0]['MOBILE_PHONE']
                    var name = userData.recordset[0]['FIRSTNAME'] + " " + userData.recordset[0]['OTHERNAMES'] + " " + userData.recordset[0]['SURNAME']
                    var fname = userData.recordset[0]['FIRSTNAME'];

                    //const sum = narates.recordset[0][0]['PRICE'].reduce((partial_sum, a) => partial_sum + a, 0);






                    // res.json({ data: results.recordsets[0], balance: balances.recordsets[0]})

                    const html = fs.readFileSync("template.html", "utf8");

                    var options = {
                        format: "A4",
                        orientation: "portrait",
                        border: "5mm",



                    };

                    var document = {
                        html: html,
                        data: {

                            data: narates.recordsets[0],
                            vc: vc.recordsets[0],
                            pin: pin,
                            value: 0,
                            balance,
                            tcon,
                            voluntry,
                            rnet,
                            unit,
                            prices,
                            fundType: 'IEI-ANCHOR RSA FUND Iv',
                            phone,
                            rsapin,
                            name,
                            employee,
                            employer,
                            vat,
                            fee,
                            tbalance,
                            vunit,
                            tunit,
                            vbalance,
                            today,
                            start,
                            end,
                            tGrowth,
                            vGrowth,
                            rGrowth,
                            tnet


                        },
                        path: `./statements/${pin}_statement.pdf`,
                        type: "",
                    };

                    pdf
                        .create(document, options)
                        .then((res) => {

                            const option = {
                                from: " Sani Abubakar <sani.abubakar@ieianchorpensions.com.ng>",
                                to: sendToEmail,
                                subject: "helle from iei-anchor",
                                text: "this is a test text",
                                attachments: [{
                                    filename: `${pin}_statement.pdf`, path: `./statements/${pin}_statement.pdf`
                                }]

                            }

                            transporter.sendMail(option, function (err, info) {
                                if (err) {
                                    Sentry.captureException(err)
                                    var filePath = `./statements/${pin}_statement.pdf`;
                                    fs.unlinkSync(filePath);
                                    return
                                }
                                else {
                                    var filePath = `./statements/${pin}_statement.pdf`;
                                    fs.unlinkSync(filePath);

                                }
                            })
                        })
                        .catch((error) => {
                            console.error(error);
                        });


                    res.json({ code: 200, data: results.recordsets[0] })

                } else {
                    res.json({ msg: 0 })
                }


            }

            //FUND 5 
            if (fundid == "FUND5") {
                const fundCode = await pool.request()
                    .input('to', to)
                    .query(`
    
            SELECT top (1)  SCHEME_ID AS FUND_ID,
            'FUND_CODE' = CASE 
                                 WHEN SCHEME_ID = 79 THEN 'FUND5'
                                
                                 ELSE 'OTHERS'
            
                                 END,
            
            BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
            
            WHERE  SCHEME_ID IN (79)
           
            
            ORDER BY VALUATION_DATE DESC
            `)

                if (fundCode.recordset.length == 0) {



                    const fundCode2 = await pool.request()

                        .query(`
    
        SELECT top (1)  SCHEME_ID AS FUND_ID,
        'FUND_CODE' = CASE 
                             WHEN SCHEME_ID = 79 THEN 'FUND5'
                            
                             ELSE 'OTHERS'
        
                             END,
        
        BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
        
        WHERE  SCHEME_ID IN (79)
        
        ORDER BY VALUATION_DATE DESC`)



                    price = fundCode2.recordset[0]['BID_PRICE']


                } else {
                    price = fundCode.recordset[0]['BID_PRICE']
                }


                const results = await pool.request()
                    .input('pin', pin)
                    .input('from', from)
                    .input('to', to)
                    .input('price', price)
                    .query(`SELECT 
    
                    E.PIN,E.SURNAME, E.FIRSTNAME, E.OTHERNAMES, 
                    
                    'FUND_CODE' = CASE 
                    
                                 WHEN C.FUND_ID = 79 THEN 'FUND5'
                                 
                                 ELSE 'UNKNOWN'
                    
                                 END,
                             
                'RSA_BALANCE' = CASE
                    
                                WHEN C.FUND_ID = 79 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                    
                    
                                END,  
                                (CASE
                    
                                WHEN C.FUND_ID = 79 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                    
                              
                                END)-(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS [RSA_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS [RSA_CUMULATIVE_UNITS],
                              
                                   SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "RSA_NET_CONTRIBUTION",
                    
                                SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                    
                'VOLUNTARY_BALANCE' = CASE
                    
                                WHEN C.FUND_ID = 79 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                                END,  
                    
                                (CASE
                    
                                WHEN C.FUND_ID = 79 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                               
                    
                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                    
                                SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
                    
                                SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                    
                            SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                                
                                SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS "NET_CONTRIBUTION",
                            
                'TOTAL_BALANCE' = CASE
                                WHEN C.FUND_ID = 79 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                                END,  
                    
                                (CASE
                               WHEN C.FUND_ID = 79 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                               
                    
                                END)- (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH],
                    
                                 SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
                    
                                 ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2) AS "WITHDRAWAL",
                    
                                 ROUND(SUM(ISNULL(C.WITHDRAWAL_VC, 0)), 2) AS "VC_WITHDRAWAL",
                    
                                 SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN FEE]
                    
                    FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                    
                    INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID
                    
                    WHERE C.FUND_ID IN (79)
                    
                    AND E.PIN = @pin
                    
                    GROUP BY E.PIN, E.SURNAME, E.FIRSTNAME, E.OTHERNAMES,  C.FUND_ID
                    
                    HAVING sum(ISNULL(trans_UNITS_R,0) + ISNULL(TRANS_UNITS_V,0))  <> 0
                    
                    ORDER BY E.PIN 
                    
                    
            `);




                if (results.recordsets[0].length != 0) {

                    const narates = await (await pool)
                        .request()
                        .input('pin', pin)
                        .input('from', from)
                        .input('to', to)
                        .query(`
    
                SELECT DISTINCT  
                CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
                      CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
                      FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
                       B.NARRATION,
                       CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
              
                                  , C.VALUE_DATE ,
                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
    
                                  FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
                     
                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
                                  
    
              
              FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
              INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
                        WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
                      
                 
              
                    AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
                   
              
                   AND C.VALUE_DATE BETWEEN @from AND @to
                   --AND B.NARRATION NOT LIKE  '%INTEREST%'
                   AND E.PIN IN (@pin)
    
              GROUP BY    
              E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
                           E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
              
              ORDER BY  C.VALUE_DATE ASC
                `);


                    const userData = await (await pool)
                        .request()
                        .input('pin', pin)
                        .query(`
                SELECT PIN, FIRSTNAME, OTHERNAMES, SURNAME, MOBILE_PHONE                     
                FROM PFA.DBO.EMPLOYEES  WHERE PIN = @pin
    
                `);



                    // Voluntry contributions


                    const vc = await pool
                        .request()
                        .input('pin', pin)
                        .input('from', from)
                        .input('to', to)
                        .query(`
    
                SELECT DISTINCT  
                CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
                      CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
                      FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
                       B.NARRATION,
                       CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
              
                                  , C.VALUE_DATE ,
                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
    
                                  FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
                     
                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
                                  
    
              
              FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
              INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
                        WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
                      
                 
              
                    AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
                   
              
                   AND C.VALUE_DATE BETWEEN @from AND @to
                   --AND B.NARRATION NOT LIKE  '%INTEREST%'
                   AND E.PIN IN (@pin)
                   AND C.OTHER_CONTRIBUTION != 0
    
              GROUP BY    
              E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
                           E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
              
              ORDER BY  C.VALUE_DATE ASC
                `);






                    // 

                    var employee = currencyFormatter.format(results.recordsets[0][0]['EMPLOYEE_CONTRIBUTION'], { code: '' })
                    var employer = currencyFormatter.format(results.recordsets[0][0]['EMPLOYER_CONTRIBUTION'], { code: '' })
                    var tnet = currencyFormatter.format(results.recordsets[0][0]['NET_CONTRIBUTION'], { code: '' })

                    var vGrowth = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_GROWTH'], { code: '' })
                    var tGrowth = currencyFormatter.format(results.recordsets[0][0]['TOTAL_GROWTH'], { code: '' })
                    var rGrowth = currencyFormatter.format(results.recordsets[0][0]['RSA_GROWTH'], { code: '' })
                    var vat = currencyFormatter.format(narates.recordsets[0][0]['VAT_FEE'], { code: '' })
                    var fee = currencyFormatter.format(narates.recordsets[0][0]['ADMIN_FEE'], { code: '' })
                    var balance = currencyFormatter.format(results.recordsets[0][0]['RSA_BALANCE'], { code: '' })
                    var vbalance = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_BALANCE'], { code: '' })
                    var tbalance = currencyFormatter.format(results.recordsets[0][0]['TOTAL_BALANCE'], { code: '' })
                    var tcon = currencyFormatter.format(results.recordsets[0][0]['TOTAL_CONTRIBUTION'], { code: '' })
                    var voluntry = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_CONTRIBUTION'], { code: '' })
                    var rnet = currencyFormatter.format(results.recordsets[0][0]['RSA_NET_CONTRIBUTION'], { code: '' })
                    var unit = currencyFormatter.format(results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
                    var vunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'], { code: '' })
                    var prices = price
                    var tunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'] + results.recordsets[0][0]['UNITS'], { code: '' })






                    var rsapin = userData.recordset[0]['PIN']
                    var phone = userData.recordset[0]['MOBILE_PHONE']
                    var name = userData.recordset[0]['FIRSTNAME'] + " " + userData.recordset[0]['OTHERNAMES'] + " " + userData.recordset[0]['SURNAME']
                    var fname = userData.recordset[0]['FIRSTNAME'];

                    //const sum = narates.recordset[0][0]['PRICE'].reduce((partial_sum, a) => partial_sum + a, 0);





                    // res.json({ data: results.recordsets[0], balance: balances.recordsets[0]})

                    const html = fs.readFileSync("template.html", "utf8");

                    var options = {
                        format: "A4",
                        orientation: "portrait",
                        border: "5mm",



                    };

                    var document = {
                        html: html,
                        data: {

                            data: narates.recordsets[0],
                            vc: vc.recordsets[0],
                            pin: pin,
                            value: 0,
                            balance,
                            tcon,
                            voluntry,
                            rnet,
                            unit,
                            prices,
                            fundType: 'IEI-ANCHOR RSA FUND V',
                            phone,
                            rsapin,
                            name,
                            employee,
                            employer,
                            vat,
                            fee,
                            tbalance,
                            vunit,
                            tunit,
                            vbalance,
                            today,
                            start,
                            end,
                            tGrowth,
                            vGrowth,
                            rGrowth,
                            tnet


                        },
                        path: `./statements/${pin}_statement.pdf`,
                        type: "",
                    };

                    pdf
                        .create(document, options)
                        .then((res) => {
                            const option = {
                                from: `${senderName} <estatement@ieianchorpensions.com.ng>`,
                                to: sendToEmail,
                                subject: "E-Statement",
                                html: `
                                
                                <b>Dear ${fname},</b> <br>
                                
                                <p>Thank you for choosing IEI-Anchor Pensions Managers LTD</p>
                                <p>Kindly find attached e-statement</p>
                                
                                `,
                                attachments: [{
                                    filename: `${pin}_statement.pdf`, path: `./statements/${pin}_statement.pdf`
                                }]

                            }


                            transporter.sendMail(option, function (err, info) {
                                if (err) {
                                    Sentry.captureException(err)
                                    var filePath = `./statements/${pin}_statement.pdf`;
                                    fs.unlinkSync(filePath);
                                    return
                                }
                                else {
                                    var filePath = `./statements/${pin}_statement.pdf`;
                                    fs.unlinkSync(filePath);

                                }
                            })


                        })
                        .catch((error) => {
                            console.error(error);
                        });


                    res.json({ code: 200, data: results.recordsets[0] })

                } else {
                    res.json({ msg: 0 })
                }


            }



            //FUND 6
            if (fundid == "FUND6 ACTIVE") {
                const fundCode = await pool.request()
                    .input('to', to)
                    .query(`
    
            SELECT top (1)  SCHEME_ID AS FUND_ID,
            'FUND_CODE' = CASE 
                                 WHEN SCHEME_ID = 84 THEN 'FUND6 ACTIVE'
                                
                                 ELSE 'OTHERS'
            
                                 END,
            
            BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
            
            WHERE  SCHEME_ID IN (84)
            
            
            ORDER BY VALUATION_DATE DESC
            `)


                if (fundCode.recordset.length == 0) {



                    const fundCode2 = await pool.request()

                        .query(`
    
        SELECT top (1)  SCHEME_ID AS FUND_ID,
        'FUND_CODE' = CASE 
                             WHEN SCHEME_ID = 84 THEN 'FUND1'
                            
                             ELSE 'OTHERS'
        
                             END,
        
        BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
        
        WHERE  SCHEME_ID IN (84)
        
        ORDER BY VALUATION_DATE DESC`)



                    price = fundCode2.recordset[0]['BID_PRICE']


                } else {
                    price = fundCode.recordset[0]['BID_PRICE']
                }

                const results = await pool.request()
                    .input('pin', pin)
                    .input('from', from)
                    .input('to', to)
                    .input('price', price)
                    .query(`SELECT 
    
                    E.PIN,E.SURNAME, E.FIRSTNAME, E.OTHERNAMES, 
                    
                    'FUND_CODE' = CASE 
                    
                                 WHEN C.FUND_ID = 84 THEN 'FUND2'
                                 
                                 ELSE 'UNKNOWN'
                    
                                 END,
                             
                'RSA_BALANCE' = CASE
                    
                                WHEN C.FUND_ID = 84 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                    
                    
                                END,  
                                (CASE
                    
                                WHEN C.FUND_ID = 84 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                    
                              
                                END)-(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS [RSA_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS [RSA_CUMULATIVE_UNITS],
                              
                                   SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "RSA_NET_CONTRIBUTION",
                    
                                SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                    
                'VOLUNTARY_BALANCE' = CASE
                    
                                WHEN C.FUND_ID = 84 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                                END,  
                    
                                (CASE
                    
                                WHEN C.FUND_ID = 84 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                               
                    
                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                    
                                SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
                    
                                SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                    
                            SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                                
                                SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS "NET_CONTRIBUTION",
                            
                'TOTAL_BALANCE' = CASE
                                WHEN C.FUND_ID = 84 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                                END,  
                    
                                (CASE
                               WHEN C.FUND_ID = 84 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                    
                               
                    
                                END)- (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH],
                    
                                 SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
                    
                                 ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2) AS "WITHDRAWAL",
                    
                                 ROUND(SUM(ISNULL(C.WITHDRAWAL_VC, 0)), 2) AS "VC_WITHDRAWAL",
                    
                                 SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN FEE]
                    
                    FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                    
                    INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID
                    
                    WHERE C.FUND_ID IN (84)
                    
                    AND E.PIN = @pin
                    
                    GROUP BY E.PIN, E.SURNAME, E.FIRSTNAME, E.OTHERNAMES,  C.FUND_ID
                    
                    HAVING sum(ISNULL(trans_UNITS_R,0) + ISNULL(TRANS_UNITS_V,0))  <> 0
                    
                    ORDER BY E.PIN 
                    
                    
                    
            
            
            `);

                if (results.recordsets[0].length != 0) {

                    const narates = await (await pool)
                        .request()
                        .input('pin', pin)
                        .input('from', from)
                        .input('to', to)
                        .query(`
    
                SELECT DISTINCT  
                CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
                      CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
                      FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
                       B.NARRATION,
                       CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
              
                                  , C.VALUE_DATE ,
                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
    
                                  FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
                     
                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
                                  
    
              
              FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
              INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
                        WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
                      
                 
              
                    AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
                   
              
                   AND C.VALUE_DATE BETWEEN @from AND @to
                   --AND B.NARRATION NOT LIKE  '%INTEREST%'
                   AND E.PIN IN (@pin)
    
              GROUP BY    
              E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
                           E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
              
              ORDER BY  C.VALUE_DATE ASC
                `);


                    const userData = await (await pool)
                        .request()
                        .input('pin', pin)
                        .query(`
                SELECT PIN, FIRSTNAME, OTHERNAMES, SURNAME, MOBILE_PHONE                     
                FROM PFA.DBO.EMPLOYEES  WHERE PIN = @pin
    
                `);



                    // Voluntry contributions


                    const vc = await pool
                        .request()
                        .input('pin', pin)
                        .input('from', from)
                        .input('to', to)
                        .query(`
    
                SELECT DISTINCT  
                CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
                      CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
                      FORMAT(SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)),'N0') AS "EMPLOYEE_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)),'N0') AS "EMPLOYER_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)),'N0') AS "TOTAL_CONTRIBUTION",
                      FORMAT(SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)),'N0') AS "VOLUNTARY_CONTRIBUTION",
                      FORMAT( SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)  - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))),'N0') AS "NET_CONTRIBUTION",
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS UNITS,
                      FORMAT(ROUND(SUM(ISNULL(C.TRANS_UNITS_V,0.0000)),  2),'N0') AS V_UNITS,
                       B.NARRATION,
                       CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
              
                                  , C.VALUE_DATE ,
                                  SUM(ISNULL(C.VAT_FEE, 0)) AS [VAT_FEE],
    
                                  FORMAT(  ROUND(SUM(ISNULL(C.WITHDRAWAL, 0)), 2), 'N0') AS "WITHDRAWAL",
                     
                                  SUM(ISNULL(C.TOTAL_FEE, 0)) AS [ADMIN_FEE],C.PRICE
                                  
    
              
              FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
              INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID 
                        WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
                      
                 
              
                    AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
                   
              
                   AND C.VALUE_DATE BETWEEN @from AND @to
                   --AND B.NARRATION NOT LIKE  '%INTEREST%'
                   AND E.PIN IN (@pin)
                   AND C.OTHER_CONTRIBUTION != 0
    
              GROUP BY    
              E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
                           E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION, C.PRICE
              
              ORDER BY  C.VALUE_DATE ASC
                `);






                    // 

                    var employee = currencyFormatter.format(results.recordsets[0][0]['EMPLOYEE_CONTRIBUTION'], { code: '' })
                    var employer = currencyFormatter.format(results.recordsets[0][0]['EMPLOYER_CONTRIBUTION'], { code: '' })
                    var tnet = currencyFormatter.format(results.recordsets[0][0]['NET_CONTRIBUTION'], { code: '' })

                    var vGrowth = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_GROWTH'], { code: '' })
                    var tGrowth = currencyFormatter.format(results.recordsets[0][0]['TOTAL_GROWTH'], { code: '' })
                    var rGrowth = currencyFormatter.format(results.recordsets[0][0]['RSA_GROWTH'], { code: '' })
                    var vat = currencyFormatter.format(narates.recordsets[0][0]['VAT_FEE'], { code: '' })
                    var fee = currencyFormatter.format(narates.recordsets[0][0]['ADMIN_FEE'], { code: '' })
                    var balance = currencyFormatter.format(results.recordsets[0][0]['RSA_BALANCE'], { code: '' })
                    var vbalance = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_BALANCE'], { code: '' })
                    var tbalance = currencyFormatter.format(results.recordsets[0][0]['TOTAL_BALANCE'], { code: '' })
                    var tcon = currencyFormatter.format(results.recordsets[0][0]['TOTAL_CONTRIBUTION'], { code: '' })
                    var voluntry = currencyFormatter.format(results.recordsets[0][0]['VOLUNTARY_CONTRIBUTION'], { code: '' })
                    var rnet = currencyFormatter.format(results.recordsets[0][0]['RSA_NET_CONTRIBUTION'], { code: '' })
                    var unit = currencyFormatter.format(results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })
                    var vunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'], { code: '' })
                    var prices = price
                    var tunit = currencyFormatter.format(results.recordsets[0][0]['CUMULATIVE_VOLUNTARY_UNIT'] + results.recordsets[0][0]['RSA_CUMULATIVE_UNITS'], { code: '' })

                    var rsapin = userData.recordset[0]['PIN']
                    var phone = userData.recordset[0]['MOBILE_PHONE']
                    var name = userData.recordset[0]['FIRSTNAME'] + " " + userData.recordset[0]['OTHERNAMES'] + " " + userData.recordset[0]['SURNAME']
                    var fname = userData.recordset[0]['FIRSTNAME'];

                    const html = fs.readFileSync("template.html", "utf8");

                    var options = {
                        format: "A4",
                        orientation: "portrait",
                        border: "5mm",



                    };

                    var document = {
                        html: html,
                        data: {

                            data: narates.recordsets[0],
                            vc: vc.recordsets[0],
                            pin: pin,
                            value: 0,
                            balance,
                            tcon,
                            voluntry,
                            rnet,
                            unit,
                            prices,
                            fundType: 'IEI-ANCHOR RSA FUND 6 ACTIVE',
                            phone,
                            rsapin,
                            name,
                            employee,
                            employer,
                            vat,
                            fee,
                            tbalance,
                            vunit,
                            tunit,
                            vbalance,
                            today,
                            start,
                            end,
                            tGrowth,
                            vGrowth,
                            rGrowth,
                            tnet


                        },
                        path: `./statements/${pin}_statement.pdf`,
                        type: "",
                    };

                    pdf
                        .create(document, options)
                        .then((res) => {
                            const option = {
                                from: `${senderName} <estatement@ieianchorpensions.com.ng>`,
                                to: sendToEmail,
                                subject: "E-Statement",
                                html: `
                                
                                <b>Dear ${fname},</b> <br>
                                
                                <p>Thank you for choosing IEI-Anchor Pensions Managers LTD</p>
                                <p>Kindly find attached e-statement</p>
                                
                                `,
                                attachments: [{
                                    filename: `${pin}_statement.pdf`, path: `./statements/${pin}_statement.pdf`
                                }]

                            }

                            transporter.sendMail(option, function (err, info) {
                                if (err) {
                                    Sentry.captureException(err)
                                    var filePath = `./statements/${pin}_statement.pdf`;
                                    fs.unlinkSync(filePath);
                                    return
                                }
                                else {
                                    var filePath = `./statements/${pin}_statement.pdf`;
                                    fs.unlinkSync(filePath);

                                }
                            })

                        })
                        .catch((error) => {
                            console.error(error);
                        });


                    res.json({ code: 200, data: results.recordsets[0] })

                } else {
                    res.json({ msg: 0 })
                }

            }


        } else {
            res.json({ code: 500 })
        }




    } catch (errors) {
        console.log("Statement req error: ", error);
        Sentry.captureException(errors)
    }


}

module.exports = { sendStatement }

