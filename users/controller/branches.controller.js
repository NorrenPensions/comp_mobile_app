const Sentry = require('@sentry/node');
const { mysqlConnect } = require("../../database/connection");

const getBranches = (req, res) => {
  const brancehes = mysqlConnect.query(
    "SELECT * FROM branches ",
    (err, rows) => {
      if (err) {
        console.log(err);
        Sentry.captureException(err);
      }

      if (rows != 0) {
        res.send(rows);
      } else {
        return res.send({ code: 201 });
      }
    }
  );
};

module.exports = { getBranches };
