const Sentry = require('@sentry/node');
const { mysqlConnect } = require("../database/connection")

const getPolicy = ((req, res) => {
    const brancehes = mysqlConnect.query("SELECT * FROM dataprotect ", (err, rows) => {
        if (err) {
            console.log(err);
            Sentry.captureException(err)
        }

        if (rows != 0) {
            res.send(rows)
        } else {
            res.send({ code: 201 })
        }
    })
})

module.exports = { getPolicy }
