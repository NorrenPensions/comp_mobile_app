const {Router} = require('express');
const {contSummary, contSummaryNew, miniStatetsments, getStatement} = require("../controller/contributions.controller")



const router = Router();

router.get("/contributionSum/:pin", contSummary)
router.get("/contributionSumNew/:pin", contSummaryNew)
router.post("/statement", getStatement)
router.get("/ministatement/:pin", miniStatetsments)


module.exports = router;