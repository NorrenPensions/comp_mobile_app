const {Router} = require('express')
const {getPolicy} = require('../controller/page.controller')

const router = Router()

router.get('/pages', getPolicy)

module.exports = router