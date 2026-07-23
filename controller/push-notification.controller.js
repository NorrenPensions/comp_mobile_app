const {ONE_SIGNAL_CONFIG} = require("../config/app.config")
const pushNotificationService = require("../services/push-notification.services")

exports.SendNotification = (req, res, next) =>{
var message ={
    app_id : ONE_SIGNAL_CONFIG.APP_ID,
    contents :{en:"Test Push Notification Nodejs"},

   
    included_segments: ["Subscribed Users"],
    content_available: true,
    small_icon : "ic_notification_icon",
    data: {
        pushTitile: "CUSTOM NOTIFICATION"
    }
}

pushNotificationService.sendNotification(message, (error, results)=>{
    if(error){
        return next(error)
    }
    return  res.status(200).send({
        message: "Success",
        data: results
    })
})

}



exports.SendNotificationToDevice = (req, res, next) =>{


    
    var message ={
        app_id : ONE_SIGNAL_CONFIG.APP_ID,
        contents :{en:"Test one Notification Nodejs"},
        include_player_ids: [req.body.devices],
        content_available: true,
        small_icon : "ic_notification_icon",
        data: {
            pushTitile: "CUSTOM NOTIFICATION NODE"
        }
    }
    
    pushNotificationService.sendNotification(message, (error, results)=>{
        if(error){
            return next(error.message)
        }
        return  res.status(200).send({
            message: "Success",
            data: results
        })

    
    })
    
    }
    

