const {Router} = require('express')
const {genOtp, verifyOtp, genPassOtp, verifyUpassOtp, genUnlockOtp, verifyOtpUnlock} = require('../controller/otp.controller')

const router = Router();

router.post("/otp", genOtp)
router.post("/otpunlock", genUnlockOtp)
router.post("/verifyotp", verifyOtp)

router.post("/otpass", genPassOtp)
router.post("/verifyotpass", verifyUpassOtp)
router.post("/verifyunlock", verifyOtpUnlock)

module.exports = router;
