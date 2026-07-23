const {mysqlConnect} = require("../../database/connection")

const getFaqs = ((req, res)=>{
    const brancehes = mysqlConnect.query("SELECT id, question, answer, category FROM faqs ", (err, rows)=>{
        if(err)throw err

        if(rows != 0){
            return res.send(rows)
        }else{
            return res.send({code:201})
        }
    })
})

module.exports = {getFaqs}