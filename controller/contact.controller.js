const { mysqlConnect } = require("../database/connection");
// const dateFormate = require('date-format');
// const date = dateFormate('yyyy-mm-dd', new Date());

const contact = ((req, res) => {
    const values = {
        name: req.body.fname,
        email: req.body.email,
        pin: req.body.pin,
        mobile: req.body.phone,
        type: req.body.type,
        subject: req.body.sub,
        message: req.body.msg

    }

    const branches = mysqlConnect.query(`INSERT INTO contacts  SET ?`, values, (err, rows) => {

        if (err) throw err

        if (branches) {
            res.send({ code: 200 })
        } else {
            res.send({ code: 201 })
        }
    })
})

module.exports = { contact }