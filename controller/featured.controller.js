const Sentry = require('@sentry/node');
const { mysqlConnect } = require("../database/connection")

const getFeatured = ((req, res) => {
    try {
        const news = mysqlConnect.query("SELECT * FROM `featured` WHERE is_publish = 1 ORDER BY id DESC LIMIT 3 ", (err, rows) => {
            if (err) throw err

            if (rows != 0) {
                res.send(rows)
            } else {
                res.send({ msg: "Fetured is empty" })
            }
        })
    } catch (error) {
        Sentry.captureException(error)
    }
})

module.exports = { getFeatured }
