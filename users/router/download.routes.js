const {Router} = require('express');
const {getDownload, getDownloadByCat} = require("../controller/download.controller");

const router = Router();

router.get("/downloads", getDownload)
router.get("/downloads/:category", getDownloadByCat)


module.exports = router