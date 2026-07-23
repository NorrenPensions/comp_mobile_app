const { getConnection } = require("../../database/connection")
const sql = require('mssql')
const dateFormate = require('date-format')
const https = require('follow-redirects').https;
const fs = require('fs');
const normalizePin = require("../utility/normalizePin");


const getRecaptures = async (req, res) => {

	try {
		const npin = req.params.pin;
        const pin = normalizePin(npin);
		const pool = await getConnection();

		const status = await pool.request()
			.input('pin', pin)
			.query(`SELECT E.PIN, EM.PassedFirstLevel, EM.PassedSecondLevel, EM.PassedThirdLevel,  'RECAPTURE STATUS' = case
                 when E.PIN  IN (SELECT PIN FROM DataRecapture.DBO.EMPLOYEES) THEN 'CAPTURED'

				 when E.pin LIKE 'PEN11%' then 'ECRS PIN'

				 when E.pin LIKE 'PEN21%' then 'ECRS PIN'

				 when E.pin in (SELECT DISTINCT PIN FROM PFA.DBO.TRANSFER_SUMMARY_IN) THEN 'DATA VERIFIED'
				 
                  ELSE 'UNCAPTURED'				  
				  END, 			  
				  'PENCOM ACCEPTED STATUS' = case
                  when EM.AcceptedByPencom = 1 THEN 'ACCEPTED BY PENCOM'
                  ELSE 'UNACCEPTED BY PENCOM'
              END
			  FROM PFA.DBO.EMPLOYEES E LEFT OUTER JOIN DataRecapture.DBO.Employees EM ON E.PIN=EM.PIN
			WHERE   E.PIN LIKE 'PEN%' AND E.PIN_INVALID = 0 AND ((E.PIN NOT LIKE 'PENTCF%') AND (E.PIN NOT LIKE 'PENJGW%') and (e.pin not like 'PENDBA%'))
			  AND E.PIN   IN (SELECT PIN FROM DataRecapture.DBO.EMPLOYEES)
			and E.PIN = @pin`)

		const errorCheck = await pool.request()
			.input("pin", pin)
			.query(`SELECT PENCOM_ERROR_MESSAGE FROM DataRecapture.DBO.XML_VALIDATION_ERRORS WHERE pin =@pin `)

		if (errorCheck.recordsets[0][0] == null) {

			checkIfTransfer = await pool.request().input('pin', pin).query(`SELECT DISTINCT PIN FROM PFA.DBO.TRANSFER_SUMMARY_IN WHERE PIN =@pin`)

			return res.json({ status: status.recordsets[0][0], error: "NONE", transfared: checkIfTransfer.recordset[0] })


		} else {
			return res.json({ status: status.recordsets[0][0], error: errorCheck.recordsets[0][0] })
		}


	} catch (err) {
		return res.json({ err: err })
	}

}



module.exports = { getRecaptures }






