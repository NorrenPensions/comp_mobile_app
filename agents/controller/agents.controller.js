const Sentry = require('@sentry/node');
const { getConnection } = require("../../database/connection");
const sql = require("mssql");
const bcrypt = require("bcryptjs");

//AGENT TEST PASSED
const getAllAgents = async (req, res) => {
  try {
    const pool = await getConnection();
    const agents = await pool.request()
      .query(`SELECT TOP (15) AGENT_CODE, AGENT_NAME, PHONE, EMAIL, TEAM_CODE

          FROM [IEIMobileDB].[dbo].[AGENTS] 
      
        `);
    res.json({ datas: agents.recordsets[0], code: 200 });
  } catch (err) {
    res.json({ err: err });
  }
};
//END

const getAgentData = async (req, res) => {
  const { code } = req.params;

  try {
    const pool = await getConnection();
    const agents = await pool
      .request()
      .input("code", code)
      .query(
        `SELECT AGENT_CODE, AGENT_NAME, PHONE, EMAIL, TEAM_CODE from [IEIMobileDB].[dbo].[AGENTS] WHERE AGENT_CODE = @code`
      );

    res.json(agents.recordsets[0]);
  } catch (err) {
    res.json({ err: err });
  }
};

///API Test passed
const findAgentByCode = async (req, res) => {
  const { code } = req.body;

  const pool = await getConnection();
  const findAgent = await pool
    .request()
    .input("code", code)
    .query(`SELECT * from [PFA].[dbo].[AGENTS] WHERE AGENT_CODE = @code `);

  res.json({ datas: findAgent.recordsets, code: 200 });
};

///Closed

const updateAgentData = async (req, res) => {
  const { email, pass, phone, code, tcode } = req.body;
  const saltGen = await bcrypt.genSalt();
  const hashedpass = await bcrypt.hash(pass, saltGen);

  const pool = await getConnection();
  const updateAgent = await pool
    .request()
    .input("code", code)
    .input("hashedpass", hashedpass)
    .input("email", email)
    .input("phone", phone)
    .input("tcode", tcode)
    .query(
      `UPDATE [IEIMobileDB].[dbo].[AGENTS] SET TEAM_CODE = @tcode, EMAIL = @email, PASSWORD = @hashedpass, PHONE = @phone WHERE AGENT_CODE = @code `
    );

  res.json({ code: 200, msg: "Updated successful" });
};

const loginAgent = async (req, res) => {
  const { code, pass } = req.body;


  const pool = await getConnection();

  const checkAgent = await pool
    .request()
    .input("code", code)
    .query(
      `SELECT AGENT_CODE from [IEIMobileDB].[dbo].[AGENTS] WHERE AGENT_CODE = @code `
    );

  const aCode = checkAgent.recordset[0];

  if (aCode !== undefined) {
    const logUser = await pool
      .request()
      .input("code", code)
      .input("pass", pass)

      .query(
        `SELECT PASSWORD from [IEIMobileDB].[dbo].[AGENTS] WHERE AGENT_CODE = @code  `
      );

    const dbpass = logUser.recordset[0]["PASSWORD"];

    const validPass = await bcrypt.compare(pass, dbpass);

    if (validPass === true) {

      const pool = await getConnection();
      const agents = await pool
        .request()
        .input("code", code)
        .query(
          `SELECT AGENT_CODE, AGENT_NAME, PHONE, EMAIL, TEAM_CODE from [IEIMobileDB].[dbo].[AGENTS] WHERE AGENT_CODE = @code`
        );


      res.json({ msg: "Login successful", code: 200, "data": agents.recordsets[0] });
    } else {
      res.json({ msg: "Invalid password" });
    }
  } else {
    res.json({ msg: "no records found" });
  }
};

const addDocs = async (req, res) => {
  const { agent, nin, title } = req.body;
  const pool = await getConnection();
};

const getIcompleteDocs = async (req, res) => {
  try {
    const { code } = req.params;
    const pool = await getConnection();
    const agents = await pool.request().input("code", code)
      .query(`SELECT DISTINCT  COUNT(A.AGENT_CODE) AS INCOMPLETE, A.AGENT_CODE, A.AGENT_NAME, A.PHONE, A.TEAM_CODE AS LOCATION, A.EMAIL

       from [IEIMobileDB].[dbo].[DOCS] D 
        FULL JOIN [IEIMobileDB].[dbo].[AGENTS] A ON D.AGENT_CODE  = A.AGENT_CODE 
       WHERE STATUS = 1 OR STATUS = 0

       GROUP BY A.AGENT_CODE, A.AGENT_NAME, A.PHONE, A.TEAM_CODE, A.EMAIL
     
       `);

    res.json({ datas: agents.recordsets[0], code: 200 });
  } catch (err) {
    res.json({ err: err });
  }
};

const getcompleteDocs = async (req, res) => {
  try {
    const { code } = req.params;
    const pool = await getConnection();
    const agents = await pool.request().input("code", code)
      .query(`SELECT DISTINCT  COUNT(A.AGENT_CODE) AS INCOMPLETE, A.AGENT_CODE, A.AGENT_NAME, A.PHONE, A.TEAM_CODE AS LOCATION, A.EMAIL

   from [IEIMobileDB].[dbo].[DOCS] D 
    FULL JOIN [IEIMobileDB].[dbo].[AGENTS] A ON D.AGENT_CODE  =  A.AGENT_CODE
   where STATUS = 2 AND D.AGENT_CODE = @code

   GROUP BY A.AGENT_CODE, A.AGENT_NAME, A.PHONE, A.TEAM_CODE, A.EMAIL
 
   `);
    if (agents.recordsets.length > 0) {
      res.json({ datas: agents.recordsets[0], code: 200 });
    } else {
      res.json({ msg: "No records found", code: 200 });
    }
  } catch (err) {
    res.json({ err: err });
  }
};

const regAgent = async (req, res) => {
  try {
    const { acode, pass, email } = req.body;
    const pool = await getConnection();
    const checkAgent = await pool
      .request()
      .input("acode", acode)
      .query(
        `SELECT AGENT_CODE, AGENT_NAME, MOBILE_PHONE, TEAM_CODE from [PFA].[dbo].[AGENTS] WHERE AGENT_CODE = @acode `
      );

    const codes = checkAgent.recordset[0]["AGENT_CODE"];
    const names = checkAgent.recordset[0]["AGENT_NAME"];
    const phone = checkAgent.recordset[0]["MOBILE_PHONE"];
    const tcode = checkAgent.recordset[0]["TEAM_CODE"];

    if (codes !== undefined) {
      const saltGen = await bcrypt.genSalt();
      const hashedpass = await bcrypt.hash(pass, saltGen);

      const logUser = await pool
        .request()
        .input("code", codes)
        .input("hashedpass", hashedpass)
        .input("email", email)
        .input("names", names)
        .input("phone", phone)
        .input("tcode", tcode)

        .query(
          `INSERT INTO [IEIMobileDB].[dbo].AGENTS(AGENT_CODE, EMAIL,AGENT_NAME, PHONE, PASSWORD, TEAM_CODE)VALUES(@code, @email,@names, @phone, @hashedpass, @tcode)  `
        );

      res.json({ msg: "registration successful", code: 200 });
    } else {
      res.json({ msg: "Agent not found contact admin" });
    }
  } catch (e) {
    console.log('Agent registration error: ', e);
    Sentry.captureException(e);
    res.json(e);
  }
};

module.exports = {
  getAllAgents,
  findAgentByCode,
  updateAgentData,
  loginAgent,
  addDocs,
  getAgentData,
  getIcompleteDocs,
  getcompleteDocs,
  regAgent,
};
