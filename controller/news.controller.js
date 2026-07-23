const Sentry = require('@sentry/node');
const { mysqlConnect } = require("../database/connection")

const getNews = ((req, res) => {
    try {
        const news = mysqlConnect.query("SELECT * FROM `news` ORDER BY id DESC", (err, rows) => {
            if (err) throw err

            if (rows != 0) {
                res.send(rows)
            } else {
                res.send({ msg: "News is empty" })
            }
        })
    } catch (error) {
        console.log(error);
        Sentry.captureException(error)
    }
})
const getNewsById = ((req, res) => {
    try {
        const news = mysqlConnect.query("SELECT * FROM `news` WHERE id =? ", [req.params.id], (err, rows) => {
            if (err) throw err

            if (rows != 0) {
                res.send(rows)
            } else {
                res.send({ msg: "News is empty" })
            }
        })
    } catch (error) {
        console.log(error);
        Sentry.captureException(error)
    }
})
module.exports = { getNews, getNewsById }
