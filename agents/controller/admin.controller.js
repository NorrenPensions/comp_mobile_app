const Sentry = require('@sentry/node');
const { getConnection } = require("../../database/connection");
const bcrypt = require("bcryptjs");
const dateFormate = require("date-format");

const loginAdmin = async (req, res) => {
  const { email, pass } = req.body;
  const pool = await getConnection();

  const checkAgent = await pool
    .request()
    .input("email", email)
    .query(
      `SELECT EMAIL from [IEIMobileDB].[dbo].[ADMIN] WHERE EMAIL = @email `
    );

  const aCode = checkAgent.recordset[0];

  if (aCode !== undefined) {
    const logUser = await pool
      .request()
      .input("email", email)
      .input("pass", pass)

      .query(
        `SELECT PASSWORD from [IEIMobileDB].[dbo].[ADMIN] WHERE EMAIL = @email  `
      );

    const dbpass = logUser.recordset[0]["PASSWORD"];
    const validPass = await bcrypt.compare(pass, dbpass);

    if (validPass === true) {
      res.json({ msg: "Login successful", code: 200 });
    } else {
      res.json({ msg: "Invalid password" });
    }
  } else {
    res.json({ msg: "no account found" });
  }
};

const regAdmin = async (req, res) => {
  try {
    const { name, email, phone, pass, role } = req.body;
    console.log("adminDetails: ", name, email, phone, pass, role);

    const saltGen = await bcrypt.genSalt();
    const hashedpass = await bcrypt.hash(pass, saltGen);

    console.log('hashedPass: ', hashedpass);

    const pool = await getConnection();
    const createDate = dateFormate.asString(
      "yyyy-mm-dd hh:mm:ss.SSS",
      new Date()
    );

    const checkUser = await pool
      .request()
      .input("email", email)
      .query(
        `SELECT EMAIL FROM [IEIMobileDb].[dbo].[ADMIN] WHERE EMAIL = @email`
      );
    console.log('checkedUser: ', checkUser);
    if (checkUser.recordset.length > 0) {
      res.json({ code: "400", msg1: "User already registared " });
    } else {
      insertUser = pool
        .request()
        .input("name", name)
        .input("email", email)
        .input("phone", phone)
        .input("hashedpass", hashedpass)
        .input("role", role).query(`INSERT INTO  [IEIMobileDb].[dbo].[ADMIN] 
                        (FULL_NAME,EMAIL,PHONE, [ROLE], [PASSWORD], [STATUS]) 
                        VALUES (@name, @email, @phone, @role,@hashedpass, 1)`);

      if (insertUser) {
        res.json({ code: 200, msg1: "User registared successful" });
      } else {
        res.json({
          code: 400,
          msg1: "Error registering user try again later!!!",
        });
      }
    }
  } catch (error) {
    console.log('AdminCreationError: ', error);
    Sentry.captureException(error);
  }
};

const updateAdminData = async (req, res) => {
  const { email, name, pass, phone } = req.body;

  const pool = await getConnection();
  const update = await pool
    .request()
    .input("pass", pass)
    .input("email", email)
    .input("name", name)
    .input("phone", phone)
    .query(
      `UPDATE [IEIMobileDB].[dbo].[AGENTS] SET EMAIL = @email, FULL_NAME = @name, PASSWORD = @pass, PHONE = @phone WHERE EMAIL = @email `
    );

  res.json({ code: 200, msg: "Record updated successful" });
};

const updatePass = async (req, res) => {
  const { email, pass } = req.body;

  const pool = await getConnection();
  const update = await pool
    .request()
    .input("pass", pass)
    .input("email", email)
    .query(
      `UPDATE [IEIMobileDB].[dbo].[ADMIN] SET PASSWORD = @pass WHERE EMAIL = @email `
    );

  res.json({ code: 200, msg: "Password update successful" });
};

const adminData = async (req, res) => {
  const pool = await getConnection();
  const data = await pool
    .request()
    .query(
      `SELECT FULL_NAME, EMAIL, PHONE, ROLE, ID FROM [IEIMobileDB].[dbo].[ADMIN] `
    );

  res.json({ code: 200, data: data.recordsets[0] });
};

const adminUserData = async (req, res) => {
  const { id } = req.params;

  const pool = await getConnection();

  const data = await pool
    .request()
    .input("id", id)
    .query(
      `SELECT FULL_NAME, EMAIL, PHONE, ROLE, ID FROM [IEIMobileDB].[dbo].[ADMIN] WHERE ID = @id `
    );

  res.json({ code: 200, data: data.recordsets[0] });
};

module.exports = {
  loginAdmin,
  updateAdminData,
  updatePass,
  adminData,
  regAdmin,
  adminUserData,
};
