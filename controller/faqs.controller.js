const { mysqlConnect } = require("../database/connection")


const getFaqs = (req, res) => {
    mysqlConnect.query("SELECT id, question, answer, category FROM faqs", (err, rows) => {
        if (err) {
            console.error("Error fetching FAQs:", err);
            res.status(500).send({ error: "Internal Server Error" });
            return;
        }

        if (rows.length > 0) {
            res.send(rows); // Send the FAQs data if rows are not empty
        } else {
            res.status(404).send({ message: "No FAQs found" }); // Send a 404 Not Found response if no FAQs found
        }
    });
};

// const getFaqs = ((req, res) => {
//     const branches = mysqlConnect.query("SELECT id, question, answer, category FROM faqs ", (err, rows) => {
//         if (err) throw err

//         if (rows != 0) {
//             res.send(rows)
//         } else {
//             res.send({ code: 201 })
//         }
//     })
// })

module.exports = { getFaqs }