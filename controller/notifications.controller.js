const Sentry = require('@sentry/node');
const { getConnection } = require("../database/connection")
const sql = require('mssql');
const normalizePin = require('../users/utility/normalizePin');


const getNotifications = async (req, res) => {

    try {

        const pool = await getConnection();

        const npin = req.params.pin;
        const pin = normalizePin(npin);

        const notifications = await pool.request()
            .input('pin', pin)
            .query(`SELECT SenderID, RSAPIN, Message, DeliveryDate
                        
                        
                        FROM SMS_SERVER.SmartSMSNotification.dbo.tbl_SMS2MEMBER WHERE RSAPIN = @pin 
                                and ChannelCode not like 'MOBILE'
                                and ChannelCode not like 'MOTP' 
                                and ChannelCode not like 'RECAPTURE'
                                ORDER by DeliveryDate DESC  `)

        res.json(notifications.recordsets[0])

    }
    catch (err) {
        console.log(err.message);
        Sentry.captureException(err.message)
    }




}

module.exports = { getNotifications }