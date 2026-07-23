const Sentry = require('@sentry/node');
const { mysqlConnect } = require("../database/connection")

const getBranches = ((req, res) => {
    const brancehes = mysqlConnect.query("SELECT * FROM branches ", (err, rows) => {
        if (err) {
            console.log('getBranches error: ', err);
            Sentry.captureException(err)
        }

        if (rows != 0) {
            res.send(rows)
        } else {
            res.send({ code: 201 })
        }
    })
})

module.exports = { getBranches }
