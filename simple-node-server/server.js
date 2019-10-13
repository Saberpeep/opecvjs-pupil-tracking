const express = require('express')
const logger = require('morgan')
const app = express()
const config = require("./config.json")

// tells express to serve these local files at the specified path
app.use('/', express.static(config.path))

//morgan logger
app.use(logger('dev'))

//listen on the port
app.listen(config.port, () => {
    return console.log('Server is up on ' + config.port)
})