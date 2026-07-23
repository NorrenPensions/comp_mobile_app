const {Router} = require('express')
const {SendNotification, SendNotificationToDevice} = require('../controller/push-notification.controller')

const router = Router()

router.get('/sendNotification', SendNotification)
router.post('/sendNotificationToDevice', SendNotificationToDevice)

module.exports = router