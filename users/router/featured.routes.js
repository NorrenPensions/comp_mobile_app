const {Router} = require('express');
const {getFeatured} = require("../controller/featured.controller")

const router = Router();

router.get('/featured', getFeatured)

module.exports = router
