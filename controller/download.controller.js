const { mysqlConnect } = require("../database/connection")

const getDownload = ((req, res) => {
    const branches = mysqlConnect.query("SELECT distinct category FROM downloads ", (err, rows) => {
        if (err) throw err

        if (rows != 0) {
            res.send(rows)
        } else {
            res.send({ code: 201 })
        }
    })
})

const getDownloadByCat = ((req, res) => {

    const branches = mysqlConnect.query("SELECT * FROM downloads  downloads WHERE category = ?", [req.params.category], (err, rows) => {
        if (err) throw err

        if (rows != 0) {
            res.send(rows)
        } else {
            res.send({ code: 201 })
        }
    })
})


module.exports = { getDownload, getDownloadByCat }