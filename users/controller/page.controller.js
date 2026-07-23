const Sentry = require('@sentry/node');
const { mysqlConnect } = require("../../database/connection")

const getPolicy = ((req, res) => {
    const brancehes = mysqlConnect.query("SELECT * FROM dataprotect ", (err, rows) => {
        if (err) {
            Sentry.captureException(err)
        }

        if (rows != 0) {
            return res.send(rows)
        } else {
            return res.send({ code: 201 })
        }
    })
})

module.exports = { getPolicy }
