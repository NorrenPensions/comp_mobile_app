const { mysqlConnect } = require("../../database/connection");

const getDownload = (req, res) => {
  mysqlConnect.query(
    "SELECT DISTINCT category FROM downloads",
    (err, rows) => {
      if (err) {
        console.error("getDownload error:", err);
        return res.status(500).json({
          code: 500,
          msg: "Unable to fetch downloads",
        });
      }

      if (rows.length === 0) {
        return res.status(200).json({
          code: 204,
          msg: "No categories found",
        });
      }

      return res.status(200).json(rows);
    }
  );
};

const getDownloadByCat = (req, res) => {
  mysqlConnect.query(
    "SELECT * FROM downloads WHERE category = ?",
    [req.params.category],
    (err, rows) => {
      if (err) {
        console.error("getDownloadByCat error:", err);
        return res.status(500).json({
          code: 500,
          msg: "Unable to fetch downloads",
        });
      }

      if (rows.length === 0) {
        return res.status(200).json({
          code: 204,
          msg: "No downloads found for this category",
        });
      }

      return res.status(200).json(rows);
    }
  );
};

module.exports = { getDownload, getDownloadByCat };




// const { mysqlConnect } = require("../../database/connection");

// const getDownload = ((req, res)=>{
//     const brancehes = mysqlConnect.query("SELECT distinct category FROM downloads ", (err, rows)=>{
//         if(err)throw err

//         if(rows != 0){
//             return res.send(rows)
//         }else{
//             res.send({code:201})
//         }
//     })
// })

// const getDownloadByCat = ((req, res)=>{
    
//     const brancehes = mysqlConnect.query("SELECT * FROM downloads  downloads WHERE category = ?",[req.params.category], (err, rows)=>{
//         if(err)throw err

//         if(rows != 0){
//             return res.send(rows)
//         }else{
//             return res.send({code:201})
//         }
//     })
// })


// module.exports = {getDownload, getDownloadByCat}