const {Router} = require('express')
const {getNotifications} = require('../controller/notifications.controller')

const router = Router()

router.get('/notification/:pin', getNotifications)

module.exports = router