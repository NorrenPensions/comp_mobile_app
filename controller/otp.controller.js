const Sentry = require('@sentry/node');
const { getConnection } = require("../database/connection")
const sql = require('mssql')
const bcrypt = require('bcryptjs')
const dateFormate = require('date-format')
const nodemailer = require("nodemailer");
const normalizePin = require('../users/utility/normalizePin');


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

const genOtp = async (req, res) => {

	try {
		const min = 200000
		const max = 900000
		const otp = Math.floor(Math.random() * (max - min) + min)
		const channel = "MOTP"
		const senderID = "NorrenPens"
		const msg = `Your One Time Password (OTP) for Norrenberger Mobile Login is :${otp} `
		const { phone } = req.body;
		const npin = req.body.pin;
        const pin = normalizePin(npin);
		const createDate = dateFormate.asString('yyyy-mm-dd hh:mm:ss.SSS', new Date());


		const pool = await getConnection();

		const getEmail = await pool.request().input('pin', pin).query(`SELECT EMAIL FROM PFA.DBO.EMPLOYEES WHERE PIN = @pin`)
		if (getEmail.recordset != null) {

			const option = {
				from: "Norrenberger Pensions <mobile.noreply@ieianchorpensions.com.ng>",
				to: getEmail.recordset[0]['EMAIL'],
				subject: "Account Verification",
				html: `
				
				<b>Dear Esteemed Customer,</b> <br>
				
				<p>Thank you for choosing Norrenberger Pensions Ltd</p>
				<p>Use the OTP Pin <Strong style="padding:3px; margin-right:3px; font-size:1.2em; background:blue; color: white">${otp} </strong> to verify your account</p>
				<p>Thank You.</p>


				`

			}


			transporter.sendMail(option, function (err, info) {
				if (err) {
					console.log('email error: ', err);
					Sentry.captureException(err)
					return
				}
				else {
					console.log('Email sent');
				}
			})
		}

		const sendOtp = await pool.request()

			.input('pin', sql.VarChar(20), pin)
			.input('phone', sql.VarChar(15), phone)
			.input('msg', sql.VarChar(250), msg)
			.input('channel', sql.VarChar(20), channel)
			.input('senderID', sql.VarChar(20), senderID)
			.query(`INSERT INTO SMS_SERVER.SmartSMSNotification.dbo.tbl_SMS2MEMBER 
        		( senderID, RSAPIN, PhoneNo, Message, ChannelCode ) VALUES ( @senderID, @pin, @phone, @msg, @channel )`)


		if (sendOtp) {

			try {
				const saltGen = await bcrypt.genSalt(10);
				const hashedpass = await bcrypt.hash(otp.toString(), saltGen)
				const poolUser = await getConnection();
				const cool = await poolUser.request()
					.input('otp', otp)
					.input('pin', pin)
					.query(
						`UPDATE IEIMobileDB.DBO.APPUSERS SET PHONE_VER = @otp WHERE PIN = @pin`)

				res.json({ msg: 'OTP send', status: 201 })
			} catch (err) {
				res.json({ errors: err.message })
			}
		}
	} catch (err) {
		res.json({ error: err.message })
	}


}



const verifyOtp = async (req, res) => {
	const { otp } = req.body;
	const npin = req.body.pin;
    const pin = normalizePin(npin);
	const pool = await getConnection();
	try {
		const upDate = dateFormate.asString('yyyy-mm-dd hh:mm:ss.SSS', new Date());
		const verify = await pool.request()

			.input('pin', pin)
			.query(`SELECT PHONE_VER FROM IEIMobileDB.DBO.APPUSERS WHERE pin = @pin`)
		const db_otp = verify.recordset[0]['PHONE_VER']
		//res.json({mag:otp})

		if (db_otp === otp) {

			const poolUser = await getConnection();
			const verComplete = await poolUser.request()
				.input('upDate', upDate)
				.input('pin', pin)
				.query(
					`UPDATE IEIMobileDB.DBO.APPUSERS SET PHONE_VER = NULL, VERIFIED_AT = @upDate,  UPDATED_AT = @upDate, IS_VERIFIED = 1  WHERE PIN = @pin`)

			if (verComplete) {
				res.json({ mag: "Verification successfull!!!", code: 200 })
			}

		} else {
			res.json({ mag: "Invalid token provided", code: 400 })
		}

	} catch (err) {
		res.json({ mag: err.message })

	}

}

const genUnlockOtp = async (req, res) => {

	try {
		const { phone, model, brand } = req.body;
		const npin = req.body.pin;
        const pin = normalizePin(npin);
		const min = 200000
		const max = 900000
		const otp = Math.floor(Math.random() * (max - min) + min)
		const channel = "MOTP"
		const senderID = "IEI-ANCHOR"
		const msg = `Your One Time Password (OTP) is : ${otp} to unlock device on ${brand} ${model}`

		const createDate = dateFormate.asString('yyyy-mm-dd hh:mm:ss.SSS', new Date());


		const pool = await getConnection();

		const checkUserMobileAccount = await pool.request()
			.input('pin', pin)
			.query(`SELECT PIN FROM IEIMobileDB.dbo.APPUSERS WHERE PIN = @pin`)

		//Sentry.captureException(checkUserMobileAccount.recordset)

		if (checkUserMobileAccount.recordset[0] === undefined) {

			res.json({ code: 400, error: "Account not found! Sign Up instead" })
		} else {
			const getEmail = await pool.request().input('pin', pin).query(`SELECT EMAIL FROM PFA.DBO.EMPLOYEES WHERE PIN = @pin`)
			if (getEmail.recordset != null) {

				const option = {
					from: "Norrenberger Pensions <mobile.noreply@ieianchorpensions.com.ng>",
					to: getEmail.recordset[0]['EMAIL'],
					subject: "Device Unlock",
					html: `
				
				<b>Dear Esteemed Customer,</b> <br>
				
				<p>Thank you for choosing Norrenberger Pensions LTD</p>
				<p>You are trying to access your account on <strong> ${brand} ${model} </strong>. Use the OTP Pin <Strong style="padding:1px; margin-right:3px; 
				font-size:1.2em; background:blue; color: white">${otp} </strong> to unlock device</p>
				<p>Thank You.</p>


				`

				}


				transporter.sendMail(option, function (err, info) {
					if (err) {
						Sentry.captureException(err)
						return
					}
					else {
						console.log("email sent");
					}
				})


			}

			const sendOtp = await pool.request()

				.input('pin', sql.VarChar(20), pin)
				.input('phone', sql.VarChar(15), phone)
				.input('msg', sql.VarChar(250), msg)
				.input('channel', sql.VarChar(20), channel)
				.input('senderID', sql.VarChar(20), senderID)
				.query(`INSERT INTO SMS_SERVER.SmartSMSNotification.dbo.tbl_SMS2MEMBER 
        		( senderID, RSAPIN, PhoneNo, Message, ChannelCode ) VALUES ( @senderID, @pin, @phone, @msg, @channel )`)

			if (sendOtp) {
				try {

					const saltGen = await bcrypt.genSalt(10);
					const hashedpass = await bcrypt.hash(otp.toString(), saltGen)
					const poolUser = await getConnection();
					const cool = await poolUser.request()
						.input('otp', otp)
						.input('pin', pin)
						.input('createDate', createDate)
						.query(
							`UPDATE IEIMobileDB.DBO.APPUSERS SET DEVICE_VERIFICATION = @otp, UPDATED_AT = @createDate  WHERE PIN = @pin`)

					res.json({ msg: 'OTP send', status: 201 })
				} catch (err) {
					res.json({ errors: err.message })
					console.log('OTP-Sending Error: ', err);
				}
			}
		}
	} catch (err) {
		res.json({ error: err.message })
	}


}
const verifyOtpUnlock = async (req, res) => {
	const { otp, device, platform } = req.body;

	const npin = req.body.pin;
    const pin = normalizePin(npin);
	//, device, platform, signal
	const pool = await getConnection();
	try {
		const upDate = dateFormate.asString('yyyy-mm-dd hh:mm:ss.SSS', new Date());
		const verify = await pool.request()

			.input('pin', pin)
			.query(` SELECT DEVICE_VERIFICATION FROM IEIMobileDB.DBO.APPUSERS WHERE pin = @pin`)
		const db_otp = verify.recordset[0]['DEVICE_VERIFICATION']
		//res.json({mag:otp})


		if (db_otp === otp) {
			const poolUser = await getConnection();
			const verComplete = await poolUser.request()
				.input('upDate', upDate)
				.input('pin', pin)
				.input('device', device)
				.input('platform', platform)
				.query(
					`UPDATE IEIMobileDB.DBO.APPUSERS SET DEVICE_VERIFICATION = NULL, DEVICE_ID = @device, DEVICE_PLATFORM = @platform,  UPDATED_AT = @upDate WHERE PIN = @pin`)

			if (verComplete) {
				res.json({ mag: "Verification successfull!!!", code: 200 });
			}

		} else {
			console.log("Invalid token provided");
			Sentry.captureException("Invalid token provided")
			res.json({ mag: "Invalid token provided", code: 400 });
		}

	} catch (err) {
		res.json({ mag: err.message })

	}

}


const genPassOtp = async (req, res) => {

	try {
		const min = 200000
		const max = 900000
		const otp = Math.floor(Math.random() * (max - min) + min)
		const channel = "MOTP"
		const senderID = "IEI-ANCHOR"
		const msg = `Your One Time Password (OTP) for Norrenberger Mobile Password update is :${otp} `
		const { phone } = req.body;
		const npin = req.body.pin;
        const pin = normalizePin(npin);
		const createDate = dateFormate.asString('yyyy-mm-dd hh:mm:ss.SSS', new Date());


		const pool = await getConnection();

		const checkUserMobileAccount = await pool.request()
			.input('pin', pin)
			.query(`SELECT PIN FROM IEIMobileDB.dbo.APPUSERS WHERE PIN = @pin`)

		//Sentry.captureException(checkUserMobileAccount.recordset)

		if (checkUserMobileAccount.recordset[0] === undefined) {

			res.json({ code: 400, error: "Account not found! Sign Up instead" })

		} else {
			const getEmail = await pool.request().input('pin', pin).query(`SELECT EMAIL FROM PFA.DBO.EMPLOYEES WHERE PIN = @pin`)
			if (getEmail.recordset != null) {

				const option = {
					from: "Norrenberger Pensions <mobile.noreply@ieianchorpensions.com.ng>",
					to: getEmail.recordset[0]['EMAIL'],
					subject: "Update Password",
					html: `
				
				<b>Dear Esteemed Customer,</b> <br>
				
				<p>Thank you for choosing Norrenberger Pensions LTD</p>
				<p>Use the OTP Pin <Strong style="padding:3px; margin-right:3px; font-size:1.2em; background:blue; color: white">${otp} </strong> to update your password</p>
				<p>Thank You.</p>


				`

				}


				transporter.sendMail(option, function (err, info) {
					if (err) {
						console.log(err);
						Sentry.captureException(err)
						return
					}
					else {
						
						console.log("email sent");
					}
				})
			}

			const sendOtp = await pool.request()

				.input('pin', sql.VarChar(20), pin)
				.input('phone', sql.VarChar(15), phone)
				.input('msg', sql.VarChar(250), msg)
				.input('channel', sql.VarChar(20), channel)
				.input('senderID', sql.VarChar(20), senderID)
				.query(`INSERT INTO SMS_SERVER.SmartSMSNotification.dbo.tbl_SMS2MEMBER 
        		( senderID, RSAPIN, PhoneNo, Message, ChannelCode ) VALUES ( @senderID, @pin, @phone, @msg, @channel )`)

			if (sendOtp) {
				try {
					const saltGen = await bcrypt.genSalt(10);
					const hashedpass = await bcrypt.hash(otp.toString(), saltGen)
					const poolUser = await getConnection();
					const cool = await poolUser.request()
						.input('otp', otp)
						.input('pin', pin)
						.input('createDate', createDate)
						.query(
							`UPDATE IEIMobileDB.DBO.APPUSERS SET UPDATE_PASS_TOKEN = @otp, UPDATED_AT = @createDate  WHERE PIN = @pin`)

					res.json({ msg: 'OTP send', status: 201 })
				} catch (err) {
					res.json({ errors: err.message })
				}
			}
		}
	} catch (err) {
		res.json({ error: err.message })
	}


}




const verifyUpassOtp = async (req, res) => {

	const { otp } = req.body;
	const npin = req.body.pin;
    const pin = normalizePin(npin);
	const pool = await getConnection();
	try {
		const upDate = dateFormate.asString('yyyy-mm-dd hh:mm:ss.SSS', new Date());
		const verify = await pool.request()

			.input('pin', pin)
			.query(` SELECT UPDATE_PASS_TOKEN FROM IEIMobileDB.DBO.APPUSERS WHERE pin = @pin`)
		const db_otp = verify.recordset[0]['UPDATE_PASS_TOKEN']
		//res.json({mag:otp})


		if (db_otp === otp) {


			const poolUser = await getConnection();
			const verComplete = await poolUser.request()
				.input('upDate', upDate)
				.input('pin', pin)
				.query(
					`UPDATE IEIMobileDB.DBO.APPUSERS SET UPDATE_PASS_TOKEN = NULL,   UPDATED_AT = @upDate  WHERE PIN = @pin`)

			if (verComplete) {
				res.json({ mag: "Verification successfull!!!", code: 200 })
			}

		} else {
			res.json({ mag: "Invalide Token provided", code: 400 })

		}

	} catch (err) {
		res.json({ mag: err.message })

	}

}




module.exports = { genOtp, verifyOtp, verifyUpassOtp, genPassOtp, genUnlockOtp, verifyOtpUnlock }