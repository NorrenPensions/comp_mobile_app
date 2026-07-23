const {Router} = require('express');
const {getNews,getNewsById} = require("../controller/news.controller")

const router = Router();

router.get('/news', getNews)
router.get('/news/:id', getNewsById)

module.exports = router
