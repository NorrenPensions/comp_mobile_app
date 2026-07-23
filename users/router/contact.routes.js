const {Router} = require('express')
const {contact} = require('../controller/contact.controller')

const router = Router()

router.post('/contact', contact)

module.exports = router