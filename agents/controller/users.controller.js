const Sentry = require('@sentry/node');
const { getConnection } = require("../../database/connection");
const dateFormate = require("date-format");

const regUser = async (req, res) => {
  try {
    const {
      agent,
      fname,
      sname,
      oname,
      dob,
      nin,
      email,
      phone,
      employer,
      employerAdd,
      gender,
    } = req.body;

    const pool = await getConnection();
    const createDate = dateFormate.asString(
      "yyyy-mm-dd hh:mm:ss.SSS",
      new Date()
    );

    const checkUser = await pool
      .request()
      .input("nin", nin)
      .query(
        `SELECT NIN FROM [IEIMobileDB].[dbo].[DOC_USERS] WHERE NIN = @nin`
      );
    if (checkUser.recordset.length > 0) {
      res.json({ code: "400", msg1: "User already registared " });
    } else {
      insertUser = pool
        .request()
        .input("agent", agent)
        .input("fname", fname)
        .input("sname", sname)
        .input("oname", oname)
        .input("email", email)
        .input("phone", phone)
        .input("dob", dob)
        .input("gender", gender)
        .input("nin", nin)
        .input("employer", employer)
        .input("employerAdd", employerAdd)
        .query(`INSERT INTO  [IEIMobileDB].[dbo].[DOC_USERS] 
                    ( AGENT_CODE,FIRSTNAME,SURNAME,OTHERNAMES,DOB,GENDER,EMAIL,MOBILE_NUMBER,NIN,STATUS,EMPLOYER_NAME,EMPLOYER_ADDRESS) 
                    VALUES (@agent, @fname, @sname, @oname, @dob ,@gender, @email, @phone, @nin,0,@employer,@employerAdd)`);

      if (insertUser) {
        const titleNin = "NIN Slip";
        const age = "Birth Certificate/Age declaration";
        const appoint = "Appointment Letter";
        const stats = 1;
        // var nin = ""

        const values = [
          { agent, nin, titleNin, stats },
          { agent, nin, age, stats },
          { agent, nin, appoint, stats },
        ];

        //INSERT  DOC
        insertUser = pool
          .request()
          .input("nin", nin)
          .input("agent", agent)
          .input("titleNin", titleNin)
          .input("age", age)
          .input("appoint", appoint)
          .input("stats", stats).query(`INSERT INTO  [IEIMobileDB].[dbo].[DOCS] 
                      (ID, AGENT_CODE, NIN, TITLE, STATUS) 
                      VALUES 
                      (1, @agent, @nin,@titleNin, 0),
                      (2, @agent, @nin,@appoint, 0),
                      (3, @agent, @nin,@age, 0)
                     
                      `);

        res.json({ code: 200, msg1: "User registared successful" });
      } else {
        res.json({
          code: 400,
          msg1: "Error registering user try again later!!!",
        });
      }
    }
  } catch (error) {
    console.log('user reg error: ', error);
    Sentry.captureException(error);
  }
};

const updateUserStatus = async (req, res) => {
  const { nin } = req.params;

  try {
    const pool = await getConnection();
    const updateUser = await pool
      .request()
      .input("nin", nin)
      .query(
        `UPDATE [IEIMobileDB].[dbo].[DOC_USERS] SET STATUS = 1  WHERE NIN = @nin `
      );

    res.json({ msg: "Data updated", code: 200 });
  } catch (error) {
    console.log('Data update error: ', error);
    Sentry.captureException(error);
  }
};

const getAllUsers = async (req, res) => {
  const { code } = req.params;

  try {
    const pool = await getConnection();
    const updateUser = await pool
      .request()
      .input("code", code)
      .query(
        `SELECT * FROM [IEIMobileDB].[dbo].[DOC_USERS]   WHERE AGENT_CODE = @code `
      );
    res.json({ datas: updateUser.recordsets[0] });
  } catch (error) {
    console.log('update error: ', error);
    Sentry.captureException(error);
  }
};
const getUser = async (req, res) => {
  const { nin } = req.params;

  try {
    const pool = await getConnection();
    const updateUser = await pool
      .request()
      .input("nin", nin)
      .query(
        `SELECT FIRSTNAME, SURNAME, OTHERNAMES, EMAIL, MOBILE_NUMBER,
         NIN, GENDER, DOB, EMPLOYER_NAME, EMPLOYER_ADDRESS 
         FROM [IEIMobileDB].[dbo].[DOC_USERS] WHERE NIN = @nin `
      );

    const getDocs = await pool
      .request()
      .input("nin", nin)
      .query(`SELECT * FROM [IEIMobileDB].[dbo].[DOCS]  WHERE NIN = @nin`);
    res.json({ datas: updateUser.recordset, doc: getDocs.recordset });
  } catch (error) {
    console.log('update error: ', error);
    Sentry.captureException(error);
  }
};

const getAllUsersByAdmin = async (req, res) => {
  try {
    const pool = await getConnection();
    const updateUser = await pool
      .request()
      .query(`SELECT * FROM [IncompleteDocument].[dbo].[USERS]`);
    res.json({ datas: updateUser.recordsets[0] });
  } catch (error) {
    console.log('fetch user error: ', error);
    Sentry.captureException(error);
  }
};

module.exports = {
  regUser,
  updateUserStatus,
  getAllUsers,
  getUser,
  getAllUsersByAdmin,
};
