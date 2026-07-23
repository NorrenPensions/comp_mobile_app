const {Router} = require('express');
const {regUser, userAuth, getCompanyDetails, getUserData, getStates, updateClientDetails, updateOldPass, updatePass} = require("../controller/user.controller");

const router = Router();

router.post("/signup", regUser)
router.post("/signin", userAuth)
router.get("/userData/:pin", getUserData)
router.put("/putpold", updateOldPass)
router.put("/putp", updatePass)
router.get("/getstates", getStates)
router.post("/update-client-details", updateClientDetails)
router.get("/company-details", getCompanyDetails)

module.exports = router;