const { mysqlConnect } = require("../../database/connection");
const dateFormate = require('date-format')
const date = dateFormate('yyyy-mm-dd', new Date());

const contact = ((req, res)=>{
    const values ={
     name : req.body.fname,
     email : req.body.email,
     pin : req.body.pin,
     mobile : req.body.phone,
     type : req.body.type,
     subject : req.body.sub,
     message : req.body.msg
     
    }

    const brancehes = mysqlConnect.query(`INSERT INTO contacts  SET ?`,values,(err, rows)=>{     

        if(err)throw err

        if(brancehes){
            return res.send({code:200})
        }else{
            return res.send({code:201})
        }
    })
})

module.exports = {contact}