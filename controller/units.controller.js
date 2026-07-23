const { getConnection } = require("../database/connection")
const sql = require('mssql')
const dateFormate = require('date-format')


getUnits =  async  (req, res)=>{


   const {valueDate} = req.params
 const pool = getConnection()
 const units = await (await pool).request().input('valueDate', valueDate).query(`
 SELECT distinct TOP 7 VALUATION_DATE AS FUND_ID,
 'FUND_CODE' = CASE 

                      WHEN SCHEME_ID = 73 THEN 'FUND1'
                      WHEN SCHEME_ID = 1 THEN 'FUND2'
                      WHEN SCHEME_ID= 74 THEN 'FUND3'
                      WHEN SCHEME_ID = 12 THEN 'FUND4'
                      WHEN SCHEME_ID= 79 THEN 'FUND5'
                      WHEN SCHEME_ID= 84 THEN 'FUND6 ACTIVE'
                     
                      ELSE 'OTHERS'
 
                      END,
 
 BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
 
 
 
 ORDER BY VALUATION_DATE DESC
                      
 
 `)

  units.recordsets[0].pop();
   res.json({units:units.recordsets[0]})

}

module.exports =  {getUnits}