const Sentry = require('@sentry/node');
const { getConnection } = require("../../database/connection")
const sql = require('mssql')
const bcrypt = require('bcryptjs')
const dateFormate = require('date-format')
const nodemailer = require("nodemailer");
const formatPhoneNumber = require('../utility/formatPhoneNum');
const normalizePin = require('../utility/normalizePin');

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

const genOtp = async (req, res) => {
    try {
        const min = 200000;
        const max = 900000;
        const otp = Math.floor(Math.random() * (max - min + 1)) + min;

        const { phone, pin: npin } = req.body;
        const pin = normalizePin(npin);
        const phoneNum = formatPhoneNumber(phone);
        const createDate = new Date();

        const channel = "MOTP";
        const senderID = "NorrenPens";
        const msg = `Your One Time Password (OTP) for Norrenberger Mobile Login is: ${otp}`;

        console.log("LoginOTP-for-pin: ", otp, pin, phoneNum)
        const pool = await getConnection();

        /** 1. Get user email */
        const emailResult = await pool
            .request()
            .input('pin', pin)
            .query(`SELECT EMAIL FROM PFA.DBO.EMPLOYEES WHERE PIN = @pin`);

        const email = emailResult.recordset?.[0]?.EMAIL;

        /** 2. Save OTP (PLAIN) */
        await pool.request()
            .input('otp', otp)
            .input('pin', pin)
            .input('createDate', sql.DateTime, createDate)
            .query(`
        UPDATE IEIMobileDB.DBO.APPUSERS
        SET PHONE_VER = @otp, OTP_CREATED_AT = @createDate
        WHERE PIN = @pin
      `);

        /** 3. Send Email (if available) */
        const emailPromise = email
            ? transporter.sendMail({
                from: "Norrenberger Pensions <noreply-npl@norrenpensions.com>",
                to: email,
                subject: "Account Verification",
                html: `
            <b>Dear Esteemed Customer,</b><br>
            <p>Use the OTP below to verify your account:</p>
            <strong style="padding:4px;font-size:1.2em;background:#0047ab;color:#fff">
              ${otp}
            </strong>
          `
            })
            : Promise.resolve("No email");

        /** 4. Send SMS */
        const smsPromise = pool.request()
            .input('pin', sql.VarChar(20), pin)
            .input('phone', sql.VarChar(15), phoneNum)
            .input('msg', sql.VarChar(250), msg)
            .input('channel', sql.VarChar(20), channel)
            .input('senderID', sql.VarChar(20), senderID)
            .query(`
        INSERT INTO SMS_SERVER.SmartSMSNotification.dbo.tbl_SMS2MEMBER
        (senderID, RSAPIN, PhoneNo, Message, ChannelCode)
        VALUES (@senderID, @pin, @phone, @msg, @channel)
      `);

        /** 5. Execute both */
        const [emailResultSend, smsResultSend] = await Promise.allSettled([
            emailPromise,
            smsPromise
        ]);

        console.log("EmailStatusSend: ", emailResultSend);
        console.log("SMSStatusSend: ", smsResultSend);

        return res.json({
            msg: "OTP sent",
            status: 201
        });

    } catch (err) {
        console.error("OTP Generation Error:", err);
        return res.status(500).json({ error: err.message });
    }
};


const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const pin = normalizePin(req.body.pin);
        const upDate = new Date();

        const pool = await getConnection();

        /** 1. Get OTP details */
        const verifyData = await pool.request()
            .input('pin', pin)
            .query(`SELECT PHONE_VER, OTP_CREATED_AT FROM IEIMobileDB.DBO.APPUSERS WHERE PIN = @pin`);

        const db_otp = verifyData.recordset?.[0]?.PHONE_VER;
        const createdAt = verifyData.recordset?.[0]?.OTP_CREATED_AT;

        if (!db_otp || db_otp !== otp) {
            return res.status(400).json({ msg: "Invalid OTP", code: 400 });
        }

        if (createdAt) {
            const now = new Date();
            const diffInMinutes = (now - new Date(createdAt)) / 1000 / 60;
            if (diffInMinutes > 10) {
                return res.status(400).json({ msg: "OTP has expired", code: 400 });
            }
        }

        /** 2. Atomic update */
        const result = await pool.request()
            .input('pin', pin)
            .input('upDate', sql.DateTime, upDate)
            .query(`
        UPDATE IEIMobileDB.DBO.APPUSERS
        SET PHONE_VER = NULL,
            VERIFIED_AT = @upDate,
            UPDATED_AT = @upDate,
            IS_VERIFIED = 1
        WHERE PIN = @pin
      `);

        if (result.rowsAffected[0] === 0) {
            return res.status(400).json({
                msg: "Invalid or expired OTP"
            });
        }

        return res.status(200).json({
            msg: "Verification successful",
            code: 200
        });

    } catch (err) {
        console.error("OTP Verify Error:", err);
        return res.status(500).json({
            msg: "Internal server error",
            code: 500
        });
    }
};


const genUnlockOtp = async (req, res) => {
    try {
        const { phone, model, brand, pin: npin } = req.body;
        const pin = normalizePin(npin);
        const phoneNum = formatPhoneNumber(phone);

        const min = 200000;
        const max = 900000;
        const otp = Math.floor(Math.random() * (max - min + 1)) + min;

        const msg = `Your One Time Password (OTP) is: ${otp} to unlock device on ${brand} ${model}`;
        const channel = "MOTP";
        const senderID = "NorrenPens";
        const createDate = new Date();

        console.log("UnlockOTP-for-pin: ", otp, pin)
        const pool = await getConnection();

        /** 1. Check account */
        const userCheck = await pool.request()
            .input('pin', pin)
            .query(`SELECT PIN FROM IEIMobileDB.dbo.APPUSERS WHERE PIN = @pin`);

        if (!userCheck.recordset.length) {
            return res.status(400).json({
                error: "Account not found! Sign up instead"
            });
        }

        /** 2. Get email */
        const emailResult = await pool.request()
            .input('pin', pin)
            .query(`SELECT EMAIL FROM PFA.DBO.EMPLOYEES WHERE PIN = @pin`);

        const email = emailResult.recordset?.[0]?.EMAIL;

        /** 3. Save OTP */
        await pool.request()
            .input('otp', otp)
            .input('pin', pin)
            .input('createDate', sql.DateTime, createDate)
            .query(`
        UPDATE IEIMobileDB.DBO.APPUSERS
        SET DEVICE_VERIFICATION = @otp,
            OTP_CREATED_AT = @createDate,
            UPDATED_AT = @createDate
        WHERE PIN = @pin
      `);

        /** 4. Send email (if available) */
        const emailPromise = email
            ? transporter.sendMail({
                from: "Norrenberger Pensions <noreply-npl@norrenpensions.com>",
                to: email,
                subject: "Device Unlock",
                html: `
            <b>Dear Esteemed Customer,</b><br>
            <p>
              You are trying to access your account on
              <strong>${brand} ${model}</strong>.
            </p>
            <p>Your OTP:</p>
            <strong style="padding:4px;font-size:1.2em;background:#0047ab;color:#fff">
              ${otp}
            </strong>
          `
            })
            : Promise.resolve("No email");

        /** 5. Send SMS */
        const smsPromise = pool.request()
            .input('pin', sql.VarChar(20), pin)
            .input('phone', sql.VarChar(15), phoneNum)
            .input('msg', sql.VarChar(250), msg)
            .input('channel', sql.VarChar(20), channel)
            .input('senderID', sql.VarChar(20), senderID)
            .query(`
        INSERT INTO SMS_SERVER.SmartSMSNotification.dbo.tbl_SMS2MEMBER
        (senderID, RSAPIN, PhoneNo, Message, ChannelCode)
        VALUES (@senderID, @pin, @phone, @msg, @channel)
      `);

        const [emailStatus, smsStatus] = await Promise.allSettled([
            emailPromise,
            smsPromise
        ]);

        console.log("EmailStatus: ", emailStatus);
        console.log("SMSStatus: ", smsStatus);

        return res.status(201).json({
            msg: "OTP sent",
            status: 201
        });

    } catch (err) {
        console.error("UNLOCK-OTP ERROR:", err);
        return res.status(500).json({ error: err.message });
    }
};


const verifyOtpUnlock = async (req, res) => {
    try {
        const { otp, device, platform } = req.body;
        const pin = normalizePin(req.body.pin);
        const upDate = new Date();

        const pool = await getConnection();

        /** 1. Get OTP details */
        const verifyData = await pool.request()
            .input('pin', pin)
            .query(`SELECT DEVICE_VERIFICATION, OTP_CREATED_AT FROM IEIMobileDB.DBO.APPUSERS WHERE PIN = @pin`);

        const db_otp = verifyData.recordset?.[0]?.DEVICE_VERIFICATION;
        const createdAt = verifyData.recordset?.[0]?.OTP_CREATED_AT;

        if (!db_otp || db_otp !== otp) {
            return res.status(400).json({ mag: "Invalid OTP", code: 400 });
        }

        if (createdAt) {
            const now = new Date();
            const diffInMinutes = (now - new Date(createdAt)) / 1000 / 60;
            if (diffInMinutes > 10) {
                return res.status(400).json({ mag: "OTP has expired", code: 400 });
            }
        }

        /** 2. Atomic update */
        const result = await pool.request()
            .input('pin', pin)
            .input('upDate', sql.DateTime, upDate)
            .input('device', device)
            .input('platform', platform)
            .query(`
        UPDATE IEIMobileDB.DBO.APPUSERS
        SET DEVICE_VERIFICATION = NULL,
            DEVICE_ID = @device,
            DEVICE_PLATFORM = @platform,
            UPDATED_AT = @upDate
        WHERE PIN = @pin
      `);

        if (result.rowsAffected[0] === 0) {
            console.log("Invalid token provided");
            return res.status(400).json({
                mag: "Invalid or expired OTP"
            });
        }

        console.log("Valid token provided");
        return res.status(200).json({
            mag: "Device unlock successful",
            code: 200
        });

    } catch (err) {
        console.log('OTP Unlock Verification Error: ', err);
        res.json({ mag: err.message });
    }
};


const genPassOtp = async (req, res) => {
    try {
        const min = 200000;
        const max = 900000;
        const otp = Math.floor(Math.random() * (max - min + 1)) + min;

        const { phone, pin: npin } = req.body;
        const pin = normalizePin(npin);
        const phoneNum = formatPhoneNumber(phone);
        const createDate = new Date();

        const msg = `Your One Time Password (OTP) for Norrenberger Mobile Password update is: ${otp}`;
        const channel = "MOTP";
        const senderID = "NorrenPens";

        console.log("PasswordOTP-for-pin: ", otp, pin, phoneNum)
        const pool = await getConnection();

        /** 1. Check user exists */
        const userCheck = await pool.request()
            .input('pin', pin)
            .query(`SELECT PIN FROM IEIMobileDB.dbo.APPUSERS WHERE PIN = @pin`);

        if (!userCheck.recordset.length) {
            return res.status(400).json({
                error: "Account not found! Sign up instead"
            });
        }

        /** 2. Get email */
        const emailResult = await pool.request()
            .input('pin', pin)
            .query(`SELECT EMAIL FROM PFA.DBO.EMPLOYEES WHERE PIN = @pin`);

        const email = emailResult.recordset?.[0]?.EMAIL;

        /** 3. Save OTP (plain) */
        await pool.request()
            .input('otp', otp)
            .input('pin', pin)
            .input('createDate', sql.DateTime, createDate)
            .query(`
        UPDATE IEIMobileDB.DBO.APPUSERS
        SET UPDATE_PASS_TOKEN = @otp,
            OTP_CREATED_AT = @createDate,
            UPDATED_AT = @createDate
        WHERE PIN = @pin
      `);

        /** 4. Send email (if available) */
        const emailPromise = email
            ? transporter.sendMail({
                from: "Norrenberger Pensions <noreply-npl@norrenpensions.com>",
                to: email,
                subject: "Update Password",
                html: `
            <b>Dear Esteemed Customer,</b><br>
            <p>Use the OTP below to update your password:</p>
            <strong style="padding:4px;font-size:1.2em;background:#0047ab;color:#fff">
              ${otp}
            </strong>
          `
            })
            : Promise.resolve("No email");

        /** 5. Send SMS */
        const smsPromise = pool.request()
            .input('pin', sql.VarChar(20), pin)
            .input('phone', sql.VarChar(15), phoneNum)
            .input('msg', sql.VarChar(250), msg)
            .input('channel', sql.VarChar(20), channel)
            .input('senderID', sql.VarChar(20), senderID)
            .query(`
        INSERT INTO SMS_SERVER.SmartSMSNotification.dbo.tbl_SMS2MEMBER
        (senderID, RSAPIN, PhoneNo, Message, ChannelCode)
        VALUES (@senderID, @pin, @phone, @msg, @channel)
      `);

        const [emailStatus, smsStatus] = await Promise.allSettled([
            emailPromise,
            smsPromise
        ]);

        return res.json({
            mag: "OTP sent",
            status: 201
        });

    } catch (err) {
        console.error("Error Gen Password OTP:", err);
        return res.status(500).json({ mag: err.message });
    }
};


const verifyUpassOtp = async (req, res) => {

    const { otp } = req.body;
    const npin = req.body.pin;
    const pin = normalizePin(npin);
    const pool = await getConnection();
    try {
        const upDate = new Date();

        /** 1. Get OTP details */
        const verifyData = await pool.request()
            .input('pin', pin)
            .query(`SELECT UPDATE_PASS_TOKEN, OTP_CREATED_AT FROM IEIMobileDB.DBO.APPUSERS WHERE PIN = @pin`);

        const db_otp = verifyData.recordset?.[0]?.UPDATE_PASS_TOKEN;
        const createdAt = verifyData.recordset?.[0]?.OTP_CREATED_AT;

        if (!db_otp || db_otp !== otp) {
            console.log({ mag: "Invalid Token provided", code: 400 });
            return res.status(400).json({ mag: "Invalid Token provided", code: 400 });
        }

        if (createdAt) {
            const now = new Date();
            const diffInMinutes = (now - new Date(createdAt)) / 1000 / 60;
            if (diffInMinutes > 10) {
                return res.status(400).json({ mag: "OTP has expired", code: 400 });
            }
        }

        /** 2. Atomic update */
        const result = await pool.request()
            .input('upDate', sql.DateTime, upDate)
            .input('pin', pin)
            .query(`
        UPDATE IEIMobileDB.DBO.APPUSERS
        SET UPDATE_PASS_TOKEN = NULL,
            UPDATED_AT = @upDate
        WHERE PIN = @pin
      `);

        if (result.rowsAffected[0] > 0) {
            console.log({ mag: "Verification successful!!!", code: 200 });
            return res.status(200).json({ mag: "Verification successful!!!", code: 200 });
        } else {
            return res.status(400).json({ mag: "Verification failed", code: 400 });
        }

    } catch (err) {
        console.log("Password Update Verification error: ", err);
        return res.json({ mag: err.message })

    }

}


module.exports = { genOtp, verifyOtp, verifyUpassOtp, genPassOtp, genUnlockOtp, verifyOtpUnlock }



// const Sentry = require('@sentry/node');
// const { getConnection } = require("../../database/connection")
// const sql = require('mssql')
// const bcrypt = require('bcryptjs')
// const dateFormate = require('date-format')
// const nodemailer = require("nodemailer");
// const formatPhoneNumber = require('../utility/formatPhoneNum');
// const normalizePin = require('../utility/normalizePin');

// const transporter = nodemailer.createTransport({
//     host: 'smtp.office365.com',
//     port: 587,
//     auth: {
//         user: 'noreply-npl@norrenpensions.com',
//         pass: 'G3n3r@l.comm'
//     },
//     tls: {
//         rejectUnauthorized: false
//     }
// });

// const genOtp = async (req, res) => {
//     try {
//         const min = 200000;
//         const max = 900000;
//         const otp = Math.floor(Math.random() * (max - min + 1)) + min;

//         const { phone, pin: npin } = req.body;
//         const pin = normalizePin(npin);
//         const phoneNum = formatPhoneNumber(phone);
//         const createDate = dateFormate.asString('yyyy-mm-dd hh:mm:ss.SSS', new Date());

//         const channel = "MOTP";
//         const senderID = "NorrenPens";
//         const msg = `Your OTP Mobile Login is: ${otp}. It expires in 10 minutes.`;

//         console.log("LoginOTP-for-pin: ", otp, pin, phoneNum)
//         const pool = await getConnection();

//         /** 1. Get user email */
//         const emailResult = await pool
//             .request()
//             .input('pin', pin)
//             .query(`SELECT EMAIL FROM PFA.DBO.EMPLOYEES WHERE PIN = @pin`);

//         const email = emailResult.recordset?.[0]?.EMAIL;

//         /** 2. Save OTP (PLAIN) */
//         await pool.request()
//             .input('otp', otp)
//             .input('pin', pin)
//             .input('createDate', createDate)
//             .query(`
//         UPDATE IEIMobileDB.DBO.APPUSERS
//         SET PHONE_VER = @otp, OTP_CREATED_AT = @createDate
//         WHERE PIN = @pin
//       `);

//         /** 3. Send Email (if available) */
//         const emailPromise = email
//             ? transporter.sendMail({
//                 from: "Norrenberger Pensions <noreply-npl@norrenpensions.com>",
//                 to: email,
//                 subject: "Account Verification",
//                 html: `
//             <b>Dear Esteemed Customer,</b><br>
//             <p>Use the OTP below to verify your account:</p>
//             <strong style="padding:4px;font-size:1.2em;background:#0047ab;color:#fff">
//               ${otp}
//             </strong>. Expires in 10 minutes.
//           `
//             })
//             : Promise.resolve("No email");

//         /** 4. Send SMS */
//         const smsPromise = pool.request()
//             .input('pin', sql.VarChar(20), pin)
//             .input('phone', sql.VarChar(15), phoneNum)
//             .input('msg', sql.VarChar(250), msg)
//             .input('channel', sql.VarChar(20), channel)
//             .input('senderID', sql.VarChar(20), senderID)
//             .query(`
//         INSERT INTO SMS_SERVER.SmartSMSNotification.dbo.tbl_SMS2MEMBER
//         (senderID, RSAPIN, PhoneNo, Message, ChannelCode)
//         VALUES (@senderID, @pin, @phone, @msg, @channel)
//       `);

//         /** 5. Execute both */
//         const [emailResultSend, smsResultSend] = await Promise.allSettled([
//             emailPromise,
//             smsPromise
//         ]);

//         console.log("EmailStatusSend: ", emailResultSend);
//         console.log("SMSStatusSend: ", smsResultSend);

//         return res.json({
//             msg: "OTP sent",
//             status: 201
//         });

//     } catch (err) {
//         console.error("OTP Generation Error:", err);
//         return res.status(500).json({ error: err.message });
//     }
// };


// const verifyOtp = async (req, res) => {
//     try {
//         const { otp } = req.body;
//         const pin = normalizePin(req.body.pin);
//         const upDate = dateFormate.asString(
//             'yyyy-mm-dd hh:mm:ss.SSS',
//             new Date()
//         );

//         const pool = await getConnection();

//         /** 1. Get OTP details */
//         const verifyData = await pool.request()
//             .input('pin', pin)
//             .query(`SELECT PHONE_VER, OTP_CREATED_AT FROM IEIMobileDB.DBO.APPUSERS WHERE PIN = @pin`);

//         const db_otp = verifyData.recordset?.[0]?.PHONE_VER;
//         const createdAt = verifyData.recordset?.[0]?.OTP_CREATED_AT;

//         if (!db_otp || db_otp !== otp) {
//             return res.status(400).json({ msg: "Invalid OTP", code: 400 });
//         }

//         if (createdAt) {
//             const now = new Date();
//             const diffInMinutes = (now - new Date(createdAt)) / 1000 / 60;
//             if (diffInMinutes > 10) {
//                 return res.status(400).json({ msg: "OTP has expired", code: 400 });
//             }
//         }

//         /** 2. Atomic update */
//         const result = await pool.request()
//             .input('pin', pin)
//             .input('upDate', upDate)
//             .query(`
//         UPDATE IEIMobileDB.DBO.APPUSERS
//         SET PHONE_VER = NULL,
//             VERIFIED_AT = @upDate,
//             UPDATED_AT = @upDate,
//             IS_VERIFIED = 1
//         WHERE PIN = @pin
//       `);

//         if (result.rowsAffected[0] === 0) {
//             return res.status(400).json({
//                 msg: "Invalid or expired OTP"
//             });
//         }

//         return res.status(200).json({
//             msg: "Verification successful",
//             code: 200
//         });

//     } catch (err) {
//         console.error("OTP Verify Error:", err);
//         return res.status(500).json({
//             msg: "Internal server error",
//             code: 500
//         });
//     }
// };


// const genUnlockOtp = async (req, res) => {
//     try {
//         const { phone, model, brand, pin: npin } = req.body;
//         const pin = normalizePin(npin);
//         const phoneNum = formatPhoneNumber(phone);

//         const min = 200000;
//         const max = 900000;
//         const otp = Math.floor(Math.random() * (max - min + 1)) + min;

//         const msg = `Your OTP is: ${otp} to unlock device on ${brand} ${model}. Expires in 10 min.`;
//         const channel = "MOTP";
//         const senderID = "NorrenPens";
//         const createDate = dateFormate.asString(
//             'yyyy-mm-dd hh:mm:ss.SSS',
//             new Date()
//         );

//         console.log("UnlockOTP-for-pin: ", otp, pin)
//         const pool = await getConnection();

//         /** 1. Check account */
//         const userCheck = await pool.request()
//             .input('pin', pin)
//             .query(`SELECT PIN FROM IEIMobileDB.dbo.APPUSERS WHERE PIN = @pin`);

//         if (!userCheck.recordset.length) {
//             return res.status(400).json({
//                 error: "Account not found! Sign up instead"
//             });
//         }

//         /** 2. Get email */
//         const emailResult = await pool.request()
//             .input('pin', pin)
//             .query(`SELECT EMAIL FROM PFA.DBO.EMPLOYEES WHERE PIN = @pin`);

//         const email = emailResult.recordset?.[0]?.EMAIL;

//         /** 3. Save OTP */
//         await pool.request()
//             .input('otp', otp)
//             .input('pin', pin)
//             .input('createDate', createDate)
//             .query(`
//         UPDATE IEIMobileDB.DBO.APPUSERS
//         SET DEVICE_VERIFICATION = @otp,
//             OTP_CREATED_AT = @createDate,
//             UPDATED_AT = @createDate
//         WHERE PIN = @pin
//       `);

//         /** 4. Send email (if available) */
//         const emailPromise = email
//             ? transporter.sendMail({
//                 from: "Norrenberger Pensions <noreply-npl@norrenpensions.com>",
//                 to: email,
//                 subject: "Device Unlock",
//                 html: `
//             <b>Dear Esteemed Customer,</b><br>
//             <p>
//               You are trying to access your account on
//               <strong>${brand} ${model}</strong>.
//             </p>
//             <p>Your OTP:</p>
//             <strong style="padding:4px;font-size:1.2em;background:#0047ab;color:#fff">
//               ${otp}
//             </strong>. Expires in 10 minutes.
//           `
//             })
//             : Promise.resolve("No email");

//         /** 5. Send SMS */
//         const smsPromise = pool.request()
//             .input('pin', sql.VarChar(20), pin)
//             .input('phone', sql.VarChar(15), phoneNum)
//             .input('msg', sql.VarChar(250), msg)
//             .input('channel', sql.VarChar(20), channel)
//             .input('senderID', sql.VarChar(20), senderID)
//             .query(`
//         INSERT INTO SMS_SERVER.SmartSMSNotification.dbo.tbl_SMS2MEMBER
//         (senderID, RSAPIN, PhoneNo, Message, ChannelCode)
//         VALUES (@senderID, @pin, @phone, @msg, @channel)
//       `);

//         const [emailStatus, smsStatus] = await Promise.allSettled([
//             emailPromise,
//             smsPromise
//         ]);

//         console.log("EmailStatus: ", emailStatus);
//         console.log("SMSStatus: ", smsStatus);

//         return res.status(201).json({
//             msg: "OTP sent",
//             status: 201
//         });

//     } catch (err) {
//         console.error("UNLOCK-OTP ERROR:", err);
//         return res.status(500).json({ error: err.message });
//     }
// };


// const verifyOtpUnlock = async (req, res) => {
//     try {
//         const { otp, device, platform } = req.body;
//         const pin = normalizePin(req.body.pin);
//         const upDate = dateFormate.asString('yyyy-mm-dd hh:mm:ss.SSS', new Date());

//         const pool = await getConnection();

//         /** 1. Get OTP details */
//         const verifyData = await pool.request()
//             .input('pin', pin)
//             .query(`SELECT DEVICE_VERIFICATION, OTP_CREATED_AT FROM IEIMobileDB.DBO.APPUSERS WHERE PIN = @pin`);

//         const db_otp = verifyData.recordset?.[0]?.DEVICE_VERIFICATION;
//         const createdAt = verifyData.recordset?.[0]?.OTP_CREATED_AT;

//         if (!db_otp || db_otp !== otp) {
//             return res.status(400).json({ mag: "Invalid OTP", code: 400 });
//         }

//         if (createdAt) {
//             const now = new Date();
//             const diffInMinutes = (now - new Date(createdAt)) / 1000 / 60;
//             if (diffInMinutes > 10) {
//                 return res.status(400).json({ mag: "OTP has expired", code: 400 });
//             }
//         }

//         /** 2. Atomic update */
//         const result = await pool.request()
//             .input('pin', pin)
//             .input('upDate', upDate)
//             .input('device', device)
//             .input('platform', platform)
//             .query(`
//         UPDATE IEIMobileDB.DBO.APPUSERS
//         SET DEVICE_VERIFICATION = NULL,
//             DEVICE_ID = @device,
//             DEVICE_PLATFORM = @platform,
//             UPDATED_AT = @upDate
//         WHERE PIN = @pin
//       `);

//         if (result.rowsAffected[0] === 0) {
//             console.log("Invalid token provided");
//             return res.status(400).json({
//                 mag: "Invalid or expired OTP"
//             });
//         }

//         console.log("Valid token provided");
//         return res.status(200).json({
//             mag: "Device unlock successful",
//             code: 200
//         });

//     } catch (err) {
//         console.log('OTP Unlock Verification Error: ', err);
//         res.json({ mag: err.message });
//     }
// };


// const genPassOtp = async (req, res) => {
//     try {
//         const min = 200000;
//         const max = 900000;
//         const otp = Math.floor(Math.random() * (max - min + 1)) + min;

//         const { phone, pin: npin } = req.body;
//         const pin = normalizePin(npin);
//         const phoneNum = formatPhoneNumber(phone);
//         const createDate = dateFormate.asString(
//             'yyyy-mm-dd hh:mm:ss.SSS',
//             new Date()
//         );

//         const msg = `Your OTP for Password update is: ${otp}. It expires in 10 minutes.`;
//         const channel = "MOTP";
//         const senderID = "NorrenPens";

//         console.log("PasswordOTP-for-pin: ", otp, pin, phoneNum)
//         const pool = await getConnection();

//         /** 1. Check user exists */
//         const userCheck = await pool.request()
//             .input('pin', pin)
//             .query(`SELECT PIN FROM IEIMobileDB.dbo.APPUSERS WHERE PIN = @pin`);

//         if (!userCheck.recordset.length) {
//             return res.status(400).json({
//                 error: "Account not found! Sign up instead"
//             });
//         }

//         /** 2. Get email */
//         const emailResult = await pool.request()
//             .input('pin', pin)
//             .query(`SELECT EMAIL FROM PFA.DBO.EMPLOYEES WHERE PIN = @pin`);

//         const email = emailResult.recordset?.[0]?.EMAIL;

//         /** 3. Save OTP (plain) */
//         await pool.request()
//             .input('otp', otp)
//             .input('pin', pin)
//             .input('createDate', createDate)
//             .query(`
//         UPDATE IEIMobileDB.DBO.APPUSERS
//         SET UPDATE_PASS_TOKEN = @otp,
//             OTP_CREATED_AT = @createDate,
//             UPDATED_AT = @createDate
//         WHERE PIN = @pin
//       `);

//         /** 4. Send email (if available) */
//         const emailPromise = email
//             ? transporter.sendMail({
//                 from: "Norrenberger Pensions <noreply-npl@norrenpensions.com>",
//                 to: email,
//                 subject: "Update Password",
//                 html: `
//             <b>Dear Esteemed Customer,</b><br>
//             <p>Use the OTP below to update your password:</p>
//             <strong style="padding:4px;font-size:1.2em;background:#0047ab;color:#fff">
//               ${otp}
//             </strong>. Expires in 10 minutes.
//           `
//             })
//             : Promise.resolve("No email");

//         /** 5. Send SMS */
//         const smsPromise = pool.request()
//             .input('pin', sql.VarChar(20), pin)
//             .input('phone', sql.VarChar(15), phoneNum)
//             .input('msg', sql.VarChar(250), msg)
//             .input('channel', sql.VarChar(20), channel)
//             .input('senderID', sql.VarChar(20), senderID)
//             .query(`
//         INSERT INTO SMS_SERVER.SmartSMSNotification.dbo.tbl_SMS2MEMBER
//         (senderID, RSAPIN, PhoneNo, Message, ChannelCode)
//         VALUES (@senderID, @pin, @phone, @msg, @channel)
//       `);

//         const [emailStatus, smsStatus] = await Promise.allSettled([
//             emailPromise,
//             smsPromise
//         ]);

//         return res.json({
//             mag: "OTP sent",
//             status: 201
//         });

//     } catch (err) {
//         console.error("Error Gen Password OTP:", err);
//         return res.status(500).json({ mag: err.message });
//     }
// };


// const verifyUpassOtp = async (req, res) => {

//     const { otp } = req.body;
//     const npin = req.body.pin;
//     const pin = normalizePin(npin);
//     const pool = await getConnection();
//     try {
//         const upDate = dateFormate.asString('yyyy-mm-dd hh:mm:ss.SSS', new Date());

//         /** 1. Get OTP details */
//         const verifyData = await pool.request()
//             .input('pin', pin)
//             .query(`SELECT UPDATE_PASS_TOKEN, OTP_CREATED_AT FROM IEIMobileDB.DBO.APPUSERS WHERE PIN = @pin`);

//         const db_otp = verifyData.recordset?.[0]?.UPDATE_PASS_TOKEN;
//         const createdAt = verifyData.recordset?.[0]?.OTP_CREATED_AT;

//         if (!db_otp || db_otp !== otp) {
//             console.log({ mag: "Invalid Token provided", code: 400 });
//             return res.status(400).json({ mag: "Invalid Token provided", code: 400 });
//         }

//         if (createdAt) {
//             const now = new Date();
//             const diffInMinutes = (now - new Date(createdAt)) / 1000 / 60;
//             if (diffInMinutes > 10) {
//                 return res.status(400).json({ mag: "OTP has expired", code: 400 });
//             }
//         }

//         /** 2. Atomic update */
//         const result = await pool.request()
//             .input('upDate', upDate)
//             .input('pin', pin)
//             .query(`
//         UPDATE IEIMobileDB.DBO.APPUSERS
//         SET UPDATE_PASS_TOKEN = NULL,
//             UPDATED_AT = @upDate
//         WHERE PIN = @pin
//       `);

//         if (result.rowsAffected[0] > 0) {
//             console.log({ mag: "Verification successful!!!", code: 200 });
//             return res.status(200).json({ mag: "Verification successful!!!", code: 200 });
//         } else {
//             return res.status(400).json({ mag: "Verification failed", code: 400 });
//         }

//     } catch (err) {
//         console.log("Password Update Verification error: ", err);
//         return res.json({ mag: err.message })

//     }

// }


// module.exports = { genOtp, verifyOtp, verifyUpassOtp, genPassOtp, genUnlockOtp, verifyOtpUnlock };

