const Sentry = require('@sentry/node');
const sql = require('mssql');
const axios = require('axios');

// Resolve Gateway configuration
function getGatewayConfig() {
    const gatewayUrl = process.env.GATEWAY_URL || process.env.ONPREM_GATEWAY_URL;
    const apiKey = process.env.GATEWAY_API_KEY;

    return { gatewayUrl, apiKey };
}

// Log startup status once
const { gatewayUrl, apiKey } = getGatewayConfig();
if (gatewayUrl && apiKey) {
    console.log('=======================================================');
    console.log('📡 [DATABASE] Mode: ON-PREMISE API GATEWAY');
    console.log(`🔗 [DATABASE] Gateway URL: ${gatewayUrl}`);
    console.log('🔒 [DATABASE] API Key: Configured (GATEWAY_API_KEY)');
    console.log('=======================================================');
} else {
    console.warn('=======================================================');
    console.warn('⚠️ [DATABASE] Mode: DIRECT MSSQL CONNECTION');
    console.warn(`🖥️ [DATABASE] DB Server: ${process.env.DB_SERVER || 'Not configured'}`);
    console.warn('💡 If running on Render, ensure GATEWAY_URL and GATEWAY_API_KEY are set in Render Environment Variables!');
    console.warn('=======================================================');
}

// Direct MSSQL settings (for local development or direct LAN access)
const dbsetttings = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME || process.env.DB_DATABASE || 'PFA',
    options: {
        trustedconnection: true,
        useUTC: false,
        enableArithAbort: true,
        encrypt: process.env.DB_ENCRYPT === 'true',
        instancename: process.env.DB_INSTANCE_NAME || ""
    },
    port: parseInt(process.env.DB_PORT || '1433', 10)
};

// Helper to parse MSSQL data types passed to input(...)
function extractSqlTypeInfo(typeObj) {
    if (!typeObj) return { type: null, length: null };
    if (typeof typeObj === 'string') return { type: typeObj, length: null };
    
    let typeName = typeObj.name || (typeObj.type && (typeObj.type.name || typeObj.type.toString()));
    let length = typeObj.length || typeObj.precision || null;

    if (!typeName && typeof typeObj === 'function') {
        typeName = typeObj.name;
    }

    return { type: typeName || null, length };
}

// HTTP Proxy Request for On-Prem Gateway
class GatewayProxyRequest {
    constructor(gatewayUrl, apiKey) {
        this.gatewayUrl = gatewayUrl;
        this.apiKey = apiKey;
        this.inputs = [];
    }

    input(name, typeOrValue, value) {
        if (value !== undefined) {
            // Type specified: e.g. input('pin', sql.VarChar(100), pin)
            const { type, length } = extractSqlTypeInfo(typeOrValue);
            this.inputs.push({ name, type, length, value });
        } else {
            // Value only: e.g. input('pin', pin)
            this.inputs.push({ name, value: typeOrValue });
        }
        return this;
    }

    async query(queryString) {
        try {
            const response = await axios.post(
                `${this.gatewayUrl.replace(/\/$/, '')}/api/v1/db/query`,
                {
                    query: queryString,
                    inputs: this.inputs
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': this.apiKey
                    },
                    timeout: 35000
                }
            );

            if (response.data && response.data.success) {
                return {
                    recordset: response.data.recordset || [],
                    recordsets: response.data.recordsets || [response.data.recordset || []],
                    rowsAffected: response.data.rowsAffected || []
                };
            } else {
                throw new Error(response.data?.error || 'Unknown gateway query execution error');
            }
        } catch (error) {
            const errorDetails = error.response?.data?.error || error.message;
            console.error(`❌ Gateway Proxy Query Error [${this.gatewayUrl}]:`, errorDetails);
            if (Sentry && typeof Sentry.captureException === 'function') {
                Sentry.captureException(error);
            }
            throw error;
        }
    }
}

// HTTP Proxy Pool for On-Prem Gateway
class GatewayProxyPool {
    constructor(gatewayUrl, apiKey) {
        this.gatewayUrl = gatewayUrl;
        this.apiKey = apiKey;
        this.connected = true;
    }

    request() {
        return new GatewayProxyRequest(this.gatewayUrl, this.apiKey);
    }
}

let directPool = null;

async function getConnection() {
    const { gatewayUrl, apiKey } = getGatewayConfig();

    if (gatewayUrl && apiKey) {
        // Mode 1: HTTP Gateway Proxy Mode (e.g. deployed on Render)
        return new GatewayProxyPool(gatewayUrl, apiKey);
    }

    // Mode 2: Direct Database Connection Mode (e.g. running locally / on-prem)
    try {
        if (directPool && directPool.connected) {
            return directPool;
        }
        directPool = await sql.connect(dbsetttings);
        return directPool;
    } catch (error) {
        console.error('❌ Direct SQL Connection Error:', error.message);
        if (Sentry && typeof Sentry.captureException === 'function') {
            Sentry.captureException(error);
        }
        throw error;
    }
}

// MySQL compatibility layer for legacy routes importing mysqlConnect
const mysqlConnect = {
    query: async (queryStr, valuesOrCb, maybeCb) => {
        let values = [];
        let callback = null;
        if (typeof valuesOrCb === 'function') {
            callback = valuesOrCb;
        } else {
            values = valuesOrCb;
            callback = maybeCb;
        }

        try {
            const pool = await getConnection();
            const req = pool.request();
            const result = await req.query(queryStr);
            const rows = result.recordset || [];
            if (typeof callback === 'function') {
                callback(null, rows);
            }
            return rows;
        } catch (err) {
            if (typeof callback === 'function') {
                callback(err, null);
            } else {
                throw err;
            }
        }
    }
};

module.exports = { getConnection, mysqlConnect };