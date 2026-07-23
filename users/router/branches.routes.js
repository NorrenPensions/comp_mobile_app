const {Router} = require('express')
const {getBranches} = require('../controller/branches.controller')

const router = Router()

router.get('/branches', getBranches)

module.exports = router