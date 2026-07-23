const {Router} = require('express')
const {getUnits} = require('../controller/units.controller')

const router = Router()

router.get('/units', getUnits)

module.exports = router