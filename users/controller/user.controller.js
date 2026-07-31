const Sentry = require('@sentry/node');
const { getConnection } = require("../../database/connection");
const sql = require("mssql");
const bcrypt = require("bcryptjs");
const dateFormate = require("date-format");
const normalizePin = require('../utility/normalizePin');

const regUser = async (req, res) => {
  try {
    const { password, device, platform } = req.body;

    const npin = req.body.pin;
    const pin = normalizePin(npin);
    console.log("Username: ", pin, device, platform);
    const createDate = dateFormate.asString(
      "yyyy-mm-dd hh:mm:ss.SSS",
      new Date()
    );
    const saltGen = await bcrypt.genSalt();
    const hashedpass = await bcrypt.hash(password, saltGen);

    const pool = await getConnection();

    const checkUser = await pool
      .request()
      .input("pin", pin)
      .query("SELECT pin FROM IEIMobileDB.dbo.APPUSERS WHERE pin = @pin");
    console.log("CheckUser Result: ", checkUser.recordset);
    if (checkUser.recordset.length === 0) {
      const getData = await pool
        .request()
        .input("pin", pin)
        .query(
          "SELECT MOBILE_PHONE, EMAIL FROM PFA.DBO.EMPLOYEES WHERE PIN = @pin"
        );
      if (getData.recordset.length !== 0) {
        const phone = getData.recordset[0]["MOBILE_PHONE"];
        const email = getData.recordset[0]["EMAIL"];

        try {
          const insertUser = await pool
            .request()
            .input("pin", sql.VarChar(100), pin)
            .input("phone", sql.VarChar(100), phone)
            .input("createDate", sql.VarChar(100), createDate)
            .input("hashedpass", sql.VarChar(200), hashedpass)
            .input("device", sql.VarChar(200), device)
            .input("platform", sql.VarChar(200), platform)
            .query(
              `INSERT INTO IEIMobileDB.DBO.APPUSERS (PIN, PASSWORD, IS_BLOCKED, IS_VERIFIED, CREATED_AT, DEVICE_ID, DEVICE_PLATFORM, MOBILE_PHONE) 
              VALUES (@pin, @hashedpass, 0, 0, @createDate, @device, @platform, @phone )`
            );

          if (!insertUser) {
            return res.json({ code: "200", msg1: "Sign Up Failed" });
          }

          if (!phone && !email) {
            return res.json({
              codes: "202",
              msg1: "Sign Up Successful",
              msg2: "phone and email is null",
            });
          }

          if (insertUser) {
            return res.json({
              code: "201",
              msg1: "Sign Up Successful",
              phone: getData.recordset[0]["MOBILE_PHONE"] ? getData.recordset[0]["MOBILE_PHONE"] : "",
              email: getData.recordset[0]["EMAIL"] ? getData.recordset[0]["EMAIL"] : "",
            });
          } else {
            res.json({ code: "200", msg1: "Sign Up Failed" });
          }
        } catch (error) {
          console.log("SignUp Error: ", error)
          res.json({ msg: error });
        }
      } else {
        console.log("SignUp Issue: RSA PIN does not belong to Norrenberger Pensions LTD!!!")
        res.json({
          msg1: "RSA PIN does not belong to Norrenberger Pensions LTD!!!",
          code: "nonexist",
        });
      }
    } else {
      console.log("SignUp Issue: Account already exist, login instead!!!")
      res.json({
        msg1: "Account already exist, login instead!!!",
        code: "exist",
      });
    }
  } catch (error) {
    console.log("SignUp Error: ", error);
    // Sentry.captureException(error);
  }
};

const userAuth = async (req, res) => {
  try {
    console.log("Request Body:", req.body);
    const { password, device } = req.body;
    const npin = req.body.pin;
    const pin = normalizePin(npin);
    console.log("Username: ", pin, device);
    const pool = await getConnection();

    const checkPin = await pool
      .request()
      .input("pin", pin)
      .query(
        "SELECT PIN FROM IEIMobileDb.DBO.APPUSERS WHERE PIN = @pin OR MOBILE_PHONE = @pin"
      );

    if (checkPin.recordset.length != 0) {
      //check if is old App

      const CheckOldapp = await pool
        .request()
        .input("pin", pin)
        .query(
          "SELECT PASSWORD, OLD_APP, PIN FROM IEIMobileDb.DBO.APPUSERS WHERE PIN = @pin OR MOBILE_PHONE = @pin"
        );

      const oldApp = CheckOldapp.recordset[0]["OLD_APP"];

      if (oldApp == 1) {
        const userData = await pool
          .request()
          .input("pin", pin)
          .query(
            "SELECT E.TITLE, S.DESCRIPTION, E.SURNAME,E.FIRSTNAME, E.OTHERNAMES, E.GENDER," +
            "E. DATE_OF_BIRTH,E.EMAIL,E.MOBILE_PHONE, E.STATE_OF_ORIGIN, E.NOK_NAME," +
            "NOK_RELATIONSHIP,NOK_MOBILE_PHONE,NOK_ADDRESS,EMPLOYER_NAME, " +
            " E.EMPLOYER_RCNO, E.EMPLOYER_ADDRESS  FROM PFA.DBO.EMPLOYEES E LEFT OUTER JOIN PFA.DBO.STATES S ON E.STATE_OF_POSTING = S.CODE WHERE PIN = @pin  OR MOBILE_PHONE = @pin"
          );

        return res.json({
          code: "update",
          msg: "Please update  your password",
          user: userData.recordsets[0],
        });
      } else {
        const logUserIn = await pool
          .request()
          .input("pin", pin)
          .query(
            "SELECT PASSWORD, PIN, IS_VERIFIED, IS_TEST, DEVICE_ID FROM IEIMobileDb.DBO.APPUSERS WHERE PIN = @pin OR MOBILE_PHONE = @pin "
          );
        const pass = logUserIn.recordset[0]["PASSWORD"];
        const isVerified = logUserIn.recordset[0]["IS_VERIFIED"];
        const device_id = logUserIn.recordset[0]["DEVICE_ID"];
        const test_pin = logUserIn.recordset[0]["IS_TEST"];

        const validPass = await bcrypt.compare(password, pass);

        if (validPass === true) {

          const userData = await pool
            .request()
            .input("pin", pin)
            .query(
              "SELECT E.TITLE, E.PIN, S.DESCRIPTION, E.SURNAME,E.FIRSTNAME, E.OTHERNAMES, E.GENDER," +
              "E. DATE_OF_BIRTH,E.EMAIL,E.MOBILE_PHONE, E.STATE_OF_ORIGIN, E.NOK_NAME," +
              "NOK_RELATIONSHIP,NOK_MOBILE_PHONE,NOK_ADDRESS,EMPLOYER_NAME, " +
              " E.EMPLOYER_RCNO, E.EMPLOYER_ADDRESS  FROM PFA.DBO.EMPLOYEES E LEFT OUTER JOIN PFA.DBO.STATES S ON E.STATE_OF_POSTING = S.CODE WHERE PIN = @pin OR MOBILE_PHONE = @pin"
            );

          return res.json({
            code: 200,
            msg: "Sign In successful",
            isVerified: isVerified,
            device: device_id,
            is_test: test_pin,
            user: userData.recordsets[0],
          });
        } else {
          return res.json({ code: 201, msg: "invalid password provided" });
        }
      }
    } else {
      res.json({ code: 400, error: "Account not found! Sign Up instead" });
    }
    // }else{
    //     res.json({msg:"You are trying to signin in from a new device, please unlock the device. ", code: 112})

    // }
  } catch (error) {
    console.log(error);
    Sentry.captureException(error);
    return res.json({ err: error });

  }
};

const updateOldPass = async (req, res) => {
  try {
    const { password, device, deviceId } = req.body;
    const npin = req.body.pin;
    const pin = normalizePin(npin);
    const pool = await getConnection();

    const updatedDate = dateFormate.asString(
      "yyyy-mm-dd hh:mm:ss.SSS",
      new Date()
    );
    const saltGen = await bcrypt.genSalt();
    const hashedpass = await bcrypt.hash(password, saltGen);
    const old_app = 0;
    const isVerified = 1;

    const update = pool
      .request()
      .input("pin", pin)
      .input("device", device)
      .input("deviceId", deviceId)
      .input("isVerified", isVerified)
      .input("updatedDate", updatedDate)
      .input("hashedpass", hashedpass)
      .input("old_app", old_app)
      .query(`UPDATE IEIMobileDb.DBO.APPUSERS SET PASSWORD = @hashedpass, 
            IS_VERIFIED = @isVerified, OLD_APP = @old_app, DEVICE_ID = @deviceId, DEVICE_PLATFORM = @device, 
            UPDATED_AT = @updatedDate, VERIFIED_AT = @updatedDate   WHERE PIN = @pin`);
    if (update) {
      return res.json({ code: 200, msg: "Password updated successful" });
    }
  } catch (error) {
    Sentry.captureException(error);
  }
};

const updatePass = async (req, res) => {
  try {
    const { password } = req.body;
    const npin = req.body.pin;
    const pin = normalizePin(npin);
    const pool = await getConnection();

    const updatedDate = dateFormate.asString(
      "yyyy-mm-dd hh:mm:ss.SSS",
      new Date()
    );
    const saltGen = await bcrypt.genSalt();
    const hashedpass = await bcrypt.hash(password, saltGen);
    const old_app = 0;

    const getData = await pool
      .request()
      .input("pin", pin)
      .query(
        "SELECT MOBILE_PHONE, EMAIL FROM PFA.DBO.EMPLOYEES WHERE PIN = @pin"
      );
    const phone = getData.recordset[0]["MOBILE_PHONE"];

    const update = pool
      .request()
      .input("pin", pin)
      .input("phone", phone)
      .input("updatedDate", updatedDate)
      .input("hashedpass", hashedpass)
      .input("old_app", old_app)
      .query(
        `UPDATE IEIMobileDb.DBO.APPUSERS SET PASSWORD = @hashedpass, MOBILE_PHONE = @phone, OLD_APP = @old_app, UPDATED_AT = @updatedDate  WHERE PIN = @pin`
      );
    if (update) {
      return res.json({ code: 200, msg: "Password updated successful" });
    }
  } catch (error) {
    Sentry.captureException(error);
  }
};

const getUserData = async (req, res) => {
  const npin = req.params.pin;
  const pin = normalizePin(npin);
  const pool = await getConnection();
  const userData = await pool
    .request()
    .input("pin", pin)
    .query(
      `SELECT 
    E.TITLE,
    S.DESCRIPTION,
    E.SURNAME,
    E.FIRSTNAME,
    E.OTHERNAMES,
    E.GENDER,
    E.DATE_OF_BIRTH,
    E.EMAIL,
    E.MOBILE_PHONE,
    E.STATE_OF_ORIGIN,
    E.NOK_NAME,
    E.BVN,
    E.SSN,
    NOK_RELATIONSHIP,
    NOK_MOBILE_PHONE,
    NOK_ADDRESS,
    EMPLOYER_NAME,
    E.EMPLOYER_RCNO,
    E.EMPLOYER_ADDRESS
FROM PFA.DBO.EMPLOYEES E
LEFT OUTER JOIN PFA.DBO.STATES S 
    ON E.STATE_OF_POSTING = S.CODE
WHERE PIN = @pin`
    );

  return res.json(userData.recordsets[0]);
};

const getStates = async (req, res) => {
  console.log('reaching me o..');
  const pool = await getConnection();
  const states = await pool.request()
    .query(`SELECT DESCRIPTION AS STATE FROM PFA.DBO.STATES`);

  console.log('states: ', states.recordset);

  return res.json(states.recordset);
}

const updateClientDetails = async (req, res) => {

  try {
    const { phone, email, state, bvn, nin } = req.body;
    const npin = req.body.pin;
    const pin = normalizePin(npin);
    console.log("BODY: ", phone, email, state, bvn, nin, pin);
    const stateOfPosting = state.trim().slice(0, 2);
    const phoneNum = phone.trim();
    const bvnNum = bvn.trim();
    const ninNum = nin.trim();
    const emailAddr = email.trim();
    const rsaPin = pin.trim();

    const pool = await getConnection();
    const clientDetailsUpdateRes = await pool.request()
      .input("phone", phoneNum)
      .input("email", emailAddr)
      .input("state", stateOfPosting)
      .input("bvn", bvnNum)
      .input("nin", ninNum)
      .input("pin", rsaPin)
      .query(`UPDATE PFA.DBO.EMPLOYEES
              SET MOBILE_PHONE = @phone,
                  EMAIL = @email, 
                  BVN = @bvn,
                  SSN = @nin,
                  STATE_OF_POSTING = @state
              WHERE PIN = @pin`);

    const updateRes = clientDetailsUpdateRes.rowsAffected;
    console.log('UpdateResult: ', updateRes);
    if (updateRes) {
      return res.json({ code: 201, msg: "Details updated successful" });
    }
  } catch (error) {
    console.log('Error: ', error);
    Sentry.captureException(error);
  }

}

const getCompanyDetails = async (req, res) => {
  const { query } = req.query;
  console.log('payload: ', query)

  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }

  try {
    const pool = await getConnection();

    const result = await pool.request()
      .input('query', sql.NVarChar, `%${query}%`)
      .query(`
                SELECT 
                  NAME AS name,
                  NULLIF(RCNO, '') AS employer_code,
                  ADDRESS AS address
                FROM PFA.dbo.EMPLOYER_DETAILS_WITH_LOCATION
                WHERE NAME LIKE @query`)

    const dbData = result.recordset;

    const data = dbData.map(item => ({
      id: item.employer_code,
      name: item.name,
      subTitle: item.address
    }));

    console.log('result: ', data);

    return res.status(200).json(data);

  } catch (error) {
    console.error('Error fetching data:', error);
    return res.status(500).json({ error: 'An error occurred while fetching company details' });
  }
}

module.exports = { regUser, userAuth, getUserData, getCompanyDetails, updateClientDetails, updateOldPass, updatePass, getStates };




// const Sentry = require('@sentry/node');
// const { getConnection } = require("../../database/connection");
// const sql = require("mssql");
// const bcrypt = require("bcryptjs");
// const dateFormate = require("date-format");
// const normalizePin = require('../utility/normalizePin');
// const { appUsers, employees } = require('./data.js');

// const regUser = async (req, res) => {
//   try {
//     const { password, device, platform } = req.body;

//     const npin = req.body.pin;
//     const pin = normalizePin(npin);
//     console.log("Username: ", pin, device, platform);
//     const createDate = dateFormate.asString(
//       "yyyy-mm-dd hh:mm:ss.SSS",
//       new Date()
//     );
//     const saltGen = await bcrypt.genSalt();
//     const hashedpass = await bcrypt.hash(password, saltGen);

//     const pool = await getConnection();

//     const checkUser = await pool
//       .request()
//       .input("pin", pin)
//       .query("SELECT pin FROM IEIMobileDB.dbo.APPUSERS WHERE pin = @pin");
//     console.log("CheckUser Result: ", checkUser.recordset);
//     if (checkUser.recordset.length === 0) {
//       const getData = await pool
//         .request()
//         .input("pin", pin)
//         .query(
//           "SELECT MOBILE_PHONE, EMAIL FROM PFA.DBO.EMPLOYEES WHERE PIN = @pin"
//         );
//       if (getData.recordset.length !== 0) {
//         const phone = getData.recordset[0]["MOBILE_PHONE"];
//         const email = getData.recordset[0]["EMAIL"];

//         try {
//           const insertUser = await pool
//             .request()
//             .input("pin", sql.VarChar(100), pin)
//             .input("phone", sql.VarChar(100), phone)
//             .input("createDate", sql.VarChar(100), createDate)
//             .input("hashedpass", sql.VarChar(200), hashedpass)
//             .input("device", sql.VarChar(200), device)
//             .input("platform", sql.VarChar(200), platform)
//             .query(
//               `INSERT INTO IEIMobileDB.DBO.APPUSERS (PIN, PASSWORD, IS_BLOCKED, IS_VERIFIED, CREATED_AT, DEVICE_ID, DEVICE_PLATFORM, MOBILE_PHONE)
//               VALUES (@pin, @hashedpass, 0, 0, @createDate, @device, @platform, @phone )`
//             );

//           if (!insertUser) {
//             return res.json({ code: "200", msg1: "Sign Up Failed" });
//           }

//           if (!phone && !email) {
//             return res.json({
//               codes: "202",
//               msg1: "Sign Up Successful",
//               msg2: "phone and email is null",
//             });
//           }

//           if (insertUser) {
//             return res.json({
//               code: "201",
//               msg1: "Sign Up Successful",
//               phone: getData.recordset[0]["MOBILE_PHONE"] ? getData.recordset[0]["MOBILE_PHONE"] : "",
//               email: getData.recordset[0]["EMAIL"] ? getData.recordset[0]["EMAIL"] : "",
//             });
//           } else {
//             res.json({ code: "200", msg1: "Sign Up Failed" });
//           }
//         } catch (error) {
//           console.log("SignUp Error: ", error)
//           res.json({ msg: error });
//         }
//       } else {
//         console.log("SignUp Issue: RSA PIN does not belong to Norrenberger Pensions LTD!!!")
//         res.json({
//           msg1: "RSA PIN does not belong to Norrenberger Pensions LTD!!!",
//           code: "nonexist",
//         });
//       }
//     } else {
//       console.log("SignUp Issue: Account already exist, login instead!!!")
//       res.json({
//         msg1: "Account already exist, login instead!!!",
//         code: "exist",
//       });
//     }
//   } catch (error) {
//     console.log("SignUp Error: ", error);
//     // Sentry.captureException(error);
//   }
// };

// const userAuth = async (req, res) => {
//   try {
//     console.log("Request Body:", req.body);
//     const { password, device } = req.body;
//     const npin = req.body.pin;
//     const pin = normalizePin(npin);
//     console.log("Username: ", pin, device);

//     // MOCK DATA IMPLEMENTATION
//     const appUser = appUsers.find(u => u.PIN === pin || u.MOBILE_PHONE === pin);

//     if (appUser) {
//       if (appUser.OLD_APP == 1) {
//         const employeeData = employees.find(e => e.PIN === pin || e.MOBILE_PHONE === pin);
//         return res.json({
//           code: "update",
//           msg: "Please update  your password",
//           user: [employeeData],
//         });
//       } else {
//         const pass = appUser.PASSWORD;
//         const isVerified = appUser.IS_VERIFIED;
//         const device_id = appUser.DEVICE_ID;
//         const test_pin = appUser.IS_TEST;

//         const validPass = await bcrypt.compare(password, pass);
//         console.log("validPass: ", validPass);

//         // WARNING: TEMPORARY BYPASS FOR LOCAL DEVELOPMENT/TESTING ONLY. DO NOT DEPLOY TO PRODUCTION!
//         const isDevBypass = process.env.NODE_ENV !== 'production' && password === "bypass";

//         if (validPass === true || isDevBypass) {
//           const employeeData = employees.find(e => e.PIN === pin || e.MOBILE_PHONE === pin);

//           return res.json({
//             code: 200,
//             msg: "Sign In successful",
//             isVerified: isVerified,
//             device: device_id,
//             is_test: test_pin,
//             user: [employeeData],
//           });
//         } else {
//           return res.json({ code: 201, msg: "invalid password provided" });
//         }
//       }
//     } else {
//       res.json({ code: 400, error: "Account not found! Sign Up instead" });
//     }
//     // }else{
//     //     res.json({msg:"You are trying to signin in from a new device, please unlock the device. ", code: 112})

//     // }
//   } catch (error) {
//     console.log(error);
//     Sentry.captureException(error);
//     return res.json({ err: error });

//   }
// };

// const updateOldPass = async (req, res) => {
//   try {
//     const { password, device, deviceId } = req.body;
//     const npin = req.body.pin;
//     const pin = normalizePin(npin);
//     const pool = await getConnection();

//     const updatedDate = dateFormate.asString(
//       "yyyy-mm-dd hh:mm:ss.SSS",
//       new Date()
//     );
//     const saltGen = await bcrypt.genSalt();
//     const hashedpass = await bcrypt.hash(password, saltGen);
//     const old_app = 0;
//     const isVerified = 1;

//     const update = pool
//       .request()
//       .input("pin", pin)
//       .input("device", device)
//       .input("deviceId", deviceId)
//       .input("isVerified", isVerified)
//       .input("updatedDate", updatedDate)
//       .input("hashedpass", hashedpass)
//       .input("old_app", old_app)
//       .query(`UPDATE IEIMobileDb.DBO.APPUSERS SET PASSWORD = @hashedpass,
//             IS_VERIFIED = @isVerified, OLD_APP = @old_app, DEVICE_ID = @deviceId, DEVICE_PLATFORM = @device,
//             UPDATED_AT = @updatedDate, VERIFIED_AT = @updatedDate   WHERE PIN = @pin`);
//     if (update) {
//       return res.json({ code: 200, msg: "Password updated successful" });
//     }
//   } catch (error) {
//     Sentry.captureException(error);
//   }
// };

// const updatePass = async (req, res) => {
//   try {
//     const { password } = req.body;
//     const npin = req.body.pin;
//     const pin = normalizePin(npin);
//     const pool = await getConnection();

//     const updatedDate = dateFormate.asString(
//       "yyyy-mm-dd hh:mm:ss.SSS",
//       new Date()
//     );
//     const saltGen = await bcrypt.genSalt();
//     const hashedpass = await bcrypt.hash(password, saltGen);
//     const old_app = 0;

//     const getData = await pool
//       .request()
//       .input("pin", pin)
//       .query(
//         "SELECT MOBILE_PHONE, EMAIL FROM PFA.DBO.EMPLOYEES WHERE PIN = @pin"
//       );
//     const phone = getData.recordset[0]["MOBILE_PHONE"];

//     const update = pool
//       .request()
//       .input("pin", pin)
//       .input("phone", phone)
//       .input("updatedDate", updatedDate)
//       .input("hashedpass", hashedpass)
//       .input("old_app", old_app)
//       .query(
//         `UPDATE IEIMobileDb.DBO.APPUSERS SET PASSWORD = @hashedpass, MOBILE_PHONE = @phone, OLD_APP = @old_app, UPDATED_AT = @updatedDate  WHERE PIN = @pin`
//       );
//     if (update) {
//       return res.json({ code: 200, msg: "Password updated successful" });
//     }
//   } catch (error) {
//     Sentry.captureException(error);
//   }
// };

// const getUserData = async (req, res) => {
//   const npin = req.params.pin;
//   const pin = normalizePin(npin);
//   const pool = await getConnection();
//   const userData = await pool
//     .request()
//     .input("pin", pin)
//     .query(
//       `SELECT
//     E.TITLE,
//     S.DESCRIPTION,
//     E.SURNAME,
//     E.FIRSTNAME,
//     E.OTHERNAMES,
//     E.GENDER,
//     E.DATE_OF_BIRTH,
//     E.EMAIL,
//     E.MOBILE_PHONE,
//     E.STATE_OF_ORIGIN,
//     E.NOK_NAME,
//     E.BVN,
//     E.SSN,
//     NOK_RELATIONSHIP,
//     NOK_MOBILE_PHONE,
//     NOK_ADDRESS,
//     EMPLOYER_NAME,
//     E.EMPLOYER_RCNO,
//     E.EMPLOYER_ADDRESS
// FROM PFA.DBO.EMPLOYEES E
// LEFT OUTER JOIN PFA.DBO.STATES S
//     ON E.STATE_OF_POSTING = S.CODE
// WHERE PIN = @pin`
//     );

//   return res.json(userData.recordsets[0]);
// };

// const getStates = async (req, res) => {
//   console.log('reaching me o..');
//   const pool = await getConnection();
//   const states = await pool.request()
//     .query(`SELECT DESCRIPTION AS STATE FROM PFA.DBO.STATES`);

//   console.log('states: ', states.recordset);

//   return res.json(states.recordset);
// }

// const updateClientDetails = async (req, res) => {

//   try {
//     const { phone, email, state, bvn, nin } = req.body;
//     const npin = req.body.pin;
//     const pin = normalizePin(npin);
//     console.log("BODY: ", phone, email, state, bvn, nin, pin);
//     const stateOfPosting = state.trim().slice(0, 2);
//     const phoneNum = phone.trim();
//     const bvnNum = bvn.trim();
//     const ninNum = nin.trim();
//     const emailAddr = email.trim();
//     const rsaPin = pin.trim();

//     const pool = await getConnection();
//     const clientDetailsUpdateRes = await pool.request()
//       .input("phone", phoneNum)
//       .input("email", emailAddr)
//       .input("state", stateOfPosting)
//       .input("bvn", bvnNum)
//       .input("nin", ninNum)
//       .input("pin", rsaPin)
//       .query(`UPDATE PFA.DBO.EMPLOYEES
//               SET MOBILE_PHONE = @phone,
//                   EMAIL = @email,
//                   BVN = @bvn,
//                   SSN = @nin,
//                   STATE_OF_POSTING = @state
//               WHERE PIN = @pin`);

//     const updateRes = clientDetailsUpdateRes.rowsAffected;
//     console.log('UpdateResult: ', updateRes);
//     if (updateRes) {
//       return res.json({ code: 201, msg: "Details updated successful" });
//     }
//   } catch (error) {
//     console.log('Error: ', error);
//     Sentry.captureException(error);
//   }

// }

// const getCompanyDetails = async (req, res) => {
//   const { query } = req.query;
//   console.log('payload: ', query)

//   if (!query) {
//     return res.status(400).json({ error: 'Query parameter is required' });
//   }

//   try {
//     const pool = await getConnection();

//     const result = await pool.request()
//       .input('query', sql.NVarChar, `%${query}%`)
//       .query(`
//                 SELECT
//                   NAME AS name,
//                   NULLIF(RCNO, '') AS employer_code,
//                   ADDRESS AS address
//                 FROM PFA.dbo.EMPLOYER_DETAILS_WITH_LOCATION
//                 WHERE NAME LIKE @query`)

//     const dbData = result.recordset;

//     const data = dbData.map(item => ({
//       id: item.employer_code,
//       name: item.name,
//       subTitle: item.address
//     }));

//     console.log('result: ', data);

//     return res.status(200).json(data);

//   } catch (error) {
//     console.error('Error fetching data:', error);
//     return res.status(500).json({ error: 'An error occurred while fetching company details' });
//   }
// }

// module.exports = { regUser, userAuth, getUserData, getCompanyDetails, updateClientDetails, updateOldPass, updatePass, getStates };
