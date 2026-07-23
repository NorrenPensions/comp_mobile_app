const {Router} = require('express');
const { sendStatement} = require("../controller/email.controller")

const router = Router();
router.post("/sendstatement", sendStatement)


module.exports = router;