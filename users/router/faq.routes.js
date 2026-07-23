const {Router} = require('express')
const {getFaqs} = require('../controller/faqs.controller')

const router = Router()

router.get('/faqs', getFaqs)

module.exports = router