const {Router} = require('express');
const {getRecaptures} = require("../controller/recapture.controller")

const router = Router();

//router.get('/news', getNews)
router.get('/recapture/:pin', getRecaptures)

module.exports = router
