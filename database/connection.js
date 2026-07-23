const Sentry = require('@sentry/node');
const sql = require('mssql')
const mysql = require('mysql')

const dbsetttings = {
    // Live settings  - IEIANCHORDB
    user: "dev03",
    password: "@Lacool22",
    server: "IEIANCHORDB",
    options: {
        trustedconnection: true,
        useUTC: false,
        enableArithAbort: true,
        encrypt: false,
        instancename: ""
    },
    port: 1433
}

async function getConnection() {

    try {
        const pool = await sql.connect(dbsetttings)
        return pool;
    } catch (error) {
        console.error(error)
    }

}

module.exports = { getConnection }