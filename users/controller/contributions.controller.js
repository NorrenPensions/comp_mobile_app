const Sentry = require('@sentry/node');
const { getConnection } = require("../../database/connection");
const sql = require('mssql')
const dateFormate = require('date-format')
//Required package
const fs = require("fs");
const { isInt16Array } = require("util/types");
const { json } = require("express/lib/response");
const normalizePin = require('../utility/normalizePin');
const axios = require("axios");
const { getAccessToken } = require("../../utils/authToken");

const contSummaryNew = async (req, res) => {
    const { pin } = req.params;
    const cleanPin = pin ? pin.trim() : "";
    const npin = normalizePin(cleanPin);
    console.log("Processing contributionSummary for PIN:", npin);

    try {
        const pool = await getConnection();
        const pinSearchResult = await pool
            .request()
            .input('pin', npin)
            .query(
                `SELECT PIN AS rsaPin FROM PFA.DBO.EMPLOYEES WHERE PIN = @pin OR MOBILE_PHONE = @pin`);

        const { rsaPin } = (pinSearchResult.recordset && pinSearchResult.recordset[0]) || {};
        console.log("PIN search result - rsaPin:", rsaPin);

        const targetPin = rsaPin || npin;
        console.log("Target Pin: ", targetPin);

        const results = await pool
            .request()
            .input('pin', targetPin)
            .query(
                `SELECT SUM(ISNULL(EMPLOYEE_CONTRIBUTION, 0)) AS employeeContr,
                            SUM(ISNULL(EMPLOYER_CONTRIBUTION, 0)) AS employerContr
                            FROM PFA.DBO.CONTRIBUTION WHERE PIN = @pin`);

        const { employeeContr = 0, employerContr = 0 } = (results.recordset && results.recordset[0]) || {};

        console.log("Database query results - rsaPin:", targetPin, "employeeContr:", employeeContr, "employerContr:", employerContr);

        const result = await pool.request().input('pin', targetPin).query(`
            EXEC PFA.dbo.sp_GetCurrentValueOfFunds @pin = @pin
            `);

        const mandatoryRes = await pool.request().input('pin', targetPin).query(`
            EXEC PFA.dbo.sp_GetCurrentValueOfMandatory @pin = @pin
            `);

        const mandatoryRecord = mandatoryRes.recordset?.[0] || mandatoryRes.recordsets?.[0]?.[0];
        const mandatoryGainLoss = mandatoryRecord ? (mandatoryRecord['Gain/Loss'] ?? mandatoryRecord['gain/loss'] ?? mandatoryRecord['GAIN/LOSS']) : null;

        const pppRes = await pool.request().input('pin', targetPin).query(`
            EXEC PFA.dbo.sp_GetCurrentValueOfPPP @pin = @pin
            `);

        const pppRecord = pppRes.recordset?.[0] || pppRes.recordsets?.[0]?.[0];
        const pppGainLoss = pppRecord ? (pppRecord['Gain/Loss'] ?? pppRecord['gain/loss'] ?? pppRecord['GAIN/LOSS']) : null;

        const fundCodeMap = {
            73: "FUND1",
            1: "FUND2",
            74: "FUND3",
            12: "FUND4",
            79: "FUND5",
            84: "FUND6 ACTIVE",
            87: "FUND7 FCY",
        }

        const formatDecimal = (val) => {
            const num = Number(val);
            return isNaN(num) ? 0 : Number(num.toFixed(2));
        };

        const records = result.recordsets[0] || [];
        const fcyFundId = 87;
        const totalAllBalance = records
            .filter(item => item.fund_id !== fcyFundId)
            .reduce((sum, item) => sum + (Number(item.balance) || 0), 0);

        console.log("All records: ", records);

        const fund79Record = records.find(item => item.fund_id === 79);
        const balanceVoluntary = fund79Record ? (fund79Record.balance || 0) : 0;

        const growthVoluntary = fund79Record
            ? (fund79Record['gain/loss'] !== undefined ? fund79Record['gain/loss'] : (fund79Record['Gain/Loss'] !== undefined ? fund79Record['Gain/Loss'] : 0))
            : 0;

        const growthMandatory = records
            .filter(item => item.fund_id !== 79)
            .reduce((sum, item) => {
                const gainLoss = item['gain/loss'] !== undefined ? item['gain/loss'] : (item['Gain/Loss'] !== undefined ? item['Gain/Loss'] : 0);
                return sum + (Number(gainLoss) || 0);
            }, 0);
        // Placeholder declarations to prevent ReferenceError
        let totalContributionVoluntary = 0;
        let netContributionMandatory = 0;
        let totalUnitMandatory = 0;
        let totalUnitVoluntary = 0;
        let balanceMandatory = 0;

        let totalBalance = 0;

        const fundIdResult = await pool.request()
            .input('pin', targetPin)
            .query(`
                SELECT PFA.dbo.cvi_getMemberFund2(@pin) AS fund_id
            `);
        const primaryFundId = fundIdResult.recordset && fundIdResult.recordset[0] ? fundIdResult.recordset[0].fund_id : null;
        console.log("fundId: ", primaryFundId);

        const fcyExists = records.some((item) => item.fund_id === fcyFundId);

        if (!fcyExists) {
            records.push({
                fund_id: fcyFundId,
                balance: 0,
                "Gain/Loss": 0
            });
        }

        const fcyRecord = records.find(item => item.fund_id === fcyFundId);
        const fcyBalance = fcyRecord ? (Number(fcyRecord.balance) || 0) : 0;

        const allowedFundIds = [
            Number(primaryFundId),
            79,
            87,
        ];

        const threeRecords = records.filter((item) => {
            const fundId = Number(item.Fund_id ?? item.fund_id);
            return allowedFundIds.includes(fundId);
        });

        console.log("Filtered records for allowed fund IDs: ", threeRecords);

        const mappedFunds = threeRecords.map(item => {
            const fId = item.Fund_id !== undefined ? item.Fund_id : item.fund_id;
            const bal = item.Balance !== undefined ? item.Balance : (item.balance !== undefined ? item.balance : 0);
            const gainLoss = item['Gain/Loss'] !== undefined ? item['Gain/Loss'] : (item['gain/loss'] !== undefined ? item['gain/loss'] : 0);
            return {
                FUND_ID: fId,
                FUND_CODE: fundCodeMap[fId] || `FUND ${fId}`,
                BALANCE: formatDecimal(bal),
                GROWTH: formatDecimal(gainLoss)
            };
        });

        const payload =
        {
            PIN: rsaPin,
            FUND_CODE: fundCodeMap[primaryFundId],
            EMPLOYEE_CONTRIBUTION: formatDecimal(employeeContr),
            EMPLOYER_CONTRIBUTION: formatDecimal(employerContr),
            TOTAL_CONTRIBUTION: formatDecimal(employeeContr + employerContr),
            VOLUNTARY_CONTRIBUTION: formatDecimal(balanceVoluntary),
            NET_CONTRIBUTION: formatDecimal(netContributionMandatory),
            UNITS: formatDecimal(totalUnitMandatory),
            CUMULATIVE_VOLUNTARY_UNIT: formatDecimal(totalUnitVoluntary),
            BALANCE: formatDecimal(balanceMandatory),
            RSA_GROWTH: formatDecimal(growthMandatory),
            VOLUNTARY_BALANCE: formatDecimal(balanceVoluntary),
            VOLUNTARY_GROWTH: formatDecimal(growthVoluntary),
            TOTAL_UNITS: formatDecimal(Number(totalUnitMandatory || 0) + Number(totalUnitVoluntary || 0)),
            TOTAL_BALANCE: formatDecimal(totalAllBalance),
            TOTAL_GROWTH: formatDecimal(Number(mandatoryGainLoss || 0) + Number(pppGainLoss || 0)),
            FCY_BALANCE: formatDecimal(fcyBalance),
            FUNDS: mappedFunds
        }

        console.log("Constructed payload: ", payload);
        res.json(payload);

    } catch (error) {
        console.error('Error fetching from pension API:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Message:', error.message);
        }

        res.status(error.response?.status || 500).json({
            error: 'Failed to fetch summary',
            details: error.response?.data || error.message
        });
    }


}

const contSummary = async (req, res) => {
    const { pin } = req.params;
    const cleanPin = pin ? pin.trim() : "";
    const npin = normalizePin(cleanPin);
    console.log("Processing contributionSummary for PIN:", npin);

    const pool = await getConnection();
    const pinSearchResult = await pool
        .request()
        .input('pin', npin)
        .query(
            `SELECT PIN AS rsaPin FROM PFA.DBO.EMPLOYEES WHERE PIN = @pin OR MOBILE_PHONE = @pin`)

    const { rsaPin } = pinSearchResult.recordset[0] || {};
    console.log("PIN search result - rsaPin:", rsaPin);
    const results = await pool
        .request()
        .input('pin', rsaPin)
        .query(
            `SELECT SUM(ISNULL(EMPLOYEE_CONTRIBUTION, 0)) AS employeeContr,
                        SUM(ISNULL(EMPLOYER_CONTRIBUTION, 0)) AS employerContr
                        FROM PFA.DBO.CONTRIBUTION WHERE PIN = @pin`)

    const { employeeContr, employerContr } = results.recordset[0];

    console.log("Database query results - rsaPin:", rsaPin, "employeeContr:", employeeContr, "employerContr:", employerContr);

    try {
        // const { pin } = req.params;

        // const pool = await getConnection();

        const date = dateFormate('yyyy-mm-dd', new Date());

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
        FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
        WHERE C.FUND_ID IN (73,1,74,12, 79,84)

        AND E.PIN IN (@pin)

        GROUP BY C.FUND_ID,  E.PIN

        HAVING SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) > 0

        `);

        //res.json(fundid)

        if (result.recordset.length == 0) {

            res.json({ code: 400 })

        } else {
            const fundid = result.recordset[0]['FUND_CODE']

            if (fundid == "FUND1") {


                const fundCode = await pool.request()
                    .query(`

            SELECT  TOP 1 SCHEME_ID AS FUND_ID,
            'FUND_CODE' = CASE 
                                 WHEN SCHEME_ID = 73 THEN 'FUND1'

                                 ELSE 'OTHERS'

                                 END,

            BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY

            WHERE  SCHEME_ID IN (73)

            ORDER BY VALUATION_DATE DESC
            `)

                //res.json(fundCode.recordsets)

                const price = fundCode.recordset[0]['BID_PRICE']

                const results = await pool.request()
                    .input('pin', pin)
                    .input('price', price)
                    .query(`SELECT 
                E.PIN,

                'FUND_CODE' = CASE                   
                             WHEN C.FUND_ID = 73 THEN 'FUND1'
                             ELSE 'UNKNOWN'
                             END,
                 SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)) AS "EMPLOYEE_CONTRIBUTION",
                        SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)) AS "EMPLOYER_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                        SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "NET_CONTRIBUTION",
                         SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS UNITS,
                         SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],


                'BALANCE' = CASE    
                            WHEN C.FUND_ID = 73 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) *  @price

                            END,

                            (CASE
                                WHEN C.FUND_ID = 73 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                                END) - SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) - SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS [RSA_GROWTH],

                'VOLUNTARY_BALANCE' = CASE
                            WHEN C.FUND_ID = 73 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
                            END,

                            (CASE
                                WHEN C.FUND_ID = 73 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price

                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                'TOTAL_BALANCE' = CASE

                        WHEN C.FUND_ID = 73 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price

                            END,
                            (CASE
                                 WHEN C.FUND_ID = 73 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                                 END) - (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH]


                FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                WHERE C.FUND_ID IN (73)
                AND E.PIN IN (@pin)

                GROUP BY E.PIN,FUND_ID
                HAVING SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) > 0

                ORDER BY E.PIN 


            `);


                res.json(results.recordsets[0][0])




            }
            if (fundid == "FUND2") {


                const fundCode = await pool.request()
                    .query(`

        SELECT  TOP 1 SCHEME_ID AS FUND_ID,
        'FUND_CODE' = CASE 
                             WHEN SCHEME_ID = 1 THEN 'FUND2'

                             ELSE 'OTHERS'

                             END,

        BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY

        WHERE  SCHEME_ID IN (1)

        ORDER BY VALUATION_DATE DESC
        `)

                //res.json(fundCode.recordsets)

                const price = fundCode.recordset[0]['BID_PRICE']

                const results = await pool.request()
                    .input('pin', pin)
                    .input('price', price)
                    .query(`SELECT 
                E.PIN,

                'FUND_CODE' = CASE                   
                             WHEN C.FUND_ID = 1 THEN 'FUND2'
                             ELSE 'UNKNOWN'
                             END,
                 SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)) AS "EMPLOYEE_CONTRIBUTION",
                        SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)) AS "EMPLOYER_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                        SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "NET_CONTRIBUTION",
                         SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS UNITS,
                         SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],


                'BALANCE' = CASE    
                            WHEN C.FUND_ID = 1 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) *  @price

                            END,

                            (CASE
                                WHEN C.FUND_ID = 1 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                                END) - SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) - SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS [RSA_GROWTH],

                'VOLUNTARY_BALANCE' = CASE
                            WHEN C.FUND_ID = 1 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
                            END,
                            (CASE
                                WHEN C.FUND_ID = 1 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price

                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                'TOTAL_BALANCE' = CASE

                        WHEN C.FUND_ID = 1 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price

                            END,
                            (CASE
                                 WHEN C.FUND_ID = 1 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                                 END) - (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH]
                FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                WHERE C.FUND_ID IN (1)
                AND E.PIN IN (@pin)

                GROUP BY E.PIN,FUND_ID
                HAVING SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) > 0

                ORDER BY E.PIN 


        `);


                res.json(results.recordsets[0][0])



            }
            if (fundid == "FUND3") {


                const fundCode = await pool.request()
                    .query(`

                SELECT  TOP 1 SCHEME_ID AS FUND_ID,
                'FUND_CODE' = CASE 
                                     WHEN SCHEME_ID = 74 THEN 'FUND3'

                                     ELSE 'OTHERS'

                                     END,

                BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY

                WHERE  SCHEME_ID IN (74)

                ORDER BY VALUATION_DATE DESC
                `)

                //res.json(fundCode.recordsets)

                const price = fundCode.recordset[0]['BID_PRICE']

                const results = await pool.request()
                    .input('pin', pin)
                    .input('price', price)
                    .query(`SELECT 
                E.PIN,

                'FUND_CODE' = CASE                   
                             WHEN C.FUND_ID = 74 THEN 'FUND3'
                             ELSE 'UNKNOWN'
                             END,
                 SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)) AS "EMPLOYEE_CONTRIBUTION",
                        SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)) AS "EMPLOYER_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                        SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "NET_CONTRIBUTION",
                         SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS UNITS,
                         SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],


                'BALANCE' = CASE    
                            WHEN C.FUND_ID = 74 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) *  @price

                            END,

                            (CASE
                                WHEN C.FUND_ID = 74 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                                END) - SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) - SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS [RSA_GROWTH],

                'VOLUNTARY_BALANCE' = CASE
                            WHEN C.FUND_ID = 74 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
                            END,
                            (CASE
                                WHEN C.FUND_ID = 74 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price

                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                'TOTAL_BALANCE' = CASE

                        WHEN C.FUND_ID = 74THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price

                            END,
                            (CASE
                                 WHEN C.FUND_ID = 74 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                                 END)- (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH]
                                 FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                WHERE C.FUND_ID IN (74)


                AND E.PIN IN (@pin)

                GROUP BY E.PIN,FUND_ID
                HAVING SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) > 0

                ORDER BY E.PIN 

                `);

                res.json(results.recordsets[0][0])




            }
            if (fundid == "FUND4") {


                const fundCode = await pool.request()
                    .query(`

            SELECT  TOP 1 SCHEME_ID AS FUND_ID,
            'FUND_CODE' = CASE 
                                 WHEN SCHEME_ID = 12 THEN 'FUND4'

                                 ELSE 'OTHERS'

                                 END,

            BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY

            WHERE  SCHEME_ID IN (12)

            ORDER BY VALUATION_DATE DESC
            `)

                //res.json(fundCode.recordsets)

                const price = fundCode.recordset[0]['BID_PRICE']

                const results = await pool.request()
                    .input('pin', pin)
                    .input('price', price)
                    .query(`SELECT 
                E.PIN,

                'FUND_CODE' = CASE                   
                             WHEN C.FUND_ID = 12 THEN 'FUND4'
                             ELSE 'UNKNOWN'
                             END,
                 SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)) AS "EMPLOYEE_CONTRIBUTION",
                        SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)) AS "EMPLOYER_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                        SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "NET_CONTRIBUTION",
                         SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS UNITS,
                         SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],


                'BALANCE' = CASE    
                            WHEN C.FUND_ID = 12 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) *  @price

                            END,

                            (CASE
                                WHEN C.FUND_ID = 12 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                                END) - SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) - SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS [RSA_GROWTH],

                'VOLUNTARY_BALANCE' = CASE
                            WHEN C.FUND_ID = 12 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
                            END,
                            (CASE
                                WHEN C.FUND_ID = 12 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price

                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                'TOTAL_BALANCE' = CASE

                        WHEN C.FUND_ID = 12 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price

                            END,
                            (CASE
                                 WHEN C.FUND_ID = 12 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                            END)- (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH]
                FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                WHERE C.FUND_ID IN (12)
                AND E.PIN IN (@pin)

                GROUP BY E.PIN,FUND_ID
                HAVING SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) > 0

                ORDER BY E.PIN 

            `);

                res.json(results.recordsets[0][0])




            }
            if (fundid == "FUND5") {


                const fundCode = await pool.request()
                    .query(`

                SELECT  TOP 1 SCHEME_ID AS FUND_ID,
                'FUND_CODE' = CASE 
                                     WHEN SCHEME_ID = 79 THEN 'FUND5'

                                     ELSE 'OTHERS'

                                     END,

                BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY

                WHERE  SCHEME_ID IN (79)

                ORDER BY VALUATION_DATE DESC
                `)

                //res.json(fundCode.recordsets)

                const price = fundCode.recordset[0]['BID_PRICE']

                const results = await pool.request()
                    .input('pin', pin)
                    .input('price', price)
                    .query(

                        `SELECT 
                E.PIN,

                'FUND_CODE' = CASE                   
                             WHEN C.FUND_ID = 79 THEN 'FUND5'
                             ELSE 'UNKNOWN'
                             END,
                 SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)) AS "EMPLOYEE_CONTRIBUTION",
                        SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)) AS "EMPLOYER_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                        SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "NET_CONTRIBUTION",
                         SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS UNITS,
                         SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],


                'BALANCE' = CASE    
                            WHEN C.FUND_ID = 79 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) *  @price

                            END,

                            (CASE
                                WHEN C.FUND_ID = 79 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                                END) - SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) - SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS [RSA_GROWTH],

                'VOLUNTARY_BALANCE' = CASE
                            WHEN C.FUND_ID = 79 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
                            END,
                            (CASE
                                WHEN C.FUND_ID = 79 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price

                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                'TOTAL_BALANCE' = CASE

                        WHEN C.FUND_ID = 79 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price

                            END,
                            (CASE
                                 WHEN C.FUND_ID = 79 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                                 END) - (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH]
                FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                WHERE C.FUND_ID IN (79)
                AND E.PIN IN (@pin)

                GROUP BY E.PIN,FUND_ID
                HAVING SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) > 0

                ORDER BY E.PIN 

                `);

                res.json(results.recordsets[0][0])

            }
            if (fundid == "FUND6 ACTIVE") {

                const fundCode = await pool.request()
                    .query(`

                SELECT  TOP 1 SCHEME_ID AS FUND_ID,
                'FUND_CODE' = CASE 
                                     WHEN SCHEME_ID = 84 THEN 'FUND6'

                                     ELSE 'OTHERS'

                                     END,

                BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY

                WHERE  SCHEME_ID IN (84)

                ORDER BY VALUATION_DATE DESC
                `)

                //res.json(fundCode.recordsets)

                const price = fundCode.recordset[0]['BID_PRICE']

                const results = await pool.request()
                    .input('pin', pin)
                    .input('price', price)
                    .query(

                        `SELECT 
                E.PIN,

                'FUND_CODE' = CASE                   
                             WHEN C.FUND_ID = 84 THEN 'FUND 6 ACTIVE'
                             ELSE 'UNKNOWN'
                             END,
                 SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)) AS "EMPLOYEE_CONTRIBUTION",
                        SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)) AS "EMPLOYER_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                        SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "NET_CONTRIBUTION",
                         SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS UNITS,
                         SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],


                'BALANCE' = CASE    
                            WHEN C.FUND_ID = 84 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) *  @price

                            END,

                            (CASE
                                WHEN C.FUND_ID = 84 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                                END) - SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) - SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS [RSA_GROWTH],

                'VOLUNTARY_BALANCE' = CASE
                            WHEN C.FUND_ID = 84 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
                            END,
                            (CASE
                                WHEN C.FUND_ID = 84 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price

                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                'TOTAL_BALANCE' = CASE

                        WHEN C.FUND_ID = 84 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price

                            END,
                            (CASE
                                 WHEN C.FUND_ID = 84 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                                 END) - (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH]
                FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                WHERE C.FUND_ID IN (84)
                AND E.PIN IN (@pin)

                GROUP BY E.PIN,FUND_ID
                HAVING SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) > 0

                ORDER BY E.PIN 

                `);

                res.json(results.recordsets[0][0])

            }


        }

    } catch (error) {
        console.log(error);
        Sentry.captureException(error);
        return errorResponse(res, error);
    }

}

const miniStatetsments = async (req, res) => {

    try {

        const { pin } = req.params;
        const pool = getConnection();
        const results = await (await pool)
            .request()
            .input('pin', pin)
            .query(`
            SELECT  TOP 8
                         
                     CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
                    CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE OF RSA REGISTRATION',
                     SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)) AS "EMPLOYEE_CONTRIBUTION",
                    SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)) AS "EMPLOYER_CONTRIBUTION",
                    SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                    SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                     SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS "NET_CONTRIBUTION",
            
                     B.NARRATION,
                     CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
            
                            	, C.VALUE_DATE	  
            
            FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
            INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID                     
                      WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
                    
               
            
                  AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
                 
            
                 
                 --AND B.NARRATION NOT LIKE  '%INTEREST%'
                 AND E.PIN IN (@pin)
                 
                
            
            GROUP BY    E.MOBILE_PHONE, E.TITLE,E.SURNAME, E.FIRSTNAME, E.OTHERNAMES, E.PIN,
            E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
                         E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION
            
            ORDER BY C.VALUE_DATE DESC
            `);


        // let total += results.recordsets[0]['TOTAL CONTRIBUTION']
        let contribution = results.recordsets[0];

        if (contribution.length == 0) {
            return res.json({ msg: 'Your account is unfunded', code: 404 })

        } else {
            return res.json({ contributions: contribution })
        }

    } catch (error) {
        console.log(error);
        Sentry.captureException(error)
    }


}

const getStatement = async (req, res) => {

    try {

        const { pin, from, to } = req.body;
        const pool = getConnection();
        const results = await (await pool)
            .request()
            .input('pin', pin)
            .input('from', from)
            .input('to', to)
            .query(`
                SELECT CONVERT(VARCHAR, E.EMPLOYER_NAME) AS "EMPLOYER_NAME",  
                CONVERT(VARCHAR, DATEPART(DAY, E.DATE_CREATED)) + '-' + SUBSTRING(DATENAME(MONTH, E.DATE_CREATED), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, E.DATE_CREATED)) AS 'DATE_OF_RSA_REGISTRATION',
                SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)) AS "EMPLOYEE_CONTRIBUTION",
                SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)) AS "EMPLOYER_CONTRIBUTION",
                SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS "NET_CONTRIBUTION",
            
                B.NARRATION,
                CONVERT(VARCHAR, DATEPART(DAY, C.VALUE_DATE)) + '-' + SUBSTRING(DATENAME(MONTH, C.VALUE_DATE), 1, 3) + '-' + CONVERT(VARCHAR, DATEPART(YEAR, C.VALUE_DATE)) AS 'FUNDING_DATE'
            
                                , C.VALUE_DATE    
            
            FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN=C.PIN
            INNER JOIN PFA.DBO.CONTRIBUTION_BATCH B ON B.BATCH_ID=C.BATCH_ID                     
                      WHERE    E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%'))
                    
                  AND E.PIN IN (SELECT DISTINCT PIN FROM PFA.DBO.CONTRIBUTION)
                  
                 AND C.VALUE_DATE BETWEEN @from AND @to
                 --AND B.NARRATION NOT LIKE  '%INTEREST%'
                 AND E.PIN IN (@pin)

            GROUP BY    E.MOBILE_PHONE, E.TITLE,E.SURNAME, E.FIRSTNAME, E.OTHERNAMES, E.PIN,
            E.EMPLOYER_RCNO, E.EMPLOYER_NAME,E.TITLE,C.VALUE_DATE,CONVERT(VARCHAR,E.EMPLOYER_ADDRESS),
                         E.CLIENT_STATUS,E.DATE_CREATED, B.NARRATION
            
            ORDER BY C.VALUE_DATE DESC
            `);

        if (results.recordsets[0].length != 0) {


            const balances = await (await pool).request()
                .input('pin', pin)
                .input('from', from)
                .input('to', to)
                .query(

                    `SELECT 
                        'FUND_CODE' = CASE 

                            WHEN C.FUND_ID = 73 THEN 'FUND1'
                            WHEN C.FUND_ID = 1 THEN 'FUND2'
                            WHEN C.FUND_ID = 74 THEN 'FUND3'
                            WHEN C.FUND_ID = 12 THEN 'FUND4'
                            
                            ELSE 'UNKNOWN'
                            END,

                            SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)) AS "EMPLOYEE_CONTRIBUTION",
                               SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)) AS "EMPLOYER_CONTRIBUTION",
                               SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                               SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                               SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0))) AS "NET_CONTRIBUTION",
                               SUM(ISNULL(C.TRANS_UNITS_R, 0.0000) + ISNULL(C.TRANS_UNITS_V, 0.0000)) AS UNITS


                            FROM PFA.DBO.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                            WHERE C.FUND_ID IN (73,1,74,12)
                            AND C.VALUE_DATE BETWEEN @from AND @to
                            AND E.PIN = @pin

                            GROUP BY E.PIN, C.FUND_ID
                        
                        `);

            if (results.recordsets[0].length > 0) {

                return res.json({ data: results.recordsets[0], balance: balances.recordsets[0] })

            }

        } else {
            return res.json({ msg: "no record found" })
        }

    } catch (error) {
        console.log(error);
        Sentry.captureException(error)
    }


}



module.exports = { contSummary, contSummaryNew, miniStatetsments, getStatement }


