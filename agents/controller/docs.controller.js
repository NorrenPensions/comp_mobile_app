const Sentry = require('@sentry/node');
const { getConnection } = require("../../database/connection");

const addDocs = async (req, res) => {
  try {
    const { agent, nin, title } = req.body;

    const pool = await getConnection();

    const addDoc = await pool
      .request()
      .input("nin", nin)

      .input("title", title)
      .query(
        `SELECT NIN FROM [IEIMobileDB].[dbo].[DOCS] WHERE NIN = @nin AND TITLE = @title`
      );

    if (addDoc.recordset.length > 0) {
      res.json({ code: "400", msg1: "Document Available " });
    } else {
      insertUser = pool
        .request()
        .input("agent", agent)

        .input("nin", nin)
        .input("title", title)
        .query(`INSERT INTO  [IncompleteDocument].[dbo].[DOCS] 
                    ( AGENT_CODE,TITLE,NIN) 
                    VALUES (@agent, @title, @nin)`);

      if (insertUser) {
        res.json({ code: "200", msg1: "User Document inserted successful" });
      } else {
        res.json({
          code: "400",
          msg1: "Error posting document try again later!!!",
        });
      }
    }
  } catch (error) {
    console.log('Add doc error: ', error);
    Sentry.captureException(error);
  }
};

const updateDocs = async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getConnection();
    const updateUser = await pool
      .request()
      .input("id", id)

      .query(
        `UPDATE [IEIMobileDB].[dbo].[DOCS] SET STATUS = 1 WHERE ID = @id `
      );

    res.json({ msg: "Data updated" });
  } catch (error) {
    console.log('Doc update error: ' ,error);
    Sentry.captureException(error);
  }
};

const updateDocsAdmin = async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getConnection();
    const updateUser = await pool
      .request()
      .input("id", id)

      .query(
        `UPDATE [IEIMobileDB].[dbo].[DOCS] SET STATUS = 2 WHERE ID = @id `
      );

    res.json({ msg: "Data updated" });
  } catch (error) {
    console.log('Update doc admin error: ', error);
    Sentry.captureException(error);
  }
};

const getIcompleteDocs = async (req, res) => {
  try {
    const pool = await getConnection();
    const agents = await pool.request()
      .query(`SELECT   COUNT(AGENT_CODE) As SUBMITED

   from [IEIMobileDB].[dbo].[DOCS] 
   where STATUS = 0 
   
   GROUP BY AGENT_CODE
   
   `);

    res.json({ datas: agents.recordsets[0], code: 200 });
  } catch (err) {
    res.json({ err: err });
  }
};

const getcompleteDocs = async (req, res) => {
  try {
    const pool = await getConnection();
    const agents = await pool.request()
      .query(`SELECT  count(AGENT_CODE)  As SUBMITED

                                                from [IEIMobileDB].[dbo].[DOCS] 
                                                where STATUS = 2


`);

    res.json({ datas: agents.recordsets[0], code: 200 });
  } catch (err) {
    res.json({ err: err });
  }
};

module.exports = {
  addDocs,
  updateDocs,
  updateDocsAdmin,
  getcompleteDocs,
  getIcompleteDocs,
};
